import * as crm from '../services/crmDataService.js';

export async function getReports(req, res, next) {
  try {
    const data = await crm.getReportsData(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}
