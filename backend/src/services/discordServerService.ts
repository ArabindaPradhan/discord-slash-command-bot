import { discordServerRepository, commandConfigRepository } from '../repositories/discordRepository';
import { DiscordServer, CommandConfig } from '../types';
import { logger } from '../utils/logger';

const DEFAULT_COMMANDS = [
  {
    name: 'status',
    response_template: 'System is operational. ✅',
    mirror_enabled: true,
    ai_enabled: false,
  },
  {
    name: 'report',
    response_template: 'Your report has been received. Thank you!',
    mirror_enabled: true,
    ai_enabled: false,
  },
];

export const discordServerService = {
  async getAllServers(): Promise<DiscordServer[]> {
    return discordServerRepository.findAll();
  },

  async getServerByPublicId(publicId: string): Promise<DiscordServer | null> {
    return discordServerRepository.findByPublicId(publicId);
  },

  /**
   * Register or update a Discord server in the database.
   * Also bootstraps default command configurations.
   */
  async connectServer(guildId: string, guildName: string): Promise<DiscordServer> {
    const server = await discordServerRepository.create(guildId, guildName);

    // Bootstrap default command configs if not already present
    for (const cmd of DEFAULT_COMMANDS) {
      await commandConfigRepository.upsert(server.id, cmd.name, {
        response_template: cmd.response_template,
        mirror_enabled: cmd.mirror_enabled,
        ai_enabled: cmd.ai_enabled,
        enabled: true,
      });
    }

    logger.info('Discord server connected', {
      operation: 'discord_server_connect',
      guildId,
      guildName,
      serverId: server.id,
    });

    return server;
  },

  /**
   * Configure the mirror webhook URL for a server.
   * The URL is stored only on the server — never returned to clients.
   */
  async setMirrorWebhook(serverId: number, webhookUrl: string | null): Promise<void> {
    await discordServerRepository.updateWebhook(serverId, webhookUrl);
    logger.info('Mirror webhook updated', {
      operation: 'discord_webhook_update',
      serverId,
      configured: webhookUrl !== null,
    });
  },

  async getCommandConfigs(serverId: number): Promise<CommandConfig[]> {
    return commandConfigRepository.findByServerId(serverId);
  },

  async updateCommandConfig(
    publicId: string,
    updates: Partial<Pick<CommandConfig, 'enabled' | 'response_template' | 'mirror_enabled' | 'ai_enabled'>>,
  ): Promise<CommandConfig | null> {
    const config = await commandConfigRepository.findByPublicId(publicId);
    if (!config) return null;

    const updated = await commandConfigRepository.update(config.id, updates);

    logger.info('Command config updated', {
      operation: 'command_config_update',
      publicId,
      updates,
    });

    return updated;
  },
};
