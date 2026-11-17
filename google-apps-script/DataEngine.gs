/**
 * RENTAL GATE CRM — REST Data Engine for Independent Node.js Backend
 * Supports GET, POST, PUT, DELETE with LockService concurrency control,
 * unique ID generation, duplicate prevention, timestamps, search/filtering,
 * and shared GAS_API_SECRET verification.
 */

var RG_RESOURCE_CONFIG = {
  users: { sheet: 'Users', idField: 'id', prefix: 'USR', uniqueFields: ['username'] },
  employees: { sheet: 'Employees', idField: 'id', prefix: 'EMP', uniqueFields: ['username'] },
  customers: { sheet: 'Customers', idField: 'id', prefix: 'CUS', uniqueFields: ['phone', 'email'] },
  reservations: { sheet: 'Reservations', idField: 'id', prefix: 'RES', uniqueFields: ['reservationNumber'] },
  extensions: { sheet: 'Extensions', idField: 'id', prefix: 'EXT', uniqueFields: ['extensionNumber'] },
  assignments: { sheet: 'Assignments', idField: 'id', prefix: 'ASN', uniqueFields: [] },
  followups: { sheet: 'FollowUps', idField: 'id', prefix: 'FU', uniqueFields: [] },
  followup_history: { sheet: 'FollowUpHistory', idField: 'id', prefix: 'FUH', uniqueFields: [] },
  problems: { sheet: 'Problems', idField: 'id', prefix: 'PRB', uniqueFields: ['problemNumber'] },
  problem_updates: { sheet: 'ProblemUpdates', idField: 'id', prefix: 'PU', uniqueFields: [] },
  tasks: { sheet: 'Tasks', idField: 'id', prefix: 'TSK', uniqueFields: [] },
  activity_log: { sheet: 'ActivityLog', idField: 'id', prefix: 'ACT', uniqueFields: [] },
  notifications: { sheet: 'Notifications', idField: 'id', prefix: 'NTF', uniqueFields: [] },
  settings: { sheet: 'Settings', idField: 'key', prefix: 'SET', uniqueFields: ['key'] },
  roles: { sheet: 'Roles', idField: 'id', prefix: 'PRESET', uniqueFields: ['id'] },
  permissions: { sheet: 'Permissions', idField: 'key', prefix: 'PERM', uniqueFields: ['key'] },
  sessions: { sheet: 'Sessions', idField: 'tokenHash', prefix: 'SES', uniqueFields: ['tokenHash'] },
  sync_log: { sheet: 'SyncLog', idField: 'id', prefix: 'SYNC', uniqueFields: [] }
};

function verifyGasApiSecret_(providedSecret) {
  var configured = normalizeStr(PropertiesService.getScriptProperties().getProperty('GAS_API_SECRET'));
  if (!configured) {
    return true;
  }
  if (normalizeStr(providedSecret) !== configured) {
    throw new Error('UNAUTHORIZED: Invalid GAS_API_SECRET.');
  }
  return true;
}

function getResourceConfig_(resourceName) {
  var key = normalizeStr(resourceName).toLowerCase();
  var cfg = RG_RESOURCE_CONFIG[key];
  if (!cfg) {
    throw new Error('UNKNOWN_RESOURCE: ' + resourceName);
  }
  return cfg;
}

function normalizeRecordOutput_(sheetName, rec) {
  if (!rec || typeof rec !== 'object') return rec;
  var out = Object.assign({}, rec);
  if (sheetName === RG_SHEETS.RESERVATIONS || sheetName === RG_SHEETS.PROBLEMS || sheetName === RG_SHEETS.ISSUES) {
    if (typeof out.assignedEmployeeIds === 'string') {
      out.assignedEmployeeIds = safeJsonParse(out.assignedEmployeeIds, []);
    }
    if (typeof out.assignedEmployeeNames === 'string') {
      out.assignedEmployeeNames = safeJsonParse(out.assignedEmployeeNames, []);
    }
  }
  if (sheetName === RG_SHEETS.RESERVATIONS) {
    out.baseAmount = toNumber(out.baseAmount, 0);
    out.extensionsAmount = toNumber(out.extensionsAmount, 0);
    out.totalAmount = toNumber(out.totalAmount, 0);
    out.daysCount = toNumber(out.daysCount, 1);
    out.hasExtensions = toBool(out.hasExtensions);
    out.hasProblem = toBool(out.hasProblem);
  }
  if (sheetName === RG_SHEETS.EMPLOYEES || sheetName === RG_SHEETS.USERS || sheetName === RG_SHEETS.ROLES) {
    if (typeof out.permissions === 'string') {
      out.permissions = safeJsonParse(out.permissions, []);
    }
  }
  if (sheetName === RG_SHEETS.NOTIFICATIONS) {
    out.isRead = toBool(out.isRead);
  }
  return out;
}

function serializeRecordForSheet_(sheetName, obj) {
  var copy = Object.assign({}, obj);
  var jsonFields = ['assignedEmployeeIds', 'assignedEmployeeNames', 'permissions'];
  for (var i = 0; i < jsonFields.length; i++) {
    var f = jsonFields[i];
    if (Array.isArray(copy[f])) {
      copy[f] = JSON.stringify(copy[f]);
    }
  }
  if (sheetName === RG_SHEETS.RESERVATIONS) {
    if (copy.hasExtensions !== undefined) copy.hasExtensions = copy.hasExtensions ? 'true' : 'false';
    if (copy.hasProblem !== undefined) copy.hasProblem = copy.hasProblem ? 'true' : 'false';
  }
  if (sheetName === RG_SHEETS.NOTIFICATIONS && copy.isRead !== undefined) {
    copy.isRead = copy.isRead ? 'true' : 'false';
  }
  return copy;
}

function assertNoDuplicate_(cfg, candidate, excludeIdValue) {
  var uniqueFields = cfg.uniqueFields || [];
  if (!uniqueFields.length) return;
  var existing = readAllRecords(cfg.sheet, true);
  for (var f = 0; f < uniqueFields.length; f++) {
    var field = uniqueFields[f];
    var candVal = normalizeStr(candidate[field]).toLowerCase();
    if (!candVal) continue;
    for (var i = 0; i < existing.length; i++) {
      var row = existing[i];
      if (excludeIdValue && normalizeStr(row[cfg.idField]) === normalizeStr(excludeIdValue)) {
        continue;
      }
      var rowVal = normalizeStr(row[field]).toLowerCase();
      if (rowVal && rowVal === candVal) {
        throw new Error('DUPLICATE_RECORD: السجل مكرر بناءً على الحقل (' + field + ': ' + candidate[field] + ').');
      }
    }
  }
}

function applyQuerySearchAndFilters_(rows, queryObj) {
  var q = normalizeStr(queryObj && (queryObj.q || queryObj.search)).toLowerCase();
  var filters = (queryObj && queryObj.filters && typeof queryObj.filters === 'object') ? queryObj.filters : {};
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var matched = true;
    var fKeys = Object.keys(filters);
    for (var k = 0; k < fKeys.length; k++) {
      var key = fKeys[k];
      var expected = filters[key];
      if (expected === '' || expected === null || expected === undefined) continue;
      if (Array.isArray(r[key])) {
        if (r[key].indexOf(expected) === -1) { matched = false; break; }
      } else if (normalizeStr(r[key]).toLowerCase() !== normalizeStr(expected).toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    if (q) {
      var hay = JSON.stringify(r).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    out.push(r);
  }
  return out;
}

function handleRestDataRequest_(method, body, params) {
  var secret = normalizeStr(body.secret || params.secret);
  verifyGasApiSecret_(secret);

  var resource = normalizeStr(body.resource || params.resource);
  var action = normalizeStr(body.action || params.action);
  var id = normalizeStr(body.id || params.id);
  var payload = body.payload !== undefined ? body.payload : (params.payload !== undefined ? safeJsonParse(params.payload, {}) : {});

  // Special engine endpoints for Node.js Backend
  if (action === 'engine_health') {
    var ss = getSpreadsheet();
    return {
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      timestamp: nowIso(),
      hasRgToken: Boolean(getRgToken())
    };
  }

  if (action === 'engine_init') {
    return initDatabase();
  }

  if (action === 'engine_snapshot') {
    var sheetsWanted = Array.isArray(payload.resources) && payload.resources.length
      ? payload.resources
      : ['employees', 'customers', 'reservations', 'extensions', 'followups', 'followup_history', 'problems', 'problem_updates', 'tasks', 'activity_log', 'notifications', 'settings', 'roles', 'permissions', 'sync_log'];
    var snapshot = {};
    for (var s = 0; s < sheetsWanted.length; s++) {
      var rCfg = getResourceConfig_(sheetsWanted[s]);
      var recs = readAllRecords(rCfg.sheet, Boolean(payload.skipCache));
      snapshot[sheetsWanted[s]] = recs.map(function (item) {
        return normalizeRecordOutput_(rCfg.sheet, item);
      });
    }
    snapshot._meta = {
      hasRgToken: Boolean(getRgToken()),
      timestamp: nowIso()
    };
    return snapshot;
  }

  if (action === 'engine_upsert_batch') {
    var batchCfg = getResourceConfig_(resource);
    var records = Array.isArray(payload.records) ? payload.records : [];
    var keyField = normalizeStr(payload.keyField) || batchCfg.idField;
    return withScriptLock(function () {
      var now = nowIso();
      var prepared = records.map(function (rec) {
        var copy = Object.assign({}, rec);
        if (!copy[batchCfg.idField]) copy[batchCfg.idField] = generateId(batchCfg.prefix);
        if (!copy.createdAt) copy.createdAt = now;
        copy.updatedAt = now;
        return serializeRecordForSheet_(batchCfg.sheet, copy);
      });
      var res = batchUpsertRecords(batchCfg.sheet, keyField, prepared);
      if (batchCfg.sheet === RG_SHEETS.PROBLEMS) {
        for (var i = 0; i < records.length; i++) syncIssueSheetRecord(records[i]);
      }
      if (batchCfg.sheet === RG_SHEETS.EMPLOYEES) {
        for (var j = 0; j < records.length; j++) syncUserSheetRecord(records[j]);
      }
      return res;
    });
  }

  var cfg = getResourceConfig_(resource);
  var verb = normalizeStr(method || 'GET').toUpperCase();

  if (verb === 'GET') {
    var all = readAllRecords(cfg.sheet, toBool(params.skipCache)).map(function (item) {
      return normalizeRecordOutput_(cfg.sheet, item);
    });
    if (id) {
      for (var g = 0; g < all.length; g++) {
        if (normalizeStr(all[g][cfg.idField]) === id) {
          return { item: all[g] };
        }
      }
      throw new Error('NOT_FOUND: السجل غير موجود.');
    }
    var queryFilters = {};
    var reservedKeys = { resource: 1, action: 1, id: 1, method: 1, _method: 1, secret: 1, q: 1, search: 1, skipCache: 1, payload: 1 };
    var pKeys = Object.keys(params || {});
    for (var pk = 0; pk < pKeys.length; pk++) {
      if (!reservedKeys[pKeys[pk]]) queryFilters[pKeys[pk]] = params[pKeys[pk]];
    }
    var filtered = applyQuerySearchAndFilters_(all, {
      q: params.q || params.search || (payload && payload.q),
      filters: Object.assign(queryFilters, (payload && payload.filters) || {})
    });
    return { items: filtered, total: filtered.length };
  }

  if (verb === 'POST') {
    return withScriptLock(function () {
      var data = Object.assign({}, payload);
      var now = nowIso();
      if (!data[cfg.idField]) {
        data[cfg.idField] = generateId(cfg.prefix);
      }
      if (cfg.sheet === RG_SHEETS.PROBLEMS && !data.problemNumber) {
        data.problemNumber = 'PRB-' + String(Math.floor(1000 + Math.random() * 9000));
      }
      if (!data.createdAt) data.createdAt = now;
      if (cfg.sheet !== RG_SHEETS.FOLLOWUPS && cfg.sheet !== RG_SHEETS.ACTIVITY_LOG && cfg.sheet !== RG_SHEETS.NOTIFICATIONS && cfg.sheet !== RG_SHEETS.PROBLEM_UPDATES && cfg.sheet !== RG_SHEETS.FOLLOWUP_HISTORY) {
        data.updatedAt = now;
      }

      if (!toBool(body.allowDuplicate || payload.allowDuplicate)) {
        assertNoDuplicate_(cfg, data, null);
      }
      var serialized = serializeRecordForSheet_(cfg.sheet, data);
      appendRecord(cfg.sheet, serialized);

      if (cfg.sheet === RG_SHEETS.PROBLEMS) syncIssueSheetRecord(data);
      if (cfg.sheet === RG_SHEETS.EMPLOYEES) syncUserSheetRecord(data);
      return { item: normalizeRecordOutput_(cfg.sheet, data) };
    });
  }

  if (verb === 'PUT' || verb === 'PATCH') {
    var targetId = id || normalizeStr(payload[cfg.idField]);
    if (!targetId) throw new Error('VALIDATION: معرف السجل مطلوب للتعديل.');
    return withScriptLock(function () {
      var patch = Object.assign({}, payload);
      patch.updatedAt = nowIso();
      assertNoDuplicate_(cfg, patch, targetId);
      var serializedPatch = serializeRecordForSheet_(cfg.sheet, patch);
      var updated = updateRecordByKey(cfg.sheet, cfg.idField, targetId, serializedPatch);
      if (!updated) throw new Error('NOT_FOUND: السجل المطلوب تعديله غير موجود.');
      var normalized = normalizeRecordOutput_(cfg.sheet, updated);
      if (cfg.sheet === RG_SHEETS.PROBLEMS) syncIssueSheetRecord(normalized);
      if (cfg.sheet === RG_SHEETS.EMPLOYEES) syncUserSheetRecord(normalized);
      return { item: normalized };
    });
  }

  if (verb === 'DELETE') {
    var delId = id || normalizeStr(payload[cfg.idField]);
    if (!delId) throw new Error('VALIDATION: معرف السجل مطلوب للحذف.');
    return withScriptLock(function () {
      var deleted = deleteRecordByKey(cfg.sheet, cfg.idField, delId);
      if (!deleted) throw new Error('NOT_FOUND: السجل غير موجود للحذف.');
      if (cfg.sheet === RG_SHEETS.PROBLEMS) deleteRecordByKey(RG_SHEETS.ISSUES, 'id', delId);
      if (cfg.sheet === RG_SHEETS.EMPLOYEES) deleteRecordByKey(RG_SHEETS.USERS, 'id', delId);
      return { deleted: true, id: delId };
    });
  }

  throw new Error('UNSUPPORTED_METHOD: ' + verb);
}
