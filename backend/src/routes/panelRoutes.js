import { 
  getPanels, searchPanel, assignPanel, progressRepair, importPanels, patchPanel, deletePanel, createPanel, clearLotPanels,
  uploadExcel, getExcelData, saveCellEdit, exportExcel
} from '../controllers/panelController.js';
import { authenticateJWT, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/panels', authenticateJWT, getPanels);
router.get('/panels/search', authenticateJWT, searchPanel);
router.post('/repair/assign', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead']), assignPanel);
router.post('/repair/next', authenticateJWT, progressRepair);
router.post('/panels/import', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), importPanels);
router.post('/panels', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), createPanel);
router.patch('/panels/:id', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), patchPanel);
router.delete('/panels/clear', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), clearLotPanels);
router.delete('/panels/:id', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), deletePanel);

// Excel raw sheet exact import endpoints
router.post('/lots/:id/upload-excel', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), uploadExcel);
router.get('/lots/:id/excel-data', authenticateJWT, getExcelData);
router.post('/lots/:id/cell-edit', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), saveCellEdit);
router.get('/lots/:id/export-excel', authenticateJWT, authorize(['Superadmin', 'Manager', 'Team Lead', 'Employee']), exportExcel);

export default router;
