import {
  core,
  ROLES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  hasPermission,
  sanitizeEmployee,
  normalizeRolePresets,
} from '../config/permissions.js';
import { getEnvConfig } from '../config/env.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { formatDisplayDate, nowIso, todayDateStr, currentTime24Str } from '../utils/dateUtils.js';
import { normalizeStr, toNumber, toBool, isValidEmail, isValidPhone, normalizeRole } from '../utils/validators.js';
import { gasClient } from './gasClient.js';
import { hashPassword } from './authService.js';

function resolveRangeDates(payload = {}) {
  const range = normalizeStr(payload.range || '30d');
  const today = todayDateStr();
  if (range === 'today') return { start: today, end: today };
  if (range === '7d') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { start: formatDisplayDate(d), end: today };
  }
  if (range === 'month') {
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, end: today };
  }
  if (range === 'custom') {
    return {
      start: normalizeStr(payload.dateFrom),
      end: normalizeStr(payload.dateTo),
    };
  }
  const d30 = new Date();
  d30.setDate(d30.getDate() - 29);
  return { start: formatDisplayDate(d30), end: today };
}

function getSettingBool(settingsList, key, fallback = true) {
  const row = (settingsList || []).find((s) => s.key === key);
  if (!row) return fallback;
  return toBool(row.value);
}

function parseJsonField(val, fallback) {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

async function logActivity(user, actionType, entityType, entityId, details) {
  await gasClient
    .create(
      'activity_log',
      {
        userId: user?.id || 'system',
        userName: user?.name || 'النظام',
        userRole: user?.role || 'system',
        actionType,
        entityType,
        entityId: normalizeStr(entityId),
        details: normalizeStr(details),
        logDate: todayDateStr(),
        logTime: currentTime24Str(),
        createdAt: nowIso(),
      },
      { allowDuplicate: true }
    )
    .catch(() => {});
}

async function createNotificationsForRecipients(recipients, type, title, message, entityType, entityId) {
  if (!Array.isArray(recipients) || recipients.length === 0) return;
  const now = nowIso();
  const list = recipients.map((rec) => ({
    recipientEmployeeId: rec.id,
    recipientRole: rec.role || '',
    type,
    title,
    message,
    entityType,
    entityId: normalizeStr(entityId),
    isRead: 'false',
    createdAt: now,
  }));
  await gasClient.upsertBatch('notifications', 'id', list).catch(() => {});
}

export async function getDashboardData(user, payload = {}) {
  const snap = await gasClient.snapshot([
    'reservations',
    'followups',
    'problems',
    'employees',
    'tasks',
    'settings',
  ]);
  const allowAgentViewAll = getSettingBool(snap.settings, 'allow_agent_view_all', true);
  let reservations = snap.reservations || [];
  let followUps = snap.followups || [];
  let problems = snap.problems || [];
  let tasks = snap.tasks || [];
  const employees = (snap.employees || []).map(sanitizeEmployee);

  if (user.role === ROLES.AGENT && !allowAgentViewAll && !hasPermission(user, 'view_all_reservations')) {
    reservations = reservations.filter((r) => (r.assignedEmployeeIds || []).includes(user.id));
    followUps = followUps.filter((f) => f.employeeId === user.id);
    problems = problems.filter((p) => p.createdById === user.id || (p.assignedEmployeeIds || []).includes(user.id));
    tasks = tasks.filter((t) => t.assignedToId === user.id || t.createdById === user.id);
  }

  const dateRange = resolveRangeDates(payload);
  const metrics = core.computeDashboardMetrics(
    reservations,
    followUps,
    problems,
    employees,
    dateRange,
    todayDateStr()
  );
  metrics.kpis.openTasks = tasks.filter((t) => t.status !== 'مكتملة' && t.status !== 'ملغاة').length;
  return { ...metrics, range: payload.range || '30d', dateRange };
}

export async function getAppBootstrapData(user, payload = {}) {
  const snap = await gasClient.snapshot([
    'reservations',
    'followups',
    'problems',
    'employees',
    'notifications',
    'tasks',
    'settings',
  ]);
  const allowAgentViewAll = getSettingBool(snap.settings, 'allow_agent_view_all', true);

  let reservations = snap.reservations || [];
  let followUps = snap.followups || [];
  let problems = snap.problems || [];
  let tasks = snap.tasks || [];
  const employeesRaw = snap.employees || [];
  const employees = employeesRaw.map((emp) => ({
    ...sanitizeEmployee(emp),
    reservationsCount: reservations.filter((r) => (r.assignedEmployeeIds || []).includes(emp.id)).length,
    followUpsCount: followUps.filter((f) => f.employeeId === emp.id).length,
    problemsCount: problems.filter((p) => (p.assignedEmployeeIds || []).includes(emp.id)).length,
  }));

  if (user.role === ROLES.AGENT && !allowAgentViewAll && !hasPermission(user, 'view_all_reservations')) {
    reservations = reservations.filter((r) => (r.assignedEmployeeIds || []).includes(user.id));
    followUps = followUps.filter((f) => f.employeeId === user.id);
    problems = problems.filter((p) => p.createdById === user.id || (p.assignedEmployeeIds || []).includes(user.id));
    tasks = tasks.filter((t) => t.assignedToId === user.id || t.createdById === user.id);
  }

  const dashboard = core.computeDashboardMetrics(
    reservations,
    followUps,
    problems,
    employees,
    resolveRangeDates(payload),
    todayDateStr()
  );
  dashboard.kpis.openTasks = tasks.filter((t) => t.status !== 'مكتملة' && t.status !== 'ملغاة').length;

  const myNotifs = (snap.notifications || [])
    .filter((n) => n.recipientEmployeeId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const settingsMap = {};
  (snap.settings || []).forEach((s) => { settingsMap[s.key] = s.value; });

  return {
    dashboard: { ...dashboard, range: payload.range || '30d' },
    employees: {
      items: employees,
      rolePresets: normalizeRolePresets(parseJsonField(settingsMap.job_role_presets, null)),
      customPermissions: parseJsonField(settingsMap.permissions_catalog_custom, []),
    },
    notifications: {
      items: myNotifs.slice(0, 30),
      unreadCount: myNotifs.filter((n) => !n.isRead).length,
    },
  };
}

// =========================================================================
// CUSTOMERS CRUD
// =========================================================================
export async function listCustomers(query = {}) {
  const res = await gasClient.list('customers');
  let items = res?.items || [];
  const search = normalizeStr(query.search || query.q).toLowerCase();
  const status = normalizeStr(query.status);

  if (search) {
    items = items.filter((c) => {
      const hay = `${c.name || ''} ${c.phone || ''} ${c.email || ''} ${c.nationalId || ''} ${c.company || ''}`.toLowerCase();
      return hay.includes(search);
    });
  }
  if (status) {
    items = items.filter((c) => normalizeStr(c.status) === status);
  }
  items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  return { items, total: items.length };
}

export async function createCustomer(user, body) {
  const name = normalizeStr(body.name);
  const phone = normalizeStr(body.phone);
  const email = normalizeStr(body.email);
  if (!name) throw badRequest('اسم العميل مطلوب.');
  if (!phone || !isValidPhone(phone)) throw badRequest('رقم الجوال مطلوب ويجب أن يكون صحيحًا (7-15 رقمًا).');
  if (email && !isValidEmail(email)) throw badRequest('صيغة البريد الإلكتروني غير صالحة.');

  const record = {
    name,
    phone,
    email,
    nationalId: normalizeStr(body.nationalId),
    company: normalizeStr(body.company),
    notes: normalizeStr(body.notes),
    status: normalizeStr(body.status) || 'active',
  };

  const created = await gasClient.create('customers', record);
  await logActivity(user, 'إضافة عميل', 'Customer', created.item.id, `${name} (${phone})`);
  return { customer: created.item };
}

export async function updateCustomer(user, id, body) {
  const name = body.name !== undefined ? normalizeStr(body.name) : undefined;
  const phone = body.phone !== undefined ? normalizeStr(body.phone) : undefined;
  const email = body.email !== undefined ? normalizeStr(body.email) : undefined;

  if (name !== undefined && !name) throw badRequest('اسم العميل لا يمكن أن يكون فارغًا.');
  if (phone !== undefined && !isValidPhone(phone)) throw badRequest('صيغة رقم الجوال غير صالحة.');
  if (email !== undefined && email !== '' && !isValidEmail(email)) throw badRequest('صيغة البريد الإلكتروني غير صالحة.');

  const patch = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone;
  if (email !== undefined) patch.email = email;
  if (body.nationalId !== undefined) patch.nationalId = normalizeStr(body.nationalId);
  if (body.company !== undefined) patch.company = normalizeStr(body.company);
  if (body.notes !== undefined) patch.notes = normalizeStr(body.notes);
  if (body.status !== undefined) patch.status = normalizeStr(body.status) || 'active';

  const updated = await gasClient.update('customers', id, patch);
  await logActivity(user, 'تعديل بيانات عميل', 'Customer', id, updated.item.name);
  return { customer: updated.item };
}

export async function deleteCustomer(user, id) {
  await gasClient.remove('customers', id);
  await logActivity(user, 'حذف عميل', 'Customer', id, `تم حذف العميل ${id}`);
  return { deleted: true, id };
}

// =========================================================================
// TASKS CRUD
// =========================================================================
export async function listTasks(user, query = {}) {
  const res = await gasClient.list('tasks');
  let items = res?.items || [];

  if (user.role === ROLES.AGENT && !hasPermission(user, 'view_all_reservations')) {
    items = items.filter((t) => !t.assignedToId || t.assignedToId === user.id || t.createdById === user.id);
  }

  const search = normalizeStr(query.search || query.q).toLowerCase();
  const status = normalizeStr(query.status);
  const priority = normalizeStr(query.priority);
  const assignedToId = normalizeStr(query.assignedToId);

  if (search) {
    items = items.filter((t) =>
      `${t.title || ''} ${t.description || ''} ${t.reservationNumber || ''} ${t.customerName || ''}`
        .toLowerCase()
        .includes(search)
    );
  }
  if (status) items = items.filter((t) => t.status === status);
  if (priority) items = items.filter((t) => t.priority === priority);
  if (assignedToId) items = items.filter((t) => t.assignedToId === assignedToId);

  items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  return { items, total: items.length };
}

export async function createTask(user, body) {
  const title = normalizeStr(body.title);
  if (!title) throw badRequest('عنوان المهمة مطلوب.');

  const status = TASK_STATUSES.includes(body.status) ? body.status : 'جديدة';
  const priority = TASK_PRIORITIES.includes(body.priority) ? body.priority : 'عادي';
  let assignedToName = normalizeStr(body.assignedToName);
  const assignedToId = normalizeStr(body.assignedToId);

  if (assignedToId && !assignedToName) {
    const empRes = await gasClient.get('employees', assignedToId).catch(() => null);
    assignedToName = empRes?.item?.name || '';
  }

  const record = {
    title,
    description: normalizeStr(body.description),
    reservationId: normalizeStr(body.reservationId),
    reservationNumber: normalizeStr(body.reservationNumber),
    customerId: normalizeStr(body.customerId),
    customerName: normalizeStr(body.customerName),
    assignedToId,
    assignedToName,
    createdById: user.id,
    createdByName: user.name,
    priority,
    status,
    dueDate: body.dueDate ? formatDisplayDate(body.dueDate) : '',
  };

  const created = await gasClient.create('tasks', record, { allowDuplicate: true });
  await logActivity(user, 'إنشاء مهمة', 'Task', created.item.id, title);

  if (assignedToId && assignedToId !== user.id) {
    await createNotificationsForRecipients(
      [{ id: assignedToId, role: '' }],
      'task_assigned',
      'تم إسناد مهمة جديدة لك',
      title,
      'Task',
      created.item.id
    );
  }
  return { task: created.item };
}

export async function updateTask(user, id, body) {
  const existing = await gasClient.get('tasks', id);
  const task = existing?.item;
  if (!task) throw notFound('المهمة غير موجودة.');

  if (user.role === ROLES.AGENT && task.assignedToId && task.assignedToId !== user.id && task.createdById !== user.id && !hasPermission(user, 'assign_employees')) {
    throw forbidden('يمكنك فقط تعديل المهام المسندة إليك.');
  }

  const patch = {};
  if (body.title !== undefined) {
    const t = normalizeStr(body.title);
    if (!t) throw badRequest('عنوان المهمة لا يمكن أن يكون فارغًا.');
    patch.title = t;
  }
  if (body.description !== undefined) patch.description = normalizeStr(body.description);
  if (body.status !== undefined && TASK_STATUSES.includes(body.status)) patch.status = body.status;
  if (body.priority !== undefined && TASK_PRIORITIES.includes(body.priority)) patch.priority = body.priority;
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? formatDisplayDate(body.dueDate) : '';
  if (body.reservationNumber !== undefined) patch.reservationNumber = normalizeStr(body.reservationNumber);
  if (body.customerName !== undefined) patch.customerName = normalizeStr(body.customerName);
  if (body.assignedToId !== undefined) {
    patch.assignedToId = normalizeStr(body.assignedToId);
    if (patch.assignedToId) {
      const empRes = await gasClient.get('employees', patch.assignedToId).catch(() => null);
      patch.assignedToName = empRes?.item?.name || normalizeStr(body.assignedToName);
    } else {
      patch.assignedToName = '';
    }
  }

  const updated = await gasClient.update('tasks', id, patch);
  await logActivity(user, 'تحديث مهمة', 'Task', id, `${updated.item.title} → ${updated.item.status}`);
  return { task: updated.item };
}

export async function deleteTask(user, id) {
  await gasClient.remove('tasks', id);
  await logActivity(user, 'حذف مهمة', 'Task', id, `تم حذف المهمة ${id}`);
  return { deleted: true, id };
}

// =========================================================================
// RESERVATIONS CRUD & WORKFLOW
// =========================================================================
export async function listReservations(user, query = {}) {
  const snap = await gasClient.snapshot(['reservations', 'followups', 'settings']);
  const allowAgentViewAll = getSettingBool(snap.settings, 'allow_agent_view_all', true);
  const allRes = snap.reservations || [];

  const companySet = new Set();
  const branchSet = new Set();
  allRes.forEach((r) => {
    if (r.companyName) companySet.add(r.companyName);
    if (r.branchName) branchSet.add(r.branchName);
  });

  const filtered = core.filterReservations(allRes, snap.followups || [], query, {
    role: user.role,
    employeeId: user.id,
    user,
    allowAgentViewAll,
  });

  const page = Math.max(1, toNumber(query.page, 1));
  const pageSize = Math.min(200, Math.max(1, toNumber(query.pageSize, 20)));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;

  return {
    items: filtered.slice(startIdx, startIdx + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    facets: {
      companies: Array.from(companySet).sort(),
      branches: Array.from(branchSet).sort(),
    },
  };
}

export async function getReservationDetails(id) {
  const snap = await gasClient.snapshot(['reservations', 'extensions', 'followups', 'followup_history', 'problems', 'problem_updates']);
  const res = (snap.reservations || []).find((r) => r.id === id || r.reservationNumber === id);
  if (!res) throw notFound('الحجز غير موجود.');

  const extensions = (snap.extensions || []).filter(
    (e) => e.reservationId === res.id || (e.reservationNumber && e.reservationNumber === res.reservationNumber)
  );
  const followUps = (snap.followups || [])
    .filter((f) => f.reservationId === res.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const followUpHistory = (snap.followup_history || [])
    .filter((h) => h.reservationId === res.id)
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  const problems = (snap.problems || [])
    .filter((p) => p.reservationId === res.id)
    .map((p) => ({
      ...p,
      updates: (snap.problem_updates || []).filter((u) => u.problemId === p.id),
    }));

  return {
    reservation: res,
    extensions,
    followUps,
    followUpHistory,
    problems,
  };
}

export async function createReservation(user, body) {
  const reservationNumber = normalizeStr(body.reservationNumber);
  const customerName = normalizeStr(body.customerName);
  const customerPhone = normalizeStr(body.customerPhone);
  if (!reservationNumber) throw badRequest('رقم الحجز مطلوب.');
  if (!customerName) throw badRequest('اسم العميل مطلوب.');
  if (!customerPhone || !isValidPhone(customerPhone)) throw badRequest('رقم جوال العميل مطلوب وصالح.');

  const baseAmount = Math.max(0, toNumber(body.baseAmount, 0));
  const extensionsAmount = Math.max(0, toNumber(body.extensionsAmount, 0));
  const totalAmount = toNumber(body.totalAmount, 0) || Math.round((baseAmount + extensionsAmount) * 100) / 100;
  const now = nowIso();

  const record = {
    id: `RES_${reservationNumber}`,
    reservationNumber,
    customerName,
    customerPhone,
    companyName: normalizeStr(body.companyName),
    branchName: normalizeStr(body.branchName),
    carName: normalizeStr(body.carName),
    plateNumber: normalizeStr(body.plateNumber),
    startDate: body.startDate ? formatDisplayDate(body.startDate) : todayDateStr(),
    endDate: body.endDate ? formatDisplayDate(body.endDate) : todayDateStr(),
    daysCount: Math.max(1, toNumber(body.daysCount, 1)),
    originalStatusCode: normalizeStr(body.originalStatusCode) || 'confirmed',
    originalStatusAr: core.translateOriginalStatus(body.originalStatusCode || 'confirmed'),
    pickupTypeAr: normalizeStr(body.pickupTypeAr) || 'استلام من الفرع',
    returnTypeAr: normalizeStr(body.returnTypeAr) || 'تسليم في الفرع',
    baseAmount,
    extensionsAmount,
    totalAmount,
    hasExtensions: extensionsAmount > 0,
    internalStatus: normalizeStr(body.internalStatus) || 'تم الإنشاء',
    priority: normalizeStr(body.priority) || 'عادي',
    assignedEmployeeIds: Array.isArray(body.assignedEmployeeIds) ? body.assignedEmployeeIds : [],
    assignedEmployeeNames: Array.isArray(body.assignedEmployeeNames) ? body.assignedEmployeeNames : [],
    lastUpdateText: normalizeStr(body.lastUpdateText) || 'تم إنشاء الحجز يدويًا',
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: now,
    hasProblem: false,
  };

  const created = await gasClient.create('reservations', record);
  await logActivity(user, 'إنشاء حجز', 'Reservation', created.item.id, `رقم الحجز ${reservationNumber}`);
  return { reservation: created.item };
}

export async function claimReservation(user, reservationId) {
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const claimed = core.claimReservationRecord(res, user);
  if (!claimed.added) {
    return { reservation: res, alreadyClaimed: true };
  }

  const now = nowIso();
  const updated = await gasClient.update('reservations', res.id, {
    assignedEmployeeIds: claimed.assignedEmployeeIds,
    assignedEmployeeNames: claimed.assignedEmployeeNames,
    lastUpdateText: `استلم الموظف (${user.name}) الحجز للمتابعة`,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: now,
  });

  await gasClient.create('assignments', {
    reservationId: res.id,
    reservationNumber: res.reservationNumber,
    employeeId: user.id,
    employeeName: user.name,
    assignedById: user.id,
    assignedByName: user.name,
    roleType: 'self_claim',
    status: 'active',
    assignedAt: now,
    updatedAt: now,
  }, { allowDuplicate: true }).catch(() => {});

  await logActivity(user, 'استلام حجز', 'Reservation', res.id, `حجز ${res.reservationNumber}`);
  return { reservation: updated.item, alreadyClaimed: false };
}

export async function unclaimReservation(user, reservationId) {
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const unclaimed = core.unclaimReservationRecord(res, user.id);
  const now = nowIso();
  const updated = await gasClient.update('reservations', res.id, {
    assignedEmployeeIds: unclaimed.assignedEmployeeIds,
    assignedEmployeeNames: unclaimed.assignedEmployeeNames,
    lastUpdateText: `تم إلغاء استلام الحجز بواسطة ${user.name}`,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: now,
  });

  await logActivity(user, 'إلغاء استلام حجز', 'Reservation', res.id, `حجز ${res.reservationNumber}`);
  return { reservation: updated.item };
}

export async function quickUpdateReservationStatus(user, reservationId, status, note = '') {
  if (!status) throw badRequest('الحالة الجديدة مطلوبة.');
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const now = nowIso();
  const cleanNote = normalizeStr(note);
  const updated = await gasClient.update('reservations', res.id, {
    internalStatus: status,
    lastUpdateText: cleanNote || `تغيير الحالة إلى: ${status}`,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: now,
  });

  await gasClient.create('followups', {
    reservationId: res.id,
    reservationNumber: res.reservationNumber,
    customerName: res.customerName,
    employeeId: user.id,
    employeeName: user.name,
    status,
    action: `تحديث سريع للحالة → ${status}`,
    notes: cleanNote,
    followUpDate: todayDateStr(),
    followUpTime: currentTime24Str(),
  }, { allowDuplicate: true }).catch(() => {});

  await logActivity(user, 'تحديث حالة حجز', 'Reservation', res.id, `${res.reservationNumber} → ${status}`);
  return { reservation: updated.item };
}

export async function updateReservationDetails(user, reservationId, body) {
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const patch = {
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: nowIso(),
  };

  if (body.customerName !== undefined) patch.customerName = normalizeStr(body.customerName);
  if (body.customerPhone !== undefined) patch.customerPhone = normalizeStr(body.customerPhone);
  if (body.companyName !== undefined) patch.companyName = normalizeStr(body.companyName);
  if (body.branchName !== undefined) patch.branchName = normalizeStr(body.branchName);
  if (body.carName !== undefined) patch.carName = normalizeStr(body.carName);
  if (body.plateNumber !== undefined) patch.plateNumber = normalizeStr(body.plateNumber);
  if (body.startDate !== undefined) patch.startDate = formatDisplayDate(body.startDate);
  if (body.endDate !== undefined) patch.endDate = formatDisplayDate(body.endDate);
  if (body.daysCount !== undefined) patch.daysCount = Math.max(1, toNumber(body.daysCount, 1));
  if (body.internalStatus !== undefined) patch.internalStatus = normalizeStr(body.internalStatus);
  if (body.priority !== undefined) patch.priority = normalizeStr(body.priority);

  if (body.baseAmount !== undefined || body.extensionsAmount !== undefined) {
    const base = body.baseAmount !== undefined ? toNumber(body.baseAmount, 0) : toNumber(res.baseAmount, 0);
    const ext = body.extensionsAmount !== undefined ? toNumber(body.extensionsAmount, 0) : toNumber(res.extensionsAmount, 0);
    patch.baseAmount = base;
    patch.extensionsAmount = ext;
    patch.totalAmount = Math.round((base + ext) * 100) / 100;
  }

  const updated = await gasClient.update('reservations', res.id, patch);
  await logActivity(user, 'تعديل تفاصيل حجز', 'Reservation', res.id, `حجز ${res.reservationNumber}`);
  return { reservation: updated.item };
}

export async function deleteReservation(user, reservationId) {
  await gasClient.remove('reservations', reservationId);
  await logActivity(user, 'حذف حجز', 'Reservation', reservationId, `تم حذف الحجز ${reservationId}`);
  return { deleted: true, id: reservationId };
}

export async function assignEmployeesToReservation(user, reservationId, employeeIds = []) {
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const empListRes = await gasClient.list('employees');
  const allEmployees = empListRes?.items || [];
  const selectedIds = Array.isArray(employeeIds) ? employeeIds.map(normalizeStr).filter(Boolean) : [];
  const selectedEmps = allEmployees.filter((e) => selectedIds.includes(e.id));

  const updated = await gasClient.update('reservations', res.id, {
    assignedEmployeeIds: selectedEmps.map((e) => e.id),
    assignedEmployeeNames: selectedEmps.map((e) => e.name),
    lastUpdateText: `إسناد الحجز إلى: ${selectedEmps.map((e) => e.name).join('، ') || 'غير مسند'}`,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: nowIso(),
  });

  await createNotificationsForRecipients(
    selectedEmps.filter((e) => e.id !== user.id),
    'assignment',
    'تم إسناد حجز جديد لك',
    `الحجز ${res.reservationNumber} (${res.customerName})`,
    'Reservation',
    res.id
  );
  await logActivity(user, 'إسناد موظفين', 'Reservation', res.id, `${res.reservationNumber} → ${selectedEmps.map((e) => e.name).join(', ')}`);
  return { reservation: updated.item };
}

export async function removeEmployeeAssignment(user, reservationId, employeeId) {
  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const unclaimed = core.unclaimReservationRecord(res, employeeId);
  const updated = await gasClient.update('reservations', res.id, {
    assignedEmployeeIds: unclaimed.assignedEmployeeIds,
    assignedEmployeeNames: unclaimed.assignedEmployeeNames,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: nowIso(),
  });
  await logActivity(user, 'إزالة إسناد موظف', 'Reservation', res.id, `إزالة ${employeeId} من ${res.reservationNumber}`);
  return { reservation: updated.item };
}

// =========================================================================
// FOLLOW-UPS
// =========================================================================
export async function getMyFollowUps(user) {
  const snap = await gasClient.snapshot(['reservations', 'followups']);
  const assignedReservations = (snap.reservations || []).filter((r) =>
    (r.assignedEmployeeIds || []).includes(user.id)
  );
  const followUps = (snap.followups || [])
    .filter((f) => f.employeeId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { assignedReservations, followUps };
}

export async function getTeamFollowUps(query = {}) {
  const res = await gasClient.list('followups');
  let items = res?.items || [];
  if (query.employeeId) items = items.filter((f) => f.employeeId === query.employeeId);
  if (query.status) items = items.filter((f) => f.status === query.status);
  if (query.date) items = items.filter((f) => formatDisplayDate(f.followUpDate) === query.date);
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { items, total: items.length };
}

export async function addFollowUp(user, body) {
  const reservationId = normalizeStr(body.reservationId);
  const action = normalizeStr(body.action);
  const status = normalizeStr(body.status);
  if (!reservationId) throw badRequest('معرف الحجز مطلوب.');
  if (!action) throw badRequest('تفاصيل الإجراء مطلوبة.');

  const got = await gasClient.get('reservations', reservationId);
  const res = got?.item;
  if (!res) throw notFound('الحجز غير موجود.');

  const now = nowIso();
  const created = await gasClient.create(
    'followups',
    {
      reservationId: res.id,
      reservationNumber: res.reservationNumber,
      customerName: res.customerName,
      employeeId: user.id,
      employeeName: user.name,
      status: status || res.internalStatus || 'تم الإنشاء',
      action,
      notes: normalizeStr(body.notes),
      followUpDate: todayDateStr(),
      followUpTime: currentTime24Str(),
    },
    { allowDuplicate: true }
  );

  await gasClient.create(
    'followup_history',
    {
      followUpId: created.item.id,
      reservationId: res.id,
      reservationNumber: res.reservationNumber,
      employeeId: user.id,
      employeeName: user.name,
      changeType: 'created',
      previousStatus: res.internalStatus || '',
      newStatus: created.item.status,
      previousAction: '',
      newAction: action,
      previousNotes: '',
      newNotes: created.item.notes,
      changedAt: now,
    },
    { allowDuplicate: true }
  ).catch(() => {});

  const nextIds = (res.assignedEmployeeIds || []).includes(user.id)
    ? res.assignedEmployeeIds
    : [...(res.assignedEmployeeIds || []), user.id];
  const nextNames = (res.assignedEmployeeIds || []).includes(user.id)
    ? res.assignedEmployeeNames
    : [...(res.assignedEmployeeNames || []), user.name];

  await gasClient.update('reservations', res.id, {
    internalStatus: created.item.status,
    assignedEmployeeIds: nextIds,
    assignedEmployeeNames: nextNames,
    lastUpdateText: action,
    lastUpdatedById: user.id,
    lastUpdatedByName: user.name,
    lastUpdatedAt: now,
  });

  await logActivity(user, 'إضافة متابعة', 'FollowUp', created.item.id, `${res.reservationNumber}: ${action}`);
  return { followUp: created.item };
}

export async function updateFollowUp(user, followUpId, body) {
  const got = await gasClient.get('followups', followUpId);
  const existing = got?.item;
  if (!existing) throw notFound('المتابعة غير موجودة.');

  if (existing.employeeId !== user.id && !hasPermission(user, 'edit_any_followup')) {
    throw forbidden('يمكنك فقط تعديل متابعاتك الخاصة ما لم تكن لديك صلاحية تعديل متابعات الفريق.');
  }

  const nextAction = body.action !== undefined ? normalizeStr(body.action) : existing.action;
  if (!nextAction) throw badRequest('تفاصيل الإجراء لا يمكن أن تكون فارغة.');
  const nextStatus = body.status !== undefined ? normalizeStr(body.status) : existing.status;
  const nextNotes = body.notes !== undefined ? normalizeStr(body.notes) : existing.notes;

  const updated = await gasClient.update('followups', followUpId, {
    status: nextStatus,
    action: nextAction,
    notes: nextNotes,
  });

  await gasClient.create('followup_history', {
    followUpId,
    reservationId: existing.reservationId,
    reservationNumber: existing.reservationNumber,
    employeeId: user.id,
    employeeName: user.name,
    changeType: 'edited',
    previousStatus: existing.status,
    newStatus: nextStatus,
    previousAction: existing.action,
    newAction: nextAction,
    previousNotes: existing.notes,
    newNotes: nextNotes,
    changedAt: nowIso(),
  }, { allowDuplicate: true }).catch(() => {});

  await logActivity(user, 'تعديل متابعة', 'FollowUp', followUpId, `${existing.reservationNumber}: ${nextAction}`);
  return { followUp: updated.item };
}

export async function deleteFollowUp(user, followUpId) {
  await gasClient.remove('followups', followUpId);
  await logActivity(user, 'حذف متابعة', 'FollowUp', followUpId, `تم حذف المتابعة ${followUpId}`);
  return { deleted: true, id: followUpId };
}

// =========================================================================
// PROBLEMS / COMPLAINTS
// =========================================================================
export async function listProblems(user, query = {}) {
  const snap = await gasClient.snapshot(['problems', 'problem_updates']);
  let items = snap.problems || [];
  const updates = snap.problem_updates || [];

  if (query.status) items = items.filter((p) => p.status === query.status);
  if (query.priority) items = items.filter((p) => p.priority === query.priority);
  if (query.employeeId) items = items.filter((p) => (p.assignedEmployeeIds || []).includes(query.employeeId));
  if (query.search) {
    const q = normalizeStr(query.search).toLowerCase();
    items = items.filter((p) =>
      `${p.problemNumber || ''} ${p.reservationNumber || ''} ${p.customerName || ''} ${p.description || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  items = items
    .map((p) => ({
      ...p,
      updates: updates
        .filter((u) => u.problemId === p.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  return { items, total: items.length };
}

export async function createProblem(user, body) {
  const reservationId = normalizeStr(body.reservationId);
  const description = normalizeStr(body.description);
  if (!description) throw badRequest('وصف المشكلة / الشكوى مطلوب.');

  let resObj = null;
  if (reservationId) {
    const got = await gasClient.get('reservations', reservationId).catch(() => null);
    resObj = got?.item || null;
  }

  const empRes = await gasClient.list('employees');
  const allEmployees = empRes?.items || [];
  const assignedIds = Array.isArray(body.assignedEmployeeIds) ? body.assignedEmployeeIds : [];
  const assignedEmps = allEmployees.filter((e) => assignedIds.includes(e.id));

  const priority = normalizeStr(body.priority) || 'متوسط';
  const problemNumber = normalizeStr(body.problemNumber) || `PRB-${Math.floor(1000 + Math.random() * 9000)}`;

  const created = await gasClient.create('problems', {
    problemNumber,
    reservationId: resObj?.id || reservationId,
    reservationNumber: resObj?.reservationNumber || normalizeStr(body.reservationNumber),
    customerName: resObj?.customerName || normalizeStr(body.customerName) || 'عميل',
    createdById: user.id,
    createdByName: user.name,
    assignedEmployeeIds: assignedEmps.map((e) => e.id),
    assignedEmployeeNames: assignedEmps.map((e) => e.name),
    description,
    priority,
    status: normalizeStr(body.status) || 'جديدة',
  });

  if (resObj) {
    await gasClient.update('reservations', resObj.id, {
      hasProblem: true,
      priority,
      lastUpdatedById: user.id,
      lastUpdatedByName: user.name,
      lastUpdatedAt: nowIso(),
    }).catch(() => {});
  }

  const supervisors = allEmployees.filter(
    (e) => e.status === 'active' && (e.role === ROLES.GENERAL_MANAGER || e.role === ROLES.SUPERVISOR)
  );
  if (priority === 'مرتفع' || supervisors.length > 0) {
    await createNotificationsForRecipients(
      [...supervisors, ...assignedEmps].filter((e) => e.id !== user.id),
      priority === 'مرتفع' ? 'high_problem' : 'problem',
      `تذكرة مشكلة جديدة (${priority})`,
      `${problemNumber}: ${description}`,
      'Problem',
      created.item.id
    );
  }

  await logActivity(user, 'إنشاء مشكلة', 'Problem', created.item.id, `${problemNumber} (${priority})`);
  return { problem: created.item };
}

export async function updateProblem(user, problemId, body) {
  const got = await gasClient.get('problems', problemId);
  const existing = got?.item;
  if (!existing) throw notFound('المشكلة غير موجودة.');

  const canEditDetails = hasPermission(user, 'edit_ticket_details');
  const note = normalizeStr(body.note);
  if (!canEditDetails && !note) {
    throw badRequest('ملاحظة التحديث مطلوبة لتسجيل الإجراء.');
  }

  const empRes = await gasClient.list('employees');
  const allEmployees = empRes?.items || [];

  const patch = {
    status: normalizeStr(body.status) || existing.status,
    priority: normalizeStr(body.priority) || existing.priority,
  };

  if (canEditDetails) {
    if (body.customerName !== undefined) patch.customerName = normalizeStr(body.customerName) || existing.customerName;
    if (body.description !== undefined) patch.description = normalizeStr(body.description) || existing.description;
  }

  if (Array.isArray(body.assignedEmployeeIds)) {
    const matched = allEmployees.filter((e) => body.assignedEmployeeIds.includes(e.id));
    patch.assignedEmployeeIds = matched.map((e) => e.id);
    patch.assignedEmployeeNames = matched.map((e) => e.name);
  }

  const updated = await gasClient.update('problems', problemId, patch);

  await gasClient.create('problem_updates', {
    problemId,
    reservationNumber: existing.reservationNumber,
    employeeId: user.id,
    employeeName: user.name,
    previousStatus: existing.status,
    newStatus: updated.item.status,
    previousPriority: existing.priority,
    newPriority: updated.item.priority,
    note: note || 'تعديل بيانات التذكرة',
    createdAt: nowIso(),
  }, { allowDuplicate: true }).catch(() => {});

  if (existing.reservationId && (updated.item.status === 'مغلقة' || updated.item.status === 'تم الحل')) {
    const allPrb = (await gasClient.list('problems')).items || [];
    const stillOpen = allPrb.some(
      (p) => p.reservationId === existing.reservationId && p.id !== problemId && p.status !== 'مغلقة' && p.status !== 'تم الحل'
    );
    await gasClient.update('reservations', existing.reservationId, { hasProblem: stillOpen }).catch(() => {});
  }

  await logActivity(user, 'تحديث مشكلة', 'Problem', problemId, `${existing.problemNumber} → ${updated.item.status}`);
  return { problem: updated.item };
}

export async function deleteProblem(user, problemId) {
  await gasClient.remove('problems', problemId);
  await logActivity(user, 'حذف مشكلة', 'Problem', problemId, `تم حذف التذكرة ${problemId}`);
  return { deleted: true, id: problemId };
}

// =========================================================================
// EMPLOYEES, ROLE PRESETS & CUSTOM PERMISSIONS
// =========================================================================
export async function listEmployees() {
  const snap = await gasClient.snapshot(['employees', 'reservations', 'followups', 'problems', 'settings']);
  const reservations = snap.reservations || [];
  const followUps = snap.followups || [];
  const problems = snap.problems || [];
  const settingsMap = {};
  (snap.settings || []).forEach((s) => { settingsMap[s.key] = s.value; });

  const items = (snap.employees || []).map((emp) => ({
    ...sanitizeEmployee(emp),
    reservationsCount: reservations.filter((r) => (r.assignedEmployeeIds || []).includes(emp.id)).length,
    followUpsCount: followUps.filter((f) => f.employeeId === emp.id).length,
    problemsCount: problems.filter((p) => (p.assignedEmployeeIds || []).includes(emp.id)).length,
  }));

  return {
    items,
    rolePresets: normalizeRolePresets(parseJsonField(settingsMap.job_role_presets, null)),
    customPermissions: parseJsonField(settingsMap.permissions_catalog_custom, []),
  };
}

export async function getEmployeeDetails(employeeId) {
  const snap = await gasClient.snapshot(['employees', 'reservations', 'followups', 'problems']);
  const emp = (snap.employees || []).find((e) => e.id === employeeId);
  if (!emp) throw notFound('الموظف غير موجود.');

  const followUps = (snap.followups || []).filter((f) => f.employeeId === employeeId);
  const assignedReservations = (snap.reservations || [])
    .filter((r) => (r.assignedEmployeeIds || []).includes(employeeId))
    .map((r) => {
      const latestFu = followUps.find((f) => f.reservationId === r.id) || null;
      return { ...r, latestFollowUp: latestFu };
    });
  const problems = (snap.problems || []).filter(
    (p) => p.createdById === employeeId || (p.assignedEmployeeIds || []).includes(employeeId)
  );

  return {
    employee: sanitizeEmployee(emp),
    assignedReservations,
    followUps,
    problems,
  };
}

export async function createEmployee(user, body) {
  const name = normalizeStr(body.name);
  const username = normalizeStr(body.username).toLowerCase();
  const password = String(body.password || '');
  const role = normalizeRole(body.role || 'agent');
  if (!name) throw badRequest('اسم الموظف مطلوب.');
  if (!username || username.length < 3) throw badRequest('اسم المستخدم مطلوب (3 أحرف على الأقل).');
  if (!password || password.length < 6) throw badRequest('كلمة المرور مطلوبة (6 أحرف على الأقل).');
  if (!role) throw badRequest('الدور الوظيفي غير صالح.');

  const email = normalizeStr(body.email);
  if (email && !isValidEmail(email)) throw badRequest('البريد الإلكتروني غير صالح.');

  const permissions = core.sanitizePresetPermissions(
    role,
    Array.isArray(body.permissions) && body.permissions.length
      ? body.permissions
      : core.resolveEffectivePermissions(role)
  );

  const passwordHash = await hashPassword(password);
  const created = await gasClient.create('employees', {
    name,
    username,
    passwordHash,
    salt: '',
    phone: normalizeStr(body.phone),
    email,
    jobTitle: normalizeStr(body.jobTitle) || 'موظف خدمة العملاء',
    role,
    permissions,
    status: body.status === 'disabled' ? 'disabled' : 'active',
    lastActivity: '',
  });

  await logActivity(user, 'إنشاء موظف', 'Employee', created.item.id, `${name} (${username})`);
  return { employee: sanitizeEmployee(created.item) };
}

export async function updateEmployee(user, employeeId, body) {
  const got = await gasClient.get('employees', employeeId);
  const existing = got?.item;
  if (!existing) throw notFound('الموظف غير موجود.');

  const patch = {};
  if (body.name !== undefined) {
    const n = normalizeStr(body.name);
    if (!n) throw badRequest('اسم الموظف مطلوب.');
    patch.name = n;
  }
  if (body.phone !== undefined) patch.phone = normalizeStr(body.phone);
  if (body.email !== undefined) {
    const em = normalizeStr(body.email);
    if (em && !isValidEmail(em)) throw badRequest('البريد الإلكتروني غير صالح.');
    patch.email = em;
  }
  if (body.jobTitle !== undefined) patch.jobTitle = normalizeStr(body.jobTitle);

  const nextRole = body.role !== undefined ? normalizeRole(body.role) : existing.role;
  if (body.role !== undefined && !nextRole) throw badRequest('الدور الوظيفي غير صالح.');
  patch.role = nextRole;

  if (Array.isArray(body.permissions)) {
    patch.permissions = core.sanitizePresetPermissions(nextRole, body.permissions);
  }
  if (body.status !== undefined) {
    patch.status = body.status === 'disabled' ? 'disabled' : 'active';
  }
  if (body.password && String(body.password).length > 0) {
    if (String(body.password).length < 6) throw badRequest('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    patch.passwordHash = await hashPassword(body.password);
    patch.salt = '';
  }

  const updated = await gasClient.update('employees', employeeId, patch);
  await logActivity(user, 'تعديل موظف', 'Employee', employeeId, updated.item.name);
  return { employee: sanitizeEmployee(updated.item) };
}

export async function toggleEmployeeStatus(user, employeeId, nextStatus) {
  if (user.id === employeeId) {
    throw badRequest('لا يمكنك تعطيل حسابك الشخصي أثناء تسجيل الدخول.');
  }
  const status = nextStatus === 'disabled' ? 'disabled' : 'active';
  const updated = await gasClient.update('employees', employeeId, { status });
  await logActivity(user, status === 'disabled' ? 'إيقاف موظف' : 'تفعيل موظف', 'Employee', employeeId, updated.item.name);
  return { employee: sanitizeEmployee(updated.item) };
}

export async function deleteEmployee(user, employeeId) {
  if (user.id === employeeId) {
    throw badRequest('لا يمكنك حذف حسابك الشخصي.');
  }
  await gasClient.remove('employees', employeeId);
  await logActivity(user, 'حذف موظف', 'Employee', employeeId, `تم حذف الموظف ${employeeId}`);
  return { deleted: true, id: employeeId };
}

export async function saveRolePreset(user, body) {
  const settingsRes = await gasClient.list('settings');
  const presetRow = (settingsRes.items || []).find((s) => s.key === 'job_role_presets');
  const current = parseJsonField(presetRow?.value, core.JOB_ROLE_PRESETS);
  const { presets, saved } = core.upsertRolePreset(current, body);

  await gasClient.upsertBatch('settings', 'key', [
    { key: 'job_role_presets', value: JSON.stringify(presets), updatedBy: user.name, updatedAt: nowIso() },
  ]);
  await gasClient.upsertBatch(
    'roles',
    'id',
    presets.map((p) => ({ ...p, updatedBy: user.name, updatedAt: nowIso() }))
  ).catch(() => {});
  await logActivity(user, 'حفظ صلاحية جاهزة', 'RolePreset', saved.id, saved.label);
  return { rolePresets: presets, savedPreset: saved };
}

export async function deleteRolePreset(user, presetId) {
  const settingsRes = await gasClient.list('settings');
  const presetRow = (settingsRes.items || []).find((s) => s.key === 'job_role_presets');
  const current = parseJsonField(presetRow?.value, core.JOB_ROLE_PRESETS);
  const next = core.removeRolePreset(current, presetId);

  await gasClient.upsertBatch('settings', 'key', [
    { key: 'job_role_presets', value: JSON.stringify(next), updatedBy: user.name, updatedAt: nowIso() },
  ]);
  await gasClient.remove('roles', presetId).catch(() => {});
  await logActivity(user, 'حذف صلاحية جاهزة', 'RolePreset', presetId, presetId);
  return { rolePresets: next };
}

export async function resetRolePresets(user) {
  const defaults = core.normalizeRolePresets(core.JOB_ROLE_PRESETS);
  await gasClient.upsertBatch('settings', 'key', [
    { key: 'job_role_presets', value: JSON.stringify(defaults), updatedBy: user.name, updatedAt: nowIso() },
  ]);
  await logActivity(user, 'استعادة الصلاحيات الجاهزة', 'RolePreset', 'defaults', 'استعادة الافتراضي');
  return { rolePresets: defaults };
}

export async function savePermissionDefinition(user, body) {
  const settingsRes = await gasClient.list('settings');
  const permRow = (settingsRes.items || []).find((s) => s.key === 'permissions_catalog_custom');
  const current = parseJsonField(permRow?.value, []);
  const { customPermissions, saved } = core.upsertPermissionDefinition(current, body);

  await gasClient.upsertBatch('settings', 'key', [
    { key: 'permissions_catalog_custom', value: JSON.stringify(customPermissions), updatedBy: user.name, updatedAt: nowIso() },
  ]);
  await logActivity(user, 'حفظ تعريف صلاحية', 'Permission', saved.key, saved.label);
  return { customPermissions, saved };
}

export async function deletePermissionDefinition(user, key) {
  const settingsRes = await gasClient.list('settings');
  const permRow = (settingsRes.items || []).find((s) => s.key === 'permissions_catalog_custom');
  const current = parseJsonField(permRow?.value, []);
  const { customPermissions } = core.removePermissionDefinition(current, key);

  await gasClient.upsertBatch('settings', 'key', [
    { key: 'permissions_catalog_custom', value: JSON.stringify(customPermissions), updatedBy: user.name, updatedAt: nowIso() },
  ]);
  await logActivity(user, 'حذف تعريف صلاحية', 'Permission', key, key);
  return { customPermissions };
}

// =========================================================================
// REPORTS, ACTIVITY LOG, NOTIFICATIONS & SETTINGS
// =========================================================================
export async function getReportsData(user, query = {}) {
  const snap = await gasClient.snapshot(['reservations', 'followups', 'problems', 'employees', 'customers', 'tasks', 'settings']);
  const allowAgentViewAll = getSettingBool(snap.settings, 'allow_agent_view_all', true);
  let reservations = snap.reservations || [];
  if (user.role === ROLES.AGENT && !allowAgentViewAll && !hasPermission(user, 'view_all_reservations')) {
    reservations = reservations.filter((r) => (r.assignedEmployeeIds || []).includes(user.id));
  }

  const followUps = snap.followups || [];
  const problems = snap.problems || [];
  const employees = (snap.employees || []).map(sanitizeEmployee);
  const filteredRes = core.filterReservations(reservations, followUps, query, { role: user.role, employeeId: user.id, user, allowAgentViewAll });
  const metrics = core.computeDashboardMetrics(
    filteredRes,
    followUps,
    problems,
    employees,
    { start: normalizeStr(query.dateFrom), end: normalizeStr(query.dateTo) },
    todayDateStr()
  );

  return {
    ...metrics,
    reservations: filteredRes,
    followUps,
    problems,
    employees,
    customers: snap.customers || [],
    tasks: snap.tasks || [],
  };
}

export async function getActivityLogs(user, query = {}) {
  const res = await gasClient.list('activity_log');
  let items = res?.items || [];
  if (!hasPermission(user, 'view_all_logs') && user.role === ROLES.AGENT) {
    items = items.filter((l) => l.userId === user.id);
  }
  items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const limit = Math.min(500, Math.max(10, toNumber(query.limit, 150)));
  return { items: items.slice(0, limit), total: items.length };
}

export async function getNotifications(user) {
  const res = await gasClient.list('notifications');
  const items = (res?.items || [])
    .filter((n) => n.recipientEmployeeId === user.id)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return {
    items: items.slice(0, 40),
    unreadCount: items.filter((n) => !n.isRead).length,
  };
}

export async function markNotificationRead(user, body = {}) {
  const res = await gasClient.list('notifications');
  const items = (res?.items || []).filter((n) => n.recipientEmployeeId === user.id && !n.isRead);
  if (body.markAll) {
    for (const item of items) {
      await gasClient.update('notifications', item.id, { isRead: 'true' }).catch(() => {});
    }
    return { markedAll: true };
  }
  const nid = normalizeStr(body.notificationId);
  if (!nid) throw badRequest('معرف الإشعار مطلوب.');
  await gasClient.update('notifications', nid, { isRead: 'true' });
  return { markedId: nid };
}

export async function getSystemSettings() {
  const snap = await gasClient.snapshot(['settings', 'sync_log']);
  const map = {};
  (snap.settings || []).forEach((s) => { map[s.key] = s.value; });
  const envCfg = getEnvConfig();
  const hasToken = Boolean(envCfg.rgApiToken || normalizeStr(map.rg_api_token));

  const logs = (snap.sync_log || []).sort(
    (a, b) => new Date(b.finishedAt || b.startedAt || 0).getTime() - new Date(a.finishedAt || a.startedAt || 0).getTime()
  );

  return {
    company_name: map.company_name || 'RENTAL GATE',
    session_ttl_hours: toNumber(map.session_ttl_hours, 24),
    excluded_statuses: parseJsonField(map.excluded_statuses, ['draft', 'test', 'abandoned']),
    allow_agent_view_all: map.allow_agent_view_all !== 'false',
    auto_sync_enabled: map.auto_sync_enabled !== 'false',
    auto_sync_interval_hours: toNumber(map.auto_sync_interval_hours, 12),
    hasRgToken: hasToken,
    gasConfigured: Boolean(envCfg.gasWebAppUrl),
    syncLogs: logs.slice(0, 20),
    lastSync: logs[0] || null,
  };
}

export async function updateSystemSettings(user, body) {
  const now = nowIso();
  const updates = [];
  if (body.company_name !== undefined) updates.push({ key: 'company_name', value: normalizeStr(body.company_name) || 'RENTAL GATE', updatedBy: user.name, updatedAt: now });
  if (body.session_ttl_hours !== undefined) updates.push({ key: 'session_ttl_hours', value: String(Math.max(1, Math.min(168, toNumber(body.session_ttl_hours, 24)))), updatedBy: user.name, updatedAt: now });
  if (Array.isArray(body.excluded_statuses)) updates.push({ key: 'excluded_statuses', value: JSON.stringify(body.excluded_statuses), updatedBy: user.name, updatedAt: now });
  if (body.allow_agent_view_all !== undefined) updates.push({ key: 'allow_agent_view_all', value: body.allow_agent_view_all ? 'true' : 'false', updatedBy: user.name, updatedAt: now });
  if (body.auto_sync_enabled !== undefined) updates.push({ key: 'auto_sync_enabled', value: body.auto_sync_enabled ? 'true' : 'false', updatedBy: user.name, updatedAt: now });
  if (body.auto_sync_interval_hours !== undefined) updates.push({ key: 'auto_sync_interval_hours', value: String(Math.max(1, Math.min(168, toNumber(body.auto_sync_interval_hours, 12)))), updatedBy: user.name, updatedAt: now });

  if (updates.length > 0) {
    await gasClient.upsertBatch('settings', 'key', updates);
  }
  await logActivity(user, 'تحديث إعدادات النظام', 'Settings', 'system', 'تم تحديث الإعدادات العامة');
  return getSystemSettings();
}
