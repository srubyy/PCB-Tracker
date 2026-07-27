import express from 'express';
import { 
  getPanels, searchPanel, assignPanel, progressRepair, importPanels, patchPanel, deletePanel, createPanel, clearLotPanels,
  uploadExcel, getExcelData, saveCellEdit, exportExcel, saveLotRules, saveLotStatus
} from '../controllers/panelController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/panels', authenticateJWT, getPanels);
router.get('/panels/search', authenticateJWT, searchPanel);
router.post('/repair/assign', authenticateJWT, authorize(['Team Lead']), assignPanel);
router.post('/repair/next', authenticateJWT, progressRepair);
router.post('/panels/import', authenticateJWT, authorize(['Team Lead', 'Employee']), importPanels);
router.post('/panels', authenticateJWT, authorize(['Team Lead', 'Employee']), createPanel);
router.patch('/panels/:id', authenticateJWT, authorize(['Team Lead', 'Employee']), patchPanel);
router.delete('/panels/clear', authenticateJWT, authorize(['Team Lead', 'Employee']), clearLotPanels);
router.delete('/panels/:id', authenticateJWT, authorize(['Team Lead', 'Employee']), deletePanel);

// Excel raw sheet exact import endpoints
router.post('/lots/:id/upload-excel', authenticateJWT, authorize(['Team Lead']), uploadExcel);
router.put('/lots/:id/rules', authenticateJWT, authorize(['Team Lead']), saveLotRules);
router.put('/lots/:id/status', authenticateJWT, authorize(['Team Lead']), saveLotStatus);
router.get('/lots/:id/excel-data', authenticateJWT, getExcelData);
router.post('/lots/:id/cell-edit', authenticateJWT, authorize(['Team Lead', 'Employee']), saveCellEdit);
router.get('/lots/:id/export-excel', authenticateJWT, authorize(['Team Lead', 'Employee']), exportExcel);

export default router;
