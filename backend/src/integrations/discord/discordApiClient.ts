import https from 'https';
import { URL } from 'url';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DiscordInteractionResponse, DiscordEmbed } from '../../types';

/**
 * Minimal Discord REST client — does NOT use any Discord SDK.
 * Uses Node's built-in https module to avoid unnecessary dependencies.
 * Never logs bot token or any secrets.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function makeRequest(
  urlStr: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot/1.0',
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

function authHeaders(): Record<string, string> {
  // Never log this token
  return { Authorization: `Bot ${config.discord.botToken}` };
}

/**
 * Send a webhook POST — used for mirror channel notifications.
 * The webhook URL is passed in (fetched from DB by the caller) and never logged.
 */
export async function sendWebhookMessage(
  webhookUrl: string,
  payload: { content?: string; embeds?: DiscordEmbed[] },
): Promise<void> {
  // Validate the URL is a Discord webhook to prevent SSRF
  const parsed = new URL(webhookUrl);
  if (!parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com')) {
    throw new Error('Invalid webhook URL — must be a Discord domain');
  }

  const { status } = await makeRequest(webhookUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Webhook request failed with status ${status}`);
  }
}

/**
 * Edit an interaction response (follow-up after deferred response).
 */
export async function editInteractionResponse(
  applicationId: string,
  interactionToken: string,
  payload: DiscordInteractionResponse['data'],
): Promise<void> {
  const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  const { status } = await makeRequest(url, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (status < 200 || status >= 300) {
    logger.error('Failed to edit interaction response', {
      operation: 'discord_edit_response',
      status,
      // Do NOT log body — may contain sensitive data
    });
    throw new Error(`Failed to edit interaction response: HTTP ${status}`);
  }

  logger.debug('Interaction response edited', {
    operation: 'discord_edit_response',
    status,
    applicationId,
  });
}

/**
 * Register guild-specific slash commands (takes effect immediately).
 * For global commands, omit guildId (takes up to 1 hour to propagate).
 */
export async function registerSlashCommands(guildId?: string): Promise<void> {
  const commands = [
    {
      name: 'status',
      description: 'Check if the system is operational',
      type: 1,
    },
    {
      name: 'report',
      description: 'Submit a report or issue',
      type: 1,
      options: [
        {
          name: 'text',
          description: 'The report text',
          type: 3, // STRING
          required: true,
        },
      ],
    },
  ];

  const appId = config.discord.applicationId;
  const url = guildId
    ? `${DISCORD_API_BASE}/applications/${appId}/guilds/${guildId}/commands`
    : `${DISCORD_API_BASE}/applications/${appId}/commands`;

  const { status, body } = await makeRequest(url, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(commands),
  });

  if (status < 200 || status >= 300) {
    logger.error('Failed to register slash commands', {
      operation: 'discord_register_commands',
      status,
      guildId: guildId ?? 'global',
    });
    throw new Error(`Command registration failed: HTTP ${status}: ${body}`);
  }

  logger.info('Slash commands registered', {
    operation: 'discord_register_commands',
    guildId: guildId ?? 'global',
    commandCount: commands.length,
  });
}

/**
 * Fetch basic guild information.
 */
export async function getGuildInfo(guildId: string): Promise<{
  id: string;
  name: string;
} | null> {
  const url = `${DISCORD_API_BASE}/guilds/${guildId}`;
  const { status, body } = await makeRequest(url, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (status === 404) return null;
  if (status < 200 || status >= 300) {
    throw new Error(`Failed to fetch guild info: HTTP ${status}`);
  }

  const data = JSON.parse(body) as { id: string; name: string };
  return { id: data.id, name: data.name };
}

export const discordApiClient = {
  sendWebhookMessage,
  editInteractionResponse,
  registerSlashCommands,
  getGuildInfo,
};
