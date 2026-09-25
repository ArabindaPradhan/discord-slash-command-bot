import { Request, Response, NextFunction } from 'express';
import { interactionRepository, actionLogRepository } from '../repositories/interactionRepository';
import { discordServerService } from '../services/discordServerService';

export const dashboardController = {
  /**
   * GET /api/v1/dashboard/stats
   */
  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await interactionRepository.getStats();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/interactions
   */
  async listInteractions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pageRaw = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const page = Math.max(1, parseInt((pageRaw as string | undefined) ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((limitRaw as string | undefined) ?? '50', 10)));
      const offset = (page - 1) * limit;

      const { rows, total } = await interactionRepository.findAll({ limit, offset });

      res.status(200).json({
        success: true,
        data: rows,
        total,
        page,
        limit,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/interactions/:id
   */
  async getInteraction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid interaction ID' });
        return;
      }

      const interaction = await interactionRepository.findById(id);
      if (!interaction) {
        res.status(404).json({ success: false, error: 'Interaction not found' });
        return;
      }

      const actionLogs = await actionLogRepository.findByInteractionId(interaction.id);

      res.status(200).json({
        success: true,
        data: { interaction, actionLogs },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/commands
   */
  async listCommandConfigs(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const servers = await discordServerService.getAllServers();
      const result = [];

      for (const server of servers) {
        const configs = await discordServerService.getCommandConfigs(server.id);
        result.push({ server, configs });
      }

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/v1/commands/:id
   */
  async updateCommandConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { enabled, response_template, mirror_enabled, ai_enabled } = req.body as {
        enabled?: boolean;
        response_template?: string;
        mirror_enabled?: boolean;
        ai_enabled?: boolean;
      };

      const updated = await discordServerService.updateCommandConfig(idParam, {
        enabled,
        response_template,
        mirror_enabled,
        ai_enabled,
      });

      if (!updated) {
        res.status(404).json({ success: false, error: 'Command config not found' });
        return;
      }

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};
