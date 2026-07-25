import express from 'express';
import { login, refresh, logout, loginWithGoogle } from '../controllers/authController.js';
import { authenticateJWT } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/google-login', loginWithGoogle);
router.post('/refresh', refresh);
router.post('/logout', authenticateJWT, logout);

export default router;
