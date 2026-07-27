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
router.post('/clients', authenticateJWT, authorize(['Team Lead']), addClient);
router.get('/clients/:id/steps', authenticateJWT, getClientSteps);
router.put('/clients/:id/steps', authenticateJWT, authorize(['Team Lead']), updateClientSteps);
router.post('/inward', authenticateJWT, authorize(['Team Lead']), inward);
router.post('/outward', authenticateJWT, authorize(['Team Lead']), outward);
router.post('/return', authenticateJWT, authorize(['Team Lead']), customerReturn);
router.post('/redispatch', authenticateJWT, authorize(['Team Lead']), redispatch);
router.get('/transactions/:id', authenticateJWT, getTransactions);
router.get('/history/:id', authenticateJWT, getHistory);
router.post('/toggle/:id', authenticateJWT, authorize(['Team Lead']), toggleComplete);

export default router;
