import express from 'express';
import { scanItem, completeCheckpoint, getCheckpointReport, acknowledgeCheckpoint, resolveMissing } from '../controllers/auditController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/audit/scan', authenticateJWT, scanItem);
router.post('/audit/complete', authenticateJWT, authorize(['Team Lead', 'Employee']), completeCheckpoint);
router.get('/audit/report/:lotId/:step', authenticateJWT, getCheckpointReport);
router.post('/audit/acknowledge', authenticateJWT, authorize(['Team Lead']), acknowledgeCheckpoint);
router.post('/audit/resolve-missing', authenticateJWT, authorize(['Team Lead']), resolveMissing);

export default router;
