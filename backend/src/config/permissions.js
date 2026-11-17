import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./coreDomain.cjs');

export const ROLES = core.ROLES;
export const ROLE_PERMISSION_MATRIX = core.ROLE_PERMISSION_MATRIX;
export const JOB_ROLE_PRESETS = core.JOB_ROLE_PRESETS;
export const FOLLOWUP_STATUSES = core.FOLLOWUP_STATUSES;
export const PROBLEM_PRIORITIES = core.PROBLEM_PRIORITIES;
export const PROBLEM_STATUSES = core.PROBLEM_STATUSES;
export const TASK_STATUSES = ['جديدة', 'قيد التنفيذ', 'بانتظار المراجعة', 'مكتملة', 'ملغاة'];
export const TASK_PRIORITIES = ['عادي', 'متوسط', 'مرتفع', 'عاجل'];

export function resolveEffectivePermissions(userOrRole) {
  return core.resolveEffectivePermissions(userOrRole);
}

export function canAccessApi(userOrRole) {
  return core.canAccessApi(userOrRole);
}

export function hasPermission(userOrRole, action) {
  return core.canUserPerform(userOrRole, action);
}

export function normalizeRolePresets(raw) {
  return core.normalizeRolePresets(raw);
}

export function sanitizeEmployee(emp) {
  if (!emp) return null;
  const { passwordHash, salt, ...safe } = emp;
  return {
    ...safe,
    permissions: resolveEffectivePermissions(emp),
  };
}

export { core };
