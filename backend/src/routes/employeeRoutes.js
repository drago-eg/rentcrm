import { Router } from 'express';
import * as empCtrl from '../controllers/employeeController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(requireAuth);

router.get('/', empCtrl.list);
router.post('/', requirePermission('manage_employees'), empCtrl.create);
router.post('/presets', requirePermission('manage_employees'), empCtrl.savePreset);
router.post('/presets/reset', requirePermission('manage_employees'), empCtrl.resetPresets);
router.delete('/presets/:id', requirePermission('manage_employees'), empCtrl.removePreset);
router.post('/permissions-def', requirePermission('manage_employees'), empCtrl.savePermissionDef);
router.delete('/permissions-def/:key', requirePermission('manage_employees'), empCtrl.removePermissionDef);
router.get('/:id', requirePermission('view_employees'), empCtrl.details);
router.put('/:id', requirePermission('manage_employees'), empCtrl.update);
router.patch('/:id/status', requirePermission('manage_employees'), empCtrl.toggleStatus);
router.delete('/:id', requirePermission('manage_employees'), empCtrl.remove);

export default router;
