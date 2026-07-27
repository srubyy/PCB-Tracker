import express from 'express';
import { scanItem, completeCheckpoint, getCheckpointReport } from '../controllers/auditController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/audit/scan', authenticateJWT, scanItem);
router.post('/audit/complete', authenticateJWT, authorize(['Superadmin', 'Team Lead', 'Employee']), completeCheckpoint);
router.get('/audit/report/:lotId/:step', authenticateJWT, getCheckpointReport);

export default router;
