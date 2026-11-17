import { Router } from 'express';
import * as resCtrl from '../controllers/reservationController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(requireAuth);

router.get('/', resCtrl.list);
router.post('/pull', requirePermission('pull_reservations'), resCtrl.pull);
router.post('/', requireRole('general_manager', 'supervisor'), resCtrl.create);
router.get('/:id', resCtrl.details);
router.put('/:id', requirePermission('edit_reservation_details'), resCtrl.update);
router.delete('/:id', requireRole('general_manager'), resCtrl.remove);
router.post('/:id/claim', requirePermission('claim_reservation'), resCtrl.claim);
router.post('/:id/unclaim', requirePermission('unclaim_reservation'), resCtrl.unclaim);
router.post('/:id/quick-status', requirePermission('quick_update_status'), resCtrl.quickStatus);
router.post('/:id/assign', requirePermission('assign_employees'), resCtrl.assign);
router.delete('/:id/assign/:employeeId', requirePermission('assign_employees'), resCtrl.unassign);

export default router;
