import * as crm from '../services/crmDataService.js';

export async function list(req, res, next) {
  try {
    const data = await crm.listTasks(req.auth.user, req.query || {});
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.createTask(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم إنشاء المهمة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateTask(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تحديث المهمة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteTask(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف المهمة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}
