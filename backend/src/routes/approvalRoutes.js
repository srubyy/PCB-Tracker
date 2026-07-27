import express from 'express';
import { getApprovals, tlApprove, rejectLog } from '../controllers/approvalController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/approvals', authenticateJWT, authorize(['Team Lead']), getApprovals);
router.post('/approvals/tl-approve', authenticateJWT, authorize(['Team Lead']), tlApprove);
router.post('/approvals/reject', authenticateJWT, authorize(['Team Lead']), rejectLog);

export default router;
