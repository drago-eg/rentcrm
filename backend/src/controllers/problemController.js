import * as crm from '../services/crmDataService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.listProblems(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.createProblem(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم تسجيل المشكلة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateProblem(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تحديث المشكلة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteProblem(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف المشكلة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}
