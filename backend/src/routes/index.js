import { Router } from 'express';
import { getEnvConfig } from '../config/env.js';
import authRoutes from './authRoutes.js';
import customerRoutes from './customerRoutes.js';
import reservationRoutes from './reservationRoutes.js';
import { followupRouter, problemRouter, taskRouter } from './workflowRoutes.js';
import employeeRoutes from './employeeRoutes.js';
import excelRoutes from './excelRoutes.js';
import {
  dashboardRouter,
  reportRouter,
  activityRouter,
  notificationRouter,
  settingsRouter,
} from './systemRoutes.js';

const router = Router();

router.get('/health', (_req, res) => {
  const cfg = getEnvConfig();
  res.json({
    success: true,
    message: 'RENTAL GATE CRM Backend is running.',
    data: {
      service: 'RENTAL GATE CRM API',
      status: 'ok',
      gasConfigured: Boolean(cfg.gasWebAppUrl),
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRouter);
router.use('/customers', customerRoutes);
router.use('/reservations', reservationRoutes);
router.use('/followups', followupRouter);
router.use('/problems', problemRouter);
router.use('/tasks', taskRouter);
router.use('/employees', employeeRoutes);
router.use('/reports', reportRouter);
router.use('/excel', excelRoutes);
router.use('/activity', activityRouter);
router.use('/notifications', notificationRouter);
router.use('/settings', settingsRouter);

export default router;
