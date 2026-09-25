import { DiscordInteractionPayload, DiscordInteractionResponse } from '../../types';
import { interactionRepository, actionLogRepository } from '../../repositories/interactionRepository';
import { discordServerRepository, commandConfigRepository } from '../../repositories/discordRepository';
import { discordApiClient } from './discordApiClient';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Main Discord interaction handler.
 *
 * Flow:
 * 1. Extract guild/user from payload (already signature-verified by middleware).
 * 2. Attempt idempotent insert — if duplicate, return early.
 * 3. Determine the right handler for the command.
 * 4. Execute and record the result.
 * 5. Mirror to webhook if enabled.
 */
export async function handleInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  // PING — Discord endpoint validation
  if (payload.type === 1) {
    logger.info('Discord PING received', {
      operation: 'discord_interaction',
      type: 'PING',
      interactionId: payload.id,
    });
    return { type: 1 };
  }

  // Application command (slash command)
  if (payload.type === 2) {
    return handleSlashCommand(payload);
  }

  // Message component (button click etc.) — handled in future phase
  if (payload.type === 3) {
    return handleComponentInteraction(payload);
  }

  logger.warn('Unhandled interaction type', {
    operation: 'discord_interaction',
    type: payload.type,
    interactionId: payload.id,
  });

  return {
    type: 4,
    data: { content: 'Unknown interaction type.' },
  };
}

async function handleSlashCommand(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const commandName = payload.data?.name ?? 'unknown';
  const guildId = payload.guild_id ?? null;
  const discordUser = payload.member?.user ?? payload.user;
  const userId = discordUser?.id ?? null;
  const username = discordUser?.username ?? discordUser?.global_name ?? null;

  // 1. Application ID validation (Section 9)
  if (
    config.discord.applicationId &&
    payload.application_id &&
    payload.application_id !== config.discord.applicationId
  ) {
    logger.warn('Application ID mismatch', {
      operation: 'discord_interaction',
      expected: config.discord.applicationId,
      received: payload.application_id,
    });
    return {
      type: 4,
      data: { content: 'Invalid application ID.' },
    };
  }

  // Extract text option for /report
  const inputText = payload.data?.options
    ?.find(o => o.name === 'text')
    ?.value?.toString() ?? null;

  logger.info('Slash command received', {
    operation: 'discord_interaction',
    interactionId: payload.id,
    command: commandName,
    guildId,
    username,
  });

  // Look up the Discord server record
  let discordServer = null;
  if (guildId) {
    discordServer = await discordServerRepository.findByGuildId(guildId);
  }

  // Section 25: Unregistered server check
  if (guildId && !discordServer) {
    logger.warn('Slash command from unregistered server', {
      operation: 'discord_interaction',
      guildId,
      command: commandName,
    });
    return {
      type: 4,
      data: {
        content: 'This Discord server has not been configured in the bot dashboard yet. Please connect the server in the dashboard first.',
      },
    };
  }

  // Idempotent insert — the DB UNIQUE constraint protects against race conditions
  const { row: interaction, isDuplicate } = await interactionRepository.tryInsert({
    interaction_id: payload.id,
    discord_server_id: discordServer?.id ?? null,
    command_name: commandName,
    interaction_type: payload.type,
    user_id: userId,
    username,
    input_text: inputText,
  });

  if (isDuplicate) {
    logger.info('Duplicate interaction received — skipping', {
      operation: 'discord_interaction',
      interactionId: payload.id,
      command: commandName,
    });
    return {
      type: 4,
      data: { content: 'This interaction was already processed.' },
    };
  }

  // Check command config
  let commandConfig = null;
  if (discordServer) {
    commandConfig = await commandConfigRepository.findByServerAndCommand(
      discordServer.id,
      commandName,
    );
  }

  // Command disabled
  if (commandConfig && !commandConfig.enabled) {
    await interactionRepository.updateStatus(interaction.id, {
      status: 'failed',
      response_status: 'failed',
      mirror_status: 'skipped',
      error_message: 'Command is disabled',
      completed_at: new Date(),
    });
    await actionLogRepository.create({
      interaction_id: interaction.id,
      action_type: 'command_disabled_check',
      status: 'failed',
      error_message: 'Command is disabled in configuration',
    });
    return {
      type: 4,
      data: { content: 'This command is currently disabled.' },
    };
  }

  // Unknown command
  if (commandName !== 'status' && commandName !== 'report') {
    await interactionRepository.updateStatus(interaction.id, {
      status: 'failed',
      response_status: 'failed',
      mirror_status: 'skipped',
      error_message: 'Unknown command',
      completed_at: new Date(),
    });
    return {
      type: 4,
      data: { content: `Unknown command: \`/${commandName}\`` },
    };
  }

  // Build immediate response
  let responseContent: string;

  if (commandName === 'status') {
    responseContent = commandConfig?.response_template?.trim()
      ? commandConfig.response_template
      : 'System is operational. ✅';
  } else if (commandName === 'report') {
    const reportText = inputText ?? '(no text provided)';
    responseContent = commandConfig?.response_template?.trim()
      ? commandConfig.response_template.replace('{{text}}', reportText)
      : `Your report has been received: "${reportText}"`;
  } else {
    responseContent = 'Command processed.';
  }

  // Record Discord response success
  await interactionRepository.updateStatus(interaction.id, {
    response_status: 'sent',
  });
  await actionLogRepository.create({
    interaction_id: interaction.id,
    action_type: 'discord_response',
    status: 'success',
    details: { content: responseContent },
  });

  // Mirror to webhook (async — do not block the response)
  const mirrorEnabled = commandConfig?.mirror_enabled ?? true;
  if (mirrorEnabled && discordServer) {
    setImmediate(() => {
      void performMirror(interaction.id, {
        guildName: discordServer.guild_name,
        username: username ?? 'Unknown',
        commandName,
        inputText,
        discordServerId: discordServer.id,
      });
    });
  } else {
    await interactionRepository.updateStatus(interaction.id, {
      status: 'completed',
      mirror_status: 'skipped',
      completed_at: new Date(),
    });
  }

  return {
    type: 4,
    data: { content: responseContent },
  };
}

async function performMirror(
  interactionDbId: number,
  context: {
    guildName: string;
    username: string;
    commandName: string;
    inputText: string | null;
    discordServerId: number;
  },
): Promise<void> {
  try {
    let webhookUrl = await discordServerRepository.getWebhookUrl(context.discordServerId);
    if (!webhookUrl && config.discord.mirrorWebhookUrl) {
      webhookUrl = config.discord.mirrorWebhookUrl;
    }

    if (!webhookUrl) {
      await interactionRepository.updateStatus(interactionDbId, {
        status: 'completed',
        mirror_status: 'skipped',
        completed_at: new Date(),
      });
      await actionLogRepository.create({
        interaction_id: interactionDbId,
        action_type: 'mirror_webhook',
        status: 'skipped',
        details: { reason: 'No webhook URL configured' },
      });
      return;
    }

    const embed = {
      title: context.commandName === 'report' ? '📋 New Report Received' : '📡 Status Command Used',
      color: context.commandName === 'report' ? 0x5865F2 : 0x57F287,
      fields: [
        { name: 'Server', value: context.guildName, inline: true },
        { name: 'User', value: context.username, inline: true },
        { name: 'Command', value: `/${context.commandName}`, inline: true },
        ...(context.inputText
          ? [{ name: 'Report', value: context.inputText }]
          : []),
      ],
      footer: { text: 'Discord Bot Dashboard' },
      timestamp: new Date().toISOString(),
    };

    await discordApiClient.sendWebhookMessage(webhookUrl, { embeds: [embed] });

    await interactionRepository.updateStatus(interactionDbId, {
      status: 'completed',
      mirror_status: 'sent',
      completed_at: new Date(),
    });
    await actionLogRepository.create({
      interaction_id: interactionDbId,
      action_type: 'mirror_webhook',
      status: 'success',
    });

    logger.info('Mirror webhook sent', {
      operation: 'discord_mirror',
      interactionDbId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error('Mirror webhook failed', {
      operation: 'discord_mirror',
      interactionDbId,
      error: errorMessage,
    });

    await interactionRepository.updateStatus(interactionDbId, {
      status: 'completed',
      mirror_status: 'failed',
      error_message: `Mirror failed: ${errorMessage}`,
      completed_at: new Date(),
    });
    await actionLogRepository.create({
      interaction_id: interactionDbId,
      action_type: 'mirror_webhook',
      status: 'failed',
      error_message: errorMessage,
    });
  }
}

async function handleComponentInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const customId = payload.data?.custom_id ?? 'unknown';
  logger.info('Component interaction received', {
    operation: 'discord_interaction',
    type: 'COMPONENT',
    customId,
    interactionId: payload.id,
  });

  // Placeholder — full implementation in Phase 7 (stretch goals)
  return {
    type: 4,
    data: { content: 'Button interaction received.' },
  };
}
