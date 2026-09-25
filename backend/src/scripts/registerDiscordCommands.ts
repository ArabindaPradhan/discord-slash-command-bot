import { config } from '../config';
import { discordApiClient } from '../integrations/discord/discordApiClient';

/**
 * Sanitize any log message to ensure bot tokens or sensitive secrets are not exposed.
 */
function sanitizeError(message: string): string {
  let safeMessage = message;
  if (config.discord.botToken) {
    safeMessage = safeMessage.split(config.discord.botToken).join('[REDACTED]');
  }
  return safeMessage;
}

async function registerCommandsScript(): Promise<void> {
  const guildId = config.discord.testGuildId;

  if (!guildId || !guildId.trim()) {
    console.error('Error: DISCORD_TEST_GUILD_ID is not configured or is empty.');
    process.exit(1);
  }

  console.log(`Registering Discord slash commands for test guild...`);
  await discordApiClient.registerSlashCommands(guildId.trim());
  console.log('Successfully registered Discord slash commands (/status, /report).');
}

registerCommandsScript()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeError(rawMessage);
    console.error('Failed to register Discord slash commands:', safeMessage);
    process.exit(1);
  });
