import { canAccessApi, hasPermission } from '../config/permissions.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    const user = req.auth?.user;
    if (!user) return next(unauthorized());
    if (!allowedRoles.includes(user.role)) {
      return next(forbidden('ليس لديك الصلاحية الوظيفية اللازمة لتنفيذ هذا الإجراء.'));
    }
    return next();
  };
}

export function requirePermission(permissionKey) {
  return (req, _res, next) => {
    const user = req.auth?.user;
    if (!user) return next(unauthorized());
    if (!hasPermission(user, permissionKey)) {
      return next(forbidden(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionKey}).`));
    }
    return next();
  };
}

export function requireApiAccess(req, _res, next) {
  const user = req.auth?.user;
  if (!user) return next(unauthorized());
  if (!canAccessApi(user)) {
    return next(forbidden('إعدادات الربط والمزامنة مخصصة للمدير العام والمشرف فقط.'));
  }
  return next();
}
