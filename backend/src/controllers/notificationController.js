import * as crm from '../services/crmDataService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.getNotifications(req.auth.user);
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const data = await crm.markNotificationRead(req.auth.user, req.body || {});
    res.json({ success: true, message: 'تم تحديث الإشعارات.', data, error: null });
  } catch (err) {
    next(err);
  }
}
