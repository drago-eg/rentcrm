import { getEnvConfig } from '../config/env.js';
import { AppError, badRequest, conflict, notFound, serviceUnavailable } from '../utils/errors.js';

function mapGasError(message, code) {
  const msg = String(message || 'خطأ في الاتصال بقاعدة بيانات Google Sheets.');
  const cleanCode = String(code || '');

  if (msg.startsWith('DUPLICATE_RECORD:') || cleanCode === 'DUPLICATE_RECORD') {
    return conflict(msg.replace(/^DUPLICATE_RECORD:\s*/, ''));
  }
  if (msg.startsWith('NOT_FOUND:') || cleanCode === 'NOT_FOUND') {
    return notFound(msg.replace(/^NOT_FOUND:\s*/, ''));
  }
  if (msg.startsWith('VALIDATION:') || cleanCode === 'VALIDATION') {
    return badRequest(msg.replace(/^VALIDATION:\s*/, ''));
  }
  if (msg.startsWith('UNAUTHORIZED:') || cleanCode === 'UNAUTHORIZED') {
    return new AppError(502, 'GAS_UNAUTHORIZED', 'فشل التحقق مع خادم Google Apps Script (تحقق من GAS_API_SECRET).');
  }
  return new AppError(502, cleanCode || 'GAS_ERROR', msg);
}

async function callGasEndpoint(method, paramsOrBody) {
  const { gasWebAppUrl, gasApiSecret } = getEnvConfig();
  if (!gasWebAppUrl) {
    throw serviceUnavailable(
      'لم يتم ضبط رابط Google Apps Script Web App (GAS_WEB_APP_URL) في متغيرات البيئة الخاصة بالخادم.',
      'GAS_NOT_CONFIGURED'
    );
  }

  let res;
  try {
    if (method === 'GET') {
      const url = new URL(gasWebAppUrl);
      const queryObj = { ...(paramsOrBody || {}) };
      if (gasApiSecret) queryObj.secret = gasApiSecret;
      for (const [k, v] of Object.entries(queryObj)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
      res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
      });
    } else {
      const payloadBody = {
        ...(paramsOrBody || {}),
        _method: method,
        secret: gasApiSecret || undefined,
      };
      res = await fetch(gasWebAppUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });
    }
  } catch (err) {
    throw serviceUnavailable(
      `تعذر الاتصال بخادم Google Apps Script: ${err?.message || String(err)}`,
      'GAS_NETWORK_ERROR'
    );
  }

  const text = await res.text();
  if (!text || text.trim().startsWith('<')) {
    throw new AppError(
      502,
      'GAS_INVALID_RESPONSE',
      'أعاد خادم Google Apps Script استجابة HTML أو استجابة فارغة. تحقق من رابط /exec وصلاحيات النشر (Anyone).'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(502, 'GAS_INVALID_JSON', 'تعذر قراءة استجابة JSON من Google Apps Script.');
  }

  if (!parsed || !parsed.success) {
    throw mapGasError(parsed?.message || parsed?.error, parsed?.error);
  }

  return parsed.data;
}

export const gasClient = {
  isConfigured() {
    return Boolean(getEnvConfig().gasWebAppUrl);
  },

  async health() {
    return callGasEndpoint('POST', { action: 'engine_health' });
  },

  async initDatabase() {
    return callGasEndpoint('POST', { action: 'engine_init' });
  },

  async snapshot(resources = [], skipCache = false) {
    return callGasEndpoint('POST', {
      action: 'engine_snapshot',
      payload: { resources, skipCache },
    });
  },

  async list(resource, query = {}) {
    return callGasEndpoint('GET', { resource, ...query });
  },

  async get(resource, id) {
    return callGasEndpoint('GET', { resource, id });
  },

  async create(resource, payload, options = {}) {
    return callGasEndpoint('POST', {
      resource,
      allowDuplicate: Boolean(options.allowDuplicate),
      payload,
    });
  },

  async update(resource, id, payload) {
    return callGasEndpoint('PUT', {
      resource,
      id,
      payload,
    });
  },

  async remove(resource, id) {
    return callGasEndpoint('DELETE', {
      resource,
      id,
    });
  },

  async upsertBatch(resource, keyField, records) {
    return callGasEndpoint('POST', {
      action: 'engine_upsert_batch',
      resource,
      payload: { keyField, records },
    });
  },
};
