import { getEnvConfig } from '../config/env.js';
import { core } from '../config/permissions.js';
import { badRequest, serviceUnavailable } from '../utils/errors.js';
import { formatDisplayDate, nowIso, todayDateStr, currentTime24Str } from '../utils/dateUtils.js';
import { normalizeStr, toNumber } from '../utils/validators.js';
import { gasClient } from './gasClient.js';

let runtimeRgToken = '';

async function resolveActiveRgToken() {
  if (runtimeRgToken) return runtimeRgToken;
  const envCfg = getEnvConfig();
  if (envCfg.rgApiToken) return envCfg.rgApiToken;

  const settingsRes = await gasClient.list('settings').catch(() => ({ items: [] }));
  const tokenRec = (settingsRes?.items || []).find((s) => s.key === 'rg_api_token');
  return normalizeStr(tokenRec?.value);
}

function extractPagePayload(body, pageIndex) {
  let rows = [];
  let totalPages = 1;
  let isLast = true;

  if (Array.isArray(body)) {
    rows = body;
  } else if (body && Array.isArray(body.content)) {
    rows = body.content;
    totalPages = toNumber(body.totalPages, 1);
    isLast = body.last === true || pageIndex + 1 >= totalPages;
  } else if (body && body.data) {
    if (Array.isArray(body.data)) {
      rows = body.data;
      totalPages = toNumber(body.meta?.last_page || body.pagination?.last_page || body.last_page, 1);
      isLast = pageIndex + 1 >= totalPages;
    } else if (Array.isArray(body.data.content)) {
      rows = body.data.content;
      totalPages = toNumber(body.data.totalPages, 1);
      isLast = body.data.last === true || pageIndex + 1 >= totalPages;
    }
  } else if (body && Array.isArray(body.items)) {
    rows = body.items;
    totalPages = toNumber(body.meta?.last_page || body.pagination?.last_page || body.last_page, 1);
    isLast = pageIndex + 1 >= totalPages;
  }
  return { rows, totalPages, isLast };
}

async function fetchRgEndpoint(url, token, page = 0, size = 100) {
  const fullUrl = new URL(url);
  fullUrl.searchParams.set('page', String(page));
  fullUrl.searchParams.set('size', String(size));

  const res = await fetch(fullUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      lang: 'ar',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`خطأ من Rental Gate API (${res.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function fetchAllRgPages(url, token) {
  const first = await fetchRgEndpoint(url, token, 0, 100);
  const info0 = extractPagePayload(first, 0);
  const all = [...info0.rows];
  let pagesFetched = 1;

  if (!info0.isLast && info0.totalPages > 1) {
    const maxPage = Math.min(info0.totalPages - 1, 50);
    for (let p = 1; p <= maxPage; p++) {
      const body = await fetchRgEndpoint(url, token, p, 100);
      pagesFetched++;
      const info = extractPagePayload(body, p);
      if (info.rows.length === 0) break;
      all.push(...info.rows);
      if (info.isLast) break;
    }
  }

  return { items: all, pagesFetched };
}

export async function saveRgApiToken(token, testAfterSave = false) {
  const clean = normalizeStr(token).replace(/^Bearer\s+/i, '');
  if (!clean || clean.length < 16 || /\s/.test(clean)) {
    throw badRequest('صيغة التوكن غير صالحة. يرجى لصق التوكن كاملاً بدون مسافات.');
  }

  runtimeRgToken = clean;
  await gasClient.upsertBatch('settings', 'key', [
    { key: 'rg_api_token', value: clean, updatedBy: 'server', updatedAt: nowIso() },
  ]);

  const result = { saved: true, hasToken: true, hasRgToken: true };
  if (testAfterSave) {
    result.connection = await testRgConnection();
  }
  return result;
}

export async function testRgConnection() {
  const token = await resolveActiveRgToken();
  if (!token) {
    return {
      connected: false,
      hasToken: false,
      message: 'مفتاح RG_API_TOKEN غير مضبوط في إعدادات الخادم.',
    };
  }
  const { rgReservationsApi } = getEnvConfig();
  try {
    await fetchRgEndpoint(rgReservationsApi, token, 0, 1);
    return {
      connected: true,
      hasToken: true,
      checkedAt: nowIso(),
      message: 'الاتصال بواجهة Rental Gate API ناجح ويعمل بشكل سليم.',
    };
  } catch (err) {
    return {
      connected: false,
      hasToken: true,
      checkedAt: nowIso(),
      message: err?.message || String(err),
    };
  }
}

export async function syncRentalGateReservations(actor) {
  const startedAt = Date.now();
  const token = await resolveActiveRgToken();
  if (!token) {
    throw serviceUnavailable('لم يتم ضبط توكن Rental Gate API (RG_API_TOKEN) في إعدادات الخادم.');
  }

  const { rgReservationsApi, rgExtendsApi } = getEnvConfig();
  const [resFetch, extFetch, existingSnap] = await Promise.all([
    fetchAllRgPages(rgReservationsApi, token),
    fetchAllRgPages(rgExtendsApi, token),
    gasClient.snapshot(['reservations', 'settings'], true),
  ]);

  const settingsMap = {};
  (existingSnap.settings || []).forEach((s) => { settingsMap[s.key] = s.value; });
  let excludedStatuses = ['draft', 'test', 'abandoned'];
  try {
    const parsedExcl = JSON.parse(settingsMap.excluded_statuses || '[]');
    if (Array.isArray(parsedExcl)) excludedStatuses = parsedExcl.map((x) => normalizeStr(x).toLowerCase());
  } catch {}

  const existingByResNum = {};
  (existingSnap.reservations || []).forEach((r) => {
    existingByResNum[normalizeStr(r.reservationNumber)] = r;
  });

  const acceptedExtByRes = {};
  const extRecords = [];
  const rawExts = core.dedupeExtensionsByNumber(extFetch.items);
  for (const ext of rawExts) {
    const ok = core.isExtensionAcceptedAndPaid(ext);
    const resNum = normalizeStr(ext.reservationNumber || ext.reservation_number || ext.reservationId);
    const extRec = {
      id: `EXT_${normalizeStr(ext.extendId || ext.extensionNumber || ext.id)}`,
      extensionNumber: normalizeStr(ext.extensionNumber || ext.extendId || ext.id),
      reservationId: resNum ? `RES_${resNum}` : '',
      reservationNumber: resNum,
      statusCode: normalizeStr(ext.reservationStatus || ext.status),
      statusAr: core.translateOriginalStatus(ext.reservationStatus || ext.status),
      paymentStatus: normalizeStr(ext.paymentStatus || ext.paymentResult || (ok ? 'paid' : 'unpaid')),
      extendDays: toNumber(ext.extendDays || ext.days, 0),
      startDate: formatDisplayDate(ext.startDate),
      endDate: formatDisplayDate(ext.endDate),
      amount: toNumber(ext.total ?? ext.amount, 0),
      isAcceptedAndPaid: ok ? 'true' : 'false',
      syncedAt: nowIso(),
    };
    extRecords.push(extRec);
    if (ok && resNum) {
      if (!acceptedExtByRes[resNum]) acceptedExtByRes[resNum] = [];
      acceptedExtByRes[resNum].push(extRec);
    }
  }

  const rawRes = core.dedupeReservationsByNumber(resFetch.items);
  const mergedList = [];
  let importedCount = 0;
  let updatedCount = 0;

  for (const item of rawRes) {
    const stCode = normalizeStr(item.reservationStatus || item.status).toLowerCase();
    if (excludedStatuses.includes(stCode)) continue;
    const resNum = normalizeStr(item.reservationNumber || item.reservationId || item.id);
    if (!resNum) continue;
    const existing = existingByResNum[resNum] || null;
    if (existing) updatedCount++;
    else importedCount++;

    const merged = core.mergeSyncedReservation(existing, item, acceptedExtByRes[resNum] || [], actor);
    merged.rawJson = '';
    mergedList.push(merged);
  }

  if (mergedList.length > 0) {
    await gasClient.upsertBatch('reservations', 'reservationNumber', mergedList);
  }
  if (extRecords.length > 0) {
    await gasClient.upsertBatch('extensions', 'id', extRecords);
  }

  const finishedAt = nowIso();
  const syncLog = {
    triggeredById: actor.id,
    triggeredByName: actor.name,
    status: 'success',
    importedCount,
    updatedCount,
    extensionsCount: extRecords.filter((x) => x.isAcceptedAndPaid === 'true').length,
    pagesFetched: resFetch.pagesFetched + extFetch.pagesFetched,
    errorMessage: '',
    durationMs: Date.now() - startedAt,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt,
  };
  await gasClient.create('sync_log', syncLog, { allowDuplicate: true }).catch(() => {});

  await gasClient.create('activity_log', {
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    actionType: 'مزامنة Rental Gate',
    entityType: 'Reservation',
    entityId: `SYNC_${importedCount + updatedCount}`,
    details: `تمت المزامنة: ${importedCount} جديد، ${updatedCount} محدث`,
    logDate: todayDateStr(),
    logTime: currentTime24Str(),
  }, { allowDuplicate: true }).catch(() => {});

  return {
    importedCount,
    updatedCount,
    extensionsCount: syncLog.extensionsCount,
    pagesFetched: syncLog.pagesFetched,
    finishedAt,
  };
}
