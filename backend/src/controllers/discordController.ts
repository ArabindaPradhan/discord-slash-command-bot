import { Request, Response, NextFunction } from 'express';
import { handleInteraction } from '../integrations/discord/interactionHandler';
import { discordServerService } from '../services/discordServerService';
import { discordApiClient } from '../integrations/discord/discordApiClient';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DiscordInteractionPayload } from '../types';

export const discordController = {
  /**
   * POST /api/v1/discord/interactions
   * This endpoint is called by Discord for all interaction events.
   * Ed25519 signature verification happens in middleware before this runs.
   */
  async handleInteraction(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const payload = req.body as DiscordInteractionPayload;

      // Immediately respond to PING (Discord endpoint validation)
      if (payload.type === 1) {
        res.status(200).json({ type: 1 });
        return;
      }

      const response = await handleInteraction(payload);
      res.status(200).json(response);
    } catch (err) {
      logger.error('Interaction handling error', {
        operation: 'discord_interaction',
        error: err instanceof Error ? err.message : String(err),
      });
      // Return a safe fallback rather than propagating the error
      res.status(200).json({
        type: 4,
        data: { content: 'An error occurred while processing your request.' },
      });
    }
  },

  /**
   * GET /api/v1/discord/servers
   */
  async getServers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const servers = await discordServerService.getAllServers();
      res.status(200).json({ success: true, data: servers });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/discord/servers
   */
  async connectServer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { guild_id, guild_name } = req.body as {
        guild_id?: string;
        guild_name?: string;
      };

      if (!guild_id || !guild_name) {
        res.status(400).json({ success: false, error: 'guild_id and guild_name are required' });
        return;
      }

      if (typeof guild_id !== 'string' || typeof guild_name !== 'string') {
        res.status(400).json({ success: false, error: 'Invalid input' });
        return;
      }

      const server = await discordServerService.connectServer(guild_id, guild_name);
      res.status(201).json({ success: true, data: server });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/v1/discord/servers/:id
   */
  async updateServer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { mirror_webhook_url } = req.body as { mirror_webhook_url?: string | null };

      const server = await discordServerService.getServerByPublicId(idParam);
      if (!server) {
        res.status(404).json({ success: false, error: 'Server not found' });
        return;
      }

      if (mirror_webhook_url !== undefined) {
        await discordServerService.setMirrorWebhook(server.id, mirror_webhook_url ?? null);
      }

      // Re-fetch to get updated state (without webhook URL)
      const updated = await discordServerService.getServerByPublicId(idParam);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/discord/register-commands
   */
  async registerCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { guild_id } = req.body as { guild_id?: string };
      await discordApiClient.registerSlashCommands(guild_id ?? config.discord.testGuildId ?? undefined);
      res.status(200).json({ success: true, message: 'Commands registered successfully' });
    } catch (err) {
      next(err);
    }
  },
};
