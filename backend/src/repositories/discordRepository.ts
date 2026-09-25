import { query, queryOne, execute } from '../config/database';
import { DiscordServer, CommandConfig } from '../types';

export const discordServerRepository = {
  async findAll(): Promise<DiscordServer[]> {
    return query<DiscordServer>(
      `SELECT id, public_id, guild_id, guild_name, bot_configured,
              mirror_webhook_configured, created_at, updated_at
       FROM discord_servers
       ORDER BY created_at DESC`,
    );
  },

  async findByPublicId(publicId: string): Promise<DiscordServer | null> {
    return queryOne<DiscordServer>(
      `SELECT id, public_id, guild_id, guild_name, bot_configured,
              mirror_webhook_configured, created_at, updated_at
       FROM discord_servers WHERE public_id = $1`,
      [publicId],
    );
  },

  async findByGuildId(guildId: string): Promise<DiscordServer | null> {
    return queryOne<DiscordServer>(
      `SELECT id, public_id, guild_id, guild_name, bot_configured,
              mirror_webhook_configured, created_at, updated_at
       FROM discord_servers WHERE guild_id = $1`,
      [guildId],
    );
  },

  /** Find by guild_id including the webhook URL (server-side only, never sent to client). */
  async findByGuildIdWithWebhook(guildId: string): Promise<(DiscordServer & { mirror_webhook_url: string | null }) | null> {
    return queryOne(
      `SELECT * FROM discord_servers WHERE guild_id = $1`,
      [guildId],
    );
  },

  async create(guildId: string, guildName: string): Promise<DiscordServer> {
    const row = await queryOne<DiscordServer>(
      `INSERT INTO discord_servers (guild_id, guild_name, bot_configured)
       VALUES ($1, $2, true)
       ON CONFLICT (guild_id)
       DO UPDATE SET guild_name = EXCLUDED.guild_name, updated_at = NOW()
       RETURNING id, public_id, guild_id, guild_name, bot_configured,
                 mirror_webhook_configured, created_at, updated_at`,
      [guildId, guildName],
    );
    if (!row) throw new Error('Failed to upsert Discord server');
    return row;
  },

  async updateWebhook(id: number, webhookUrl: string | null): Promise<void> {
    await execute(
      `UPDATE discord_servers
       SET mirror_webhook_url = $1,
           mirror_webhook_configured = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [webhookUrl, webhookUrl !== null, id],
    );
  },

  async getWebhookUrl(id: number): Promise<string | null> {
    const row = await queryOne<{ mirror_webhook_url: string | null }>(
      'SELECT mirror_webhook_url FROM discord_servers WHERE id = $1',
      [id],
    );
    return row?.mirror_webhook_url ?? null;
  },
};

export const commandConfigRepository = {
  async findByServerId(discordServerId: number): Promise<CommandConfig[]> {
    return query<CommandConfig>(
      `SELECT * FROM command_configs
       WHERE discord_server_id = $1
       ORDER BY command_name`,
      [discordServerId],
    );
  },

  async findByServerAndCommand(
    discordServerId: number,
    commandName: string,
  ): Promise<CommandConfig | null> {
    return queryOne<CommandConfig>(
      `SELECT * FROM command_configs
       WHERE discord_server_id = $1 AND command_name = $2`,
      [discordServerId, commandName],
    );
  },

  async findByPublicId(publicId: string): Promise<CommandConfig | null> {
    return queryOne<CommandConfig>(
      'SELECT * FROM command_configs WHERE public_id = $1',
      [publicId],
    );
  },

  async upsert(
    discordServerId: number,
    commandName: string,
    defaults: Partial<Pick<CommandConfig, 'response_template' | 'enabled' | 'mirror_enabled' | 'ai_enabled'>>,
  ): Promise<CommandConfig> {
    const row = await queryOne<CommandConfig>(
      `INSERT INTO command_configs
         (discord_server_id, command_name, enabled, response_template, mirror_enabled, ai_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (discord_server_id, command_name) DO NOTHING
       RETURNING *`,
      [
        discordServerId,
        commandName,
        defaults.enabled ?? true,
        defaults.response_template ?? '',
        defaults.mirror_enabled ?? true,
        defaults.ai_enabled ?? false,
      ],
    );
    // If already exists, fetch it
    if (!row) {
      const existing = await this.findByServerAndCommand(discordServerId, commandName);
      if (!existing) throw new Error('Failed to upsert command config');
      return existing;
    }
    return row;
  },

  async update(
    id: number,
    updates: Partial<Pick<CommandConfig, 'enabled' | 'response_template' | 'mirror_enabled' | 'ai_enabled'>>,
  ): Promise<CommandConfig | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }
    if (updates.response_template !== undefined) {
      fields.push(`response_template = $${paramIndex++}`);
      values.push(updates.response_template);
    }
    if (updates.mirror_enabled !== undefined) {
      fields.push(`mirror_enabled = $${paramIndex++}`);
      values.push(updates.mirror_enabled);
    }
    if (updates.ai_enabled !== undefined) {
      fields.push(`ai_enabled = $${paramIndex++}`);
      values.push(updates.ai_enabled);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    return queryOne<CommandConfig>(
      `UPDATE command_configs SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
  },
};
