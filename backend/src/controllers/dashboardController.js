import { getDashboardData } from '../services/crmDataService.js';

export async function getDashboard(req, res, next) {
  try {
    const data = await getDashboardData(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}
