import * as crm from '../services/crmDataService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.getActivityLogs(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}
