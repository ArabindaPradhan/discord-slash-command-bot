import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Auth middleware for protected dashboard endpoints
const auth = [authenticate, requireAdmin];

// GET /api/v1/dashboard/stats or /api/v1/stats
router.get('/dashboard/stats', auth, dashboardController.getStats);
router.get('/stats', auth, dashboardController.getStats);

// GET /api/v1/interactions
router.get('/interactions', auth, dashboardController.listInteractions);

// GET /api/v1/interactions/:id
router.get('/interactions/:id', auth, dashboardController.getInteraction);

// GET /api/v1/commands
router.get('/commands', auth, dashboardController.listCommandConfigs);

// PATCH /api/v1/commands/:id
router.patch('/commands/:id', auth, dashboardController.updateCommandConfig);

export default router;
