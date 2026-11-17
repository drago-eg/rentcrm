import { Router } from 'express';
import * as fuCtrl from '../controllers/followupController.js';
import * as prbCtrl from '../controllers/problemController.js';
import * as taskCtrl from '../controllers/taskController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';

export const followupRouter = Router();
followupRouter.use(requireAuth);
followupRouter.get('/mine', fuCtrl.mine);
followupRouter.get('/team', fuCtrl.team);
followupRouter.get('/history/:reservationId', fuCtrl.history);
followupRouter.post('/', requirePermission('add_followup'), fuCtrl.create);
followupRouter.put('/:id', fuCtrl.update);
followupRouter.delete('/:id', requireRole('general_manager', 'supervisor'), fuCtrl.remove);

export const problemRouter = Router();
problemRouter.use(requireAuth);
problemRouter.get('/', prbCtrl.list);
problemRouter.post('/', requirePermission('create_problem'), prbCtrl.create);
problemRouter.put('/:id', requirePermission('update_problem'), prbCtrl.update);
problemRouter.delete('/:id', requireRole('general_manager', 'supervisor'), prbCtrl.remove);

export const taskRouter = Router();
taskRouter.use(requireAuth);
taskRouter.get('/', taskCtrl.list);
taskRouter.post('/', taskCtrl.create);
taskRouter.put('/:id', taskCtrl.update);
taskRouter.delete('/:id', requireRole('general_manager', 'supervisor'), taskCtrl.remove);
