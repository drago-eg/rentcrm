import { Router } from 'express';
import * as customerCtrl from '../controllers/customerController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { requireFields } from '../utils/validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', customerCtrl.list);
router.post(
  '/',
  validateBody((body) => requireFields(body, [{ key: 'name', label: 'اسم العميل' }, { key: 'phone', label: 'رقم الجوال' }])),
  customerCtrl.create
);
router.put('/:id', customerCtrl.update);
router.delete('/:id', requireRole('general_manager', 'supervisor'), customerCtrl.remove);

export default router;
