import express from 'express';
import { 
  getStock, 
  getClients, 
  inward, 
  outward, 
  customerReturn, 
  redispatch, 
  getTransactions, 
  getHistory, 
  toggleComplete,
  addClient,
  getClientSteps,
  updateClientSteps
} from '../controllers/stockController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateJWT, getStock);
router.get('/clients', authenticateJWT, getClients);
router.post('/clients', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), addClient);
router.get('/clients/:id/steps', authenticateJWT, getClientSteps);
router.put('/clients/:id/steps', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), updateClientSteps);
router.post('/inward', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), inward);
router.post('/outward', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), outward);
router.post('/return', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), customerReturn);
router.post('/redispatch', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), redispatch);
router.get('/transactions/:id', authenticateJWT, getTransactions);
router.get('/history/:id', authenticateJWT, getHistory);
router.post('/toggle/:id', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), toggleComplete);

export default router;
