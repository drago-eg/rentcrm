import * as crm from '../services/crmDataService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.listCustomers(req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.createCustomer(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم إضافة العميل بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateCustomer(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تحديث بيانات العميل بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteCustomer(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف العميل بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}
