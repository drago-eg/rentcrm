import * as crm from '../services/crmDataService.js';
import { gasClient } from '../services/gasClient.js';
import {
  saveRgApiToken,
  testRgConnection,
  syncRentalGateReservations,
} from '../services/rentalGateSyncService.js';

export async function getSettings(_req, res, next) {
  try {
    const data = await crm.getSystemSettings();
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const data = await crm.updateSystemSettings(req.auth.user, req.body || {});
    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function saveToken(req, res, next) {
  try {
    const data = await saveRgApiToken(req.body?.token, Boolean(req.body?.testAfterSave));
    res.json({ success: true, message: 'تم حفظ توكن Rental Gate بأمان على الخادم.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function testConnection(_req, res, next) {
  try {
    const data = await testRgConnection();
    res.json({ success: true, message: data.message, data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function testDatabaseConnection(_req, res, next) {
  try {
    const data = await gasClient.health();
    res.json({ success: true, message: 'الاتصال بـ Google Apps Script & Google Sheets يعمل بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function syncNow(req, res, next) {
  try {
    const data = await syncRentalGateReservations(req.auth.user);
    res.json({ success: true, message: 'اكتملت المزامنة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function syncStatus(_req, res, next) {
  try {
    const settings = await crm.getSystemSettings();
    res.json({
      success: true,
      message: '',
      data: {
        logs: settings.syncLogs,
        lastSync: settings.lastSync,
        autoSyncEnabled: settings.auto_sync_enabled,
        autoSyncIntervalHours: settings.auto_sync_interval_hours,
        gasConfigured: settings.gasConfigured,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}
