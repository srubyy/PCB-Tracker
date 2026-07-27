import express from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import stockRoutes from './stockRoutes.js';
import engineerRoutes from './engineerRoutes.js';
import panelRoutes from './panelRoutes.js';
import approvalRoutes from './approvalRoutes.js';
import productionRoutes from './productionRoutes.js';
import userRoutes from './userRoutes.js';
import auditRoutes from './auditRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/stock', stockRoutes);
router.use('/', engineerRoutes);
router.use('/', panelRoutes);
router.use('/', approvalRoutes);
router.use('/', productionRoutes);
router.use('/', userRoutes);
router.use('/', auditRoutes);

export default router;
