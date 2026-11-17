import { verifyJwtToken } from '../services/authService.js';
import { gasClient } from '../services/gasClient.js';
import { sanitizeEmployee } from '../config/permissions.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      throw unauthorized('جلسة غير مصرح بها، يرجى تسجيل الدخول.');
    }

    const decoded = verifyJwtToken(token);
    const empRes = await gasClient.get('employees', decoded.sub).catch(() => null);
    const emp = empRes?.item;
    if (!emp) {
      throw unauthorized('الحساب غير موجود أو انتهت الجلسة.');
    }
    if (String(emp.status || '').toLowerCase() !== 'active') {
      throw forbidden('تم إيقاف هذا الحساب حاليًا.');
    }

    req.auth = {
      user: sanitizeEmployee(emp),
      jti: decoded.jti,
      token,
    };
    next();
  } catch (err) {
    next(err);
  }
}
