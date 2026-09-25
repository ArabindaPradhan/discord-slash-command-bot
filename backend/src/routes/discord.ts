import { Router } from 'express';
import { discordController } from '../controllers/discordController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { captureRawBody, verifyDiscordSignature } from '../middleware/discordSignature';

const router = Router();

/**
 * POST /api/v1/discord/interactions
 *
 * Public endpoint called by Discord.
 * Security: Ed25519 signature verification BEFORE any business logic.
 *
 * Note: captureRawBody must be before JSON body parser.
 * express.json() is NOT applied to this route — raw body is captured manually.
 */
router.post(
  '/interactions',
  captureRawBody,
  verifyDiscordSignature,
  discordController.handleInteraction,
);

// Admin-protected routes below
router.use(authenticate, requireAdmin);

// GET /api/v1/discord/servers
router.get('/servers', discordController.getServers);

// POST /api/v1/discord/servers
router.post('/servers', discordController.connectServer);

// PATCH /api/v1/discord/servers/:id
router.patch('/servers/:id', discordController.updateServer);

// POST /api/v1/discord/register-commands
router.post('/register-commands', discordController.registerCommands);

export default router;
