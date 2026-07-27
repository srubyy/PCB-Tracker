import express from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateJWT, authorize(['Team Lead']), getDashboard);

export default router;
