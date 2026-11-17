export function normalizeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}

export function isValidEmail(email) {
  const clean = normalizeStr(email);
  if (!clean) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function isValidPhone(phone) {
  const clean = normalizeStr(phone).replace(/[\s\-()]/g, '');
  if (!clean) return false;
  return /^\+?[0-9]{7,15}$/.test(clean);
}

export function isValidDateStr(dateStr) {
  const clean = normalizeStr(dateStr);
  if (!clean) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return true;
  const d = new Date(clean);
  return !Number.isNaN(d.getTime());
}

export function normalizeRole(role) {
  const raw = normalizeStr(role).toLowerCase();
  if (raw === 'admin' || raw === 'general_manager') return 'general_manager';
  if (raw === 'supervisor') return 'supervisor';
  if (raw === 'employee' || raw === 'agent') return 'agent';
  return '';
}

export function requireFields(obj, requiredList) {
  const errors = [];
  for (const field of requiredList) {
    const key = typeof field === 'string' ? field : field.key;
    const label = typeof field === 'string' ? field : field.label;
    if (!normalizeStr(obj?.[key])) {
      errors.push(`الحقل "${label}" مطلوب.`);
    }
  }
  return errors;
}
