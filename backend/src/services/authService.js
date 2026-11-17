import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnvConfig } from '../config/env.js';
import { sanitizeEmployee } from '../config/permissions.js';
import { unauthorized, badRequest, forbidden } from '../utils/errors.js';
import { normalizeStr } from '../utils/validators.js';
import { nowIso, todayDateStr, currentTime24Str } from '../utils/dateUtils.js';
import { gasClient } from './gasClient.js';

function legacyGasSha256(password, salt) {
  return crypto
    .createHash('sha256')
    .update(`${String(salt)}::RENTAL_GATE_CRM::${String(password)}`)
    .digest('hex');
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

export async function verifyPassword(plainPassword, storedHash, legacySalt = '') {
  const hash = normalizeStr(storedHash);
  if (!hash) return { valid: false, needsRehash: false };

  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    const valid = await bcrypt.compare(String(plainPassword), hash);
    return { valid, needsRehash: false };
  }

  // Seamless compatibility if an existing Google Sheet row uses legacy GAS SHA-256 hash
  const legacyExpected = legacyGasSha256(plainPassword, legacySalt);
  const valid = legacyExpected === hash;
  return { valid, needsRehash: valid };
}

export function issueJwtToken(user) {
  const { jwtSecret, jwtExpiresIn } = getEnvConfig();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured on the server.');
  }
  const jti = crypto.randomUUID();
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    jti,
  };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  return { token, jti };
}

export function verifyJwtToken(token) {
  const { jwtSecret } = getEnvConfig();
  if (!jwtSecret) {
    throw unauthorized('خادم المصادقة غير مهيأ (JWT_SECRET مفقود).');
  }
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    throw unauthorized('انتهت صلاحية الجلسة أو التوكن غير صالح.');
  }
}

export async function loginWithCredentials(username, password) {
  const cleanUsername = normalizeStr(username).toLowerCase();
  const cleanPassword = String(password || '');
  if (!cleanUsername || !cleanPassword) {
    throw badRequest('يرجى إدخال اسم المستخدم وكلمة المرور.');
  }

  const listRes = await gasClient.list('employees', { skipCache: 'true' });
  let employees = listRes?.items || [];

  // Auto-initialize sheet tabs & initial admin if spreadsheet is completely fresh
  if (employees.length === 0) {
    await gasClient.initDatabase();
    const afterInit = await gasClient.list('employees', { skipCache: 'true' });
    employees = afterInit?.items || [];
  }

  const user = employees.find(
    (e) => normalizeStr(e.username).toLowerCase() === cleanUsername
  );

  if (!user) {
    throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }

  if (normalizeStr(user.status).toLowerCase() !== 'active') {
    throw forbidden('هذا الحساب موقوف حاليًا. يرجى مراجعة المدير العام.');
  }

  const check = await verifyPassword(cleanPassword, user.passwordHash, user.salt);
  if (!check.valid) {
    throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }

  const now = nowIso();
  const empPatch = { lastActivity: now };
  if (check.needsRehash) {
    empPatch.passwordHash = await hashPassword(cleanPassword);
    empPatch.salt = '';
  }

  const updatedRes = await gasClient.update('employees', user.id, empPatch);
  const updatedEmp = updatedRes?.item || { ...user, ...empPatch };

  const { token, jti } = issueJwtToken(updatedEmp);

  // Record session for audit & revocation tracking
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await gasClient.create('sessions', {
    tokenHash: jti,
    employeeId: updatedEmp.id,
    username: updatedEmp.username,
    role: updatedEmp.role,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    isRevoked: 'false',
  }, { allowDuplicate: true }).catch(() => {});

  await gasClient.create('activity_log', {
    userId: updatedEmp.id,
    userName: updatedEmp.name,
    userRole: updatedEmp.role,
    actionType: 'تسجيل الدخول',
    entityType: 'Employee',
    entityId: updatedEmp.id,
    details: `تسجيل دخول ناجح للمستخدم ${updatedEmp.username}`,
    logDate: todayDateStr(),
    logTime: currentTime24Str(),
  }, { allowDuplicate: true }).catch(() => {});

  return {
    token,
    expiresAt,
    user: sanitizeEmployee(updatedEmp),
  };
}

export async function logoutSession(authContext) {
  if (authContext?.jti) {
    await gasClient.update('sessions', authContext.jti, {
      isRevoked: 'true',
      lastSeenAt: nowIso(),
    }).catch(() => {});
  }
  if (authContext?.user) {
    await gasClient.create('activity_log', {
      userId: authContext.user.id,
      userName: authContext.user.name,
      userRole: authContext.user.role,
      actionType: 'تسجيل الخروج',
      entityType: 'Employee',
      entityId: authContext.user.id,
      details: 'تسجيل خروج',
      logDate: todayDateStr(),
      logTime: currentTime24Str(),
    }, { allowDuplicate: true }).catch(() => {});
  }
  return { loggedOut: true };
}
