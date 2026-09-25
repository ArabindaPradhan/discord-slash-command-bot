import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate, requireAdmin);

// GET /api/v1/dashboard/stats or /api/v1/stats
router.get('/dashboard/stats', dashboardController.getStats);
router.get('/stats', dashboardController.getStats);

// GET /api/v1/interactions
router.get('/interactions', dashboardController.listInteractions);

// GET /api/v1/interactions/:id
router.get('/interactions/:id', dashboardController.getInteraction);

// GET /api/v1/commands
router.get('/commands', dashboardController.listCommandConfigs);

// PATCH /api/v1/commands/:id
router.patch('/commands/:id', dashboardController.updateCommandConfig);

export default router;
