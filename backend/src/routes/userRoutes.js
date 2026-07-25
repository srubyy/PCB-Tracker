import express from 'express';
import { getUsers, createUser, toggleUserStatus, dispatchEmail } from '../controllers/userController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/admin/users', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), getUsers);
router.post('/admin/users', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), createUser);
router.post('/admin/users/toggle/:id', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), toggleUserStatus);
router.post('/admin/email/dispatch', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), dispatchEmail);

export default router;
