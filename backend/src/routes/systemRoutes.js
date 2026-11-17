import { Router } from 'express';
import * as dashCtrl from '../controllers/dashboardController.js';
import * as reportCtrl from '../controllers/reportController.js';
import * as actCtrl from '../controllers/activityController.js';
import * as notifCtrl from '../controllers/notificationController.js';
import * as setCtrl from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireApiAccess, requirePermission } from '../middleware/rbac.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get('/', dashCtrl.getDashboard);

export const reportRouter = Router();
reportRouter.use(requireAuth);
reportRouter.get('/', reportCtrl.getReports);

export const activityRouter = Router();
activityRouter.use(requireAuth);
activityRouter.get('/', actCtrl.list);

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get('/', notifCtrl.list);
notificationRouter.post('/mark-read', notifCtrl.markRead);

export const settingsRouter = Router();
settingsRouter.use(requireAuth);
settingsRouter.get('/', setCtrl.getSettings);
settingsRouter.put('/', requirePermission('manage_settings'), setCtrl.updateSettings);
settingsRouter.get('/sync-status', requireApiAccess, setCtrl.syncStatus);
settingsRouter.post('/sync', requireApiAccess, requirePermission('sync_data'), setCtrl.syncNow);
settingsRouter.post('/test-connection', requireApiAccess, setCtrl.testConnection);
settingsRouter.post('/test-db', requireApiAccess, setCtrl.testDatabaseConnection);
settingsRouter.post('/api-token', requireApiAccess, setCtrl.saveToken);
