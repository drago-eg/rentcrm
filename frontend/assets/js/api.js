/**
 * RENTAL GATE CRM — Production Backend REST API Client
 * Connects exclusively to the independent Node.js + Express Backend (/api/*) with JWT Bearer Auth.
 * No mock/sandbox database or direct database/Apps Script URL calls on the frontend.
 */
(function (root) {
  'use strict';

  var SESSION_TOKEN_KEY = 'rg_crm_jwt_token';
  var memoryToken = '';
  var apiCache = {};

  function getApiBaseUrl() {
    var configured = (typeof root.__RG_API_BASE_URL__ === 'string' ? root.__RG_API_BASE_URL__ : '').trim();
    if (!configured) return '/api';
    var clean = configured.replace(/\/+$/, '');
    if (clean.endsWith('/api')) return clean;
    return clean + '/api';
  }

  function getToken() {
    try {
      var tok = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (tok) return tok.trim();
    } catch (e) {}
    return memoryToken;
  }

  function setToken(token) {
    var clean = String(token || '').trim();
    memoryToken = clean;
    try {
      if (clean) sessionStorage.setItem(SESSION_TOKEN_KEY, clean);
      else sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (e) {}
    clearCache();
  }

  function clearCache() {
    apiCache = {};
  }

  function primeCache(action, payload, data) {
    var core = root.RGCrmCore;
    if (!core || !core.getApiCachePolicy || !core.buildApiCacheKey) return;
    var policy = core.getApiCachePolicy(action);
    if (!policy.cacheable) return;
    var key = core.buildApiCacheKey(getApiBaseUrl(), getToken(), action, payload || {});
    apiCache[key] = {
      expiresAt: Date.now() + policy.ttlMs,
      data: data
    };
  }

  function hasCached(action, payload) {
    var core = root.RGCrmCore;
    if (!core || !core.getApiCachePolicy || !core.buildApiCacheKey) return false;
    var policy = core.getApiCachePolicy(action);
    if (!policy.cacheable) return false;
    var key = core.buildApiCacheKey(getApiBaseUrl(), getToken(), action, payload || {});
    var entry = apiCache[key];
    return Boolean(entry && Date.now() < entry.expiresAt);
  }

  function formatDisplayDate(val) {
    return root.RGCrmCore && root.RGCrmCore.formatDisplayDate ? root.RGCrmCore.formatDisplayDate(val) : (val ? String(val) : '');
  }

  function formatDisplayTime(val, options) {
    return root.RGCrmCore && root.RGCrmCore.formatDisplayTime ? root.RGCrmCore.formatDisplayTime(val, options) : (val ? String(val) : '');
  }

  function formatDisplayDateTime(val, options) {
    return root.RGCrmCore && root.RGCrmCore.formatDisplayDateTime ? root.RGCrmCore.formatDisplayDateTime(val, options) : (val ? String(val) : '');
  }

  function buildQueryString(params) {
    if (!params || typeof params !== 'object') return '';
    var qs = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (k === 'visibleCols' || k === 'forceRefresh') return;
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      if (typeof v === 'boolean' && !v) return;
      qs.set(k, String(v));
    });
    var s = qs.toString();
    return s ? ('?' + s) : '';
  }

  async function request(method, path, body, options) {
    var url = getApiBaseUrl() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = { Accept: 'application/json' };
    var token = getToken();
    if (token && !(options && options.omitAuth)) {
      headers.Authorization = 'Bearer ' + token;
    }

    var fetchOpts = {
      method: method || 'GET',
      headers: headers,
      cache: 'no-store'
    };

    if (body instanceof FormData) {
      fetchOpts.body = body;
    } else if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }

    try {
      var res = await fetch(url, fetchOpts);
      var text = await res.text();
      var parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch (e) {
        parsed = null;
      }

      if (res.status === 401 && !(options && options.skipUnauthorizedEvent)) {
        setToken('');
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('rg:unauthorized'));
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        return {
          success: false,
          message: 'تعذر قراءة استجابة الخادم (HTTP ' + res.status + ').',
          data: null,
          error: 'INVALID_RESPONSE'
        };
      }
      return parsed;
    } catch (err) {
      return {
        success: false,
        message: 'تعذر الاتصال بخادم النظام (Backend): ' + (err && err.message ? err.message : String(err)),
        data: null,
        error: 'NETWORK_ERROR'
      };
    }
  }

  async function downloadFile(path, fallbackFilename) {
    var url = getApiBaseUrl() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    var res = await fetch(url, { method: 'GET', headers: headers });
    if (!res.ok) {
      var errText = await res.text();
      try {
        var parsed = JSON.parse(errText);
        throw new Error(parsed.message || 'تعذر تنزيل الملف.');
      } catch (e) {
        throw new Error('تعذر تنزيل الملف (HTTP ' + res.status + ').');
      }
    }

    var blob = await res.blob();
    var disp = res.headers.get('Content-Disposition') || '';
    var match = disp.match(/filename="?([^"]+)"?/i);
    var filename = (match && match[1]) ? match[1] : (fallbackFilename || 'export.xlsx');

    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
  }

  async function checkBackendHealth() {
    return request('GET', '/health', null, { omitAuth: true, skipUnauthorizedEvent: true });
  }

  // Unified adapter preserving existing UI module callApi(action, payload) interface
  async function callApi(action, payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    var core = root.RGCrmCore;

    if (core && core.getApiCachePolicy && core.buildApiCacheKey && !p.forceRefresh) {
      var policy = core.getApiCachePolicy(action);
      if (policy.cacheable) {
        var key = core.buildApiCacheKey(getApiBaseUrl(), getToken(), action, p);
        var cached = apiCache[key];
        if (cached && Date.now() < cached.expiresAt) {
          return { success: true, message: '', data: cached.data, error: null };
        }
      }
    }

    var response;
    switch (action) {
      case 'login':
        response = await request('POST', '/auth/login', p, { omitAuth: true, skipUnauthorizedEvent: true });
        break;
      case 'logout':
        response = await request('POST', '/auth/logout', {});
        break;
      case 'getMe':
        response = await request('GET', '/auth/me');
        break;
      case 'getAppBootstrap':
        response = await request('GET', '/auth/bootstrap' + buildQueryString(p));
        break;
      case 'getDashboard':
        response = await request('GET', '/dashboard' + buildQueryString(p));
        break;

      // Reservations
      case 'getReservations':
        response = await request('GET', '/reservations' + buildQueryString(p));
        break;
      case 'getReservationDetails':
        response = await request('GET', '/reservations/' + encodeURIComponent(p.reservationId || p.id || ''));
        break;
      case 'createReservation':
        response = await request('POST', '/reservations', p);
        break;
      case 'claimReservation':
        response = await request('POST', '/reservations/' + encodeURIComponent(p.reservationId) + '/claim', {});
        break;
      case 'unclaimReservation':
        response = await request('POST', '/reservations/' + encodeURIComponent(p.reservationId) + '/unclaim', {});
        break;
      case 'quickUpdateReservationStatus':
        response = await request('POST', '/reservations/' + encodeURIComponent(p.reservationId) + '/quick-status', p);
        break;
      case 'updateReservationDetails':
        response = await request('PUT', '/reservations/' + encodeURIComponent(p.reservationId), p);
        break;
      case 'deleteReservation':
        response = await request('DELETE', '/reservations/' + encodeURIComponent(p.reservationId || p.id));
        break;
      case 'assignEmployees':
        response = await request('POST', '/reservations/' + encodeURIComponent(p.reservationId) + '/assign', p);
        break;
      case 'removeAssignment':
        response = await request('DELETE', '/reservations/' + encodeURIComponent(p.reservationId) + '/assign/' + encodeURIComponent(p.employeeId));
        break;
      case 'pullReservations':
        response = await request('POST', '/reservations/pull', {});
        break;

      // Customers
      case 'getCustomers':
        response = await request('GET', '/customers' + buildQueryString(p));
        break;
      case 'createCustomer':
        response = await request('POST', '/customers', p);
        break;
      case 'updateCustomer':
        response = await request('PUT', '/customers/' + encodeURIComponent(p.id), p);
        break;
      case 'deleteCustomer':
        response = await request('DELETE', '/customers/' + encodeURIComponent(p.id));
        break;

      // Tasks
      case 'getTasks':
        response = await request('GET', '/tasks' + buildQueryString(p));
        break;
      case 'createTask':
        response = await request('POST', '/tasks', p);
        break;
      case 'updateTask':
        response = await request('PUT', '/tasks/' + encodeURIComponent(p.id), p);
        break;
      case 'deleteTask':
        response = await request('DELETE', '/tasks/' + encodeURIComponent(p.id));
        break;

      // Follow-Ups
      case 'getMyFollowUps':
        response = await request('GET', '/followups/mine');
        break;
      case 'getTeamFollowUps':
        response = await request('GET', '/followups/team' + buildQueryString(p));
        break;
      case 'getFollowUpHistory':
        response = await request('GET', '/followups/history/' + encodeURIComponent(p.reservationId));
        break;
      case 'addFollowUp':
        response = await request('POST', '/followups', p);
        break;
      case 'updateFollowUp':
        response = await request('PUT', '/followups/' + encodeURIComponent(p.followUpId || p.id), p);
        break;
      case 'deleteFollowUp':
        response = await request('DELETE', '/followups/' + encodeURIComponent(p.followUpId || p.id));
        break;

      // Problems / Complaints
      case 'getProblems':
        response = await request('GET', '/problems' + buildQueryString(p));
        break;
      case 'createProblem':
        response = await request('POST', '/problems', p);
        break;
      case 'updateProblem':
        response = await request('PUT', '/problems/' + encodeURIComponent(p.problemId || p.id), p);
        break;
      case 'deleteProblem':
        response = await request('DELETE', '/problems/' + encodeURIComponent(p.problemId || p.id));
        break;

      // Employees & Roles
      case 'getEmployees':
        response = await request('GET', '/employees');
        break;
      case 'getEmployeeDetails':
        response = await request('GET', '/employees/' + encodeURIComponent(p.employeeId || p.id));
        break;
      case 'createEmployee':
        response = await request('POST', '/employees', p);
        break;
      case 'updateEmployee':
        response = await request('PUT', '/employees/' + encodeURIComponent(p.employeeId || p.id), p);
        break;
      case 'disableEmployee':
        response = await request('PATCH', '/employees/' + encodeURIComponent(p.employeeId || p.id) + '/status', { status: p.status });
        break;
      case 'deleteEmployee':
        response = await request('DELETE', '/employees/' + encodeURIComponent(p.employeeId || p.id));
        break;
      case 'saveRolePreset':
        response = await request('POST', '/employees/presets', p);
        break;
      case 'deleteRolePreset':
        response = await request('DELETE', '/employees/presets/' + encodeURIComponent(p.presetId || p.id));
        break;
      case 'resetRolePresets':
        response = await request('POST', '/employees/presets/reset', {});
        break;
      case 'savePermissionDefinition':
        response = await request('POST', '/employees/permissions-def', p);
        break;
      case 'deletePermissionDefinition':
        response = await request('DELETE', '/employees/permissions-def/' + encodeURIComponent(p.key));
        break;

      // System, Reports, Notifications, Settings
      case 'getReports':
        response = await request('GET', '/reports' + buildQueryString(p));
        break;
      case 'getActivityLogs':
        response = await request('GET', '/activity' + buildQueryString(p));
        break;
      case 'getNotifications':
        response = await request('GET', '/notifications');
        break;
      case 'markNotificationRead':
        response = await request('POST', '/notifications/mark-read', p);
        break;
      case 'getSettings':
        response = await request('GET', '/settings');
        break;
      case 'updateSettings':
        response = await request('PUT', '/settings', p);
        break;
      case 'getSyncStatus':
        response = await request('GET', '/settings/sync-status');
        break;
      case 'syncRentalGate':
        response = await request('POST', '/settings/sync', {});
        break;
      case 'testConnection':
        response = await request('POST', '/settings/test-connection', {});
        break;
      case 'testDatabaseConnection':
        response = await request('POST', '/settings/test-db', {});
        break;
      case 'saveApiToken':
        response = await request('POST', '/settings/api-token', p);
        break;
      default:
        response = { success: false, message: 'الإجراء غير مدعوم: ' + action, data: null, error: 'UNKNOWN_ACTION' };
    }

    if (response && response.success) {
      if (core && core.getCacheInvalidationScopes && core.getCacheInvalidationScopes(action).length > 0) {
        clearCache();
      } else if (core && core.getApiCachePolicy && core.buildApiCacheKey) {
        var pol = core.getApiCachePolicy(action);
        if (pol.cacheable) {
          primeCache(action, p, response.data);
        }
      }
    } else if (action !== 'getMe' && action !== 'getNotifications') {
      clearCache();
    }

    return response;
  }

  root.RGApi = {
    getApiBaseUrl: getApiBaseUrl,
    getToken: getToken,
    setToken: setToken,
    clearCache: clearCache,
    primeCache: primeCache,
    hasCached: hasCached,
    request: request,
    downloadFile: downloadFile,
    checkBackendHealth: checkBackendHealth,
    callApi: callApi,
    formatDisplayDate: formatDisplayDate,
    formatDisplayTime: formatDisplayTime,
    formatDisplayDateTime: formatDisplayDateTime
  };
})(window);
