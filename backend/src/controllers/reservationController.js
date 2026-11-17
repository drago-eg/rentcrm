import * as crm from '../services/crmDataService.js';
import { syncRentalGateReservations } from '../services/rentalGateSyncService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.listReservations(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function details(req, res, next) {
  try {
    const data = await crm.getReservationDetails(req.params.id);
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.createReservation(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم إنشاء الحجز بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateReservationDetails(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تحديث تفاصيل الحجز بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteReservation(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف الحجز بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function claim(req, res, next) {
  try {
    const data = await crm.claimReservation(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم استلام الحجز في قائمتك بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function unclaim(req, res, next) {
  try {
    const data = await crm.unclaimReservation(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم إلغاء استلام الحجز.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function quickStatus(req, res, next) {
  try {
    const data = await crm.quickUpdateReservationStatus(
      req.auth.user,
      req.params.id,
      req.body?.status,
      req.body?.note
    );
    res.json({ success: true, message: 'تم تحديث حالة الحجز بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function assign(req, res, next) {
  try {
    const data = await crm.assignEmployeesToReservation(
      req.auth.user,
      req.params.id,
      req.body?.employeeIds || []
    );
    res.json({ success: true, message: 'تم إسناد الموظفين للحجز بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function unassign(req, res, next) {
  try {
    const data = await crm.removeEmployeeAssignment(
      req.auth.user,
      req.params.id,
      req.params.employeeId
    );
    res.json({ success: true, message: 'تم إزالة إسناد الموظف.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function pull(req, res, next) {
  try {
    const data = await syncRentalGateReservations(req.auth.user);
    res.json({ success: true, message: 'تم سحب الحجوزات والتمديدات بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}
