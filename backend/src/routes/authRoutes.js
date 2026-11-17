import { Router } from 'express';
import * as authCtrl from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requireFields } from '../utils/validators.js';

const router = Router();

router.post(
  '/login',
  validateBody((body) => requireFields(body, [{ key: 'username', label: 'اسم المستخدم' }, { key: 'password', label: 'كلمة المرور' }])),
  authCtrl.login
);
router.post('/logout', requireAuth, authCtrl.logout);
router.get('/me', requireAuth, authCtrl.me);
router.get('/bootstrap', requireAuth, authCtrl.bootstrap);

export default router;
