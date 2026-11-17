import { loginWithCredentials, logoutSession } from '../services/authService.js';
import { getAppBootstrapData } from '../services/crmDataService.js';

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    const data = await loginWithCredentials(username, password);
    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const data = await logoutSession(req.auth);
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ success: true, message: '', data: { user: req.auth.user }, error: null });
  } catch (err) {
    next(err);
  }
}

export async function bootstrap(req, res, next) {
  try {
    const data = await getAppBootstrapData(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}
