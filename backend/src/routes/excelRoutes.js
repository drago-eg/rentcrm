import { Router } from 'express';
import multer from 'multer';
import * as excelCtrl from '../controllers/excelController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(requireAuth);

router.get('/template/:entity', excelCtrl.downloadTemplate);
router.get('/export/:entity', requirePermission('export_reports'), excelCtrl.exportWorkbook);
router.post(
  '/preview',
  requireRole('general_manager', 'supervisor'),
  upload.single('file'),
  excelCtrl.previewImport
);
router.post(
  '/import',
  requireRole('general_manager', 'supervisor'),
  excelCtrl.commitImport
);

export default router;
