import * as crm from '../services/crmDataService.js';

export async function mine(req, res, next) {
  try {
    const data = await crm.getMyFollowUps(req.auth.user);
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function team(req, res, next) {
  try {
    const data = await crm.getTeamFollowUps(req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.addFollowUp(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم تسجيل المتابعة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateFollowUp(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تعديل المتابعة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteFollowUp(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف المتابعة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function history(req, res, next) {
  try {
    const details = await crm.getReservationDetails(req.params.reservationId);
    res.json({ success: true, message: '', data: { items: details.followUpHistory }, error: null });
  } catch (err) {
    next(err);
  }
}
