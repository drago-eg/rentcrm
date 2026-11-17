import { core } from '../config/permissions.js';

export function utcToLocal(val, options) {
  return core.utcToLocal(val, options);
}

export function formatDisplayDate(val) {
  return core.formatDisplayDate(val);
}

export function formatDisplayTime(val, options) {
  return core.formatDisplayTime(val, options);
}

export function formatDisplayDateTime(val, options) {
  return core.formatDisplayDateTime(val, options);
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayDateStr() {
  return core.formatDisplayDate(new Date());
}

export function currentTime24Str() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
