import * as crm from '../services/crmDataService.js';

export async function list(_req, res, next) {
  try {
    const data = await crm.listEmployees();
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function details(req, res, next) {
  try {
    const data = await crm.getEmployeeDetails(req.params.id);
    res.json({ success: true, message: '', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const data = await crm.createEmployee(req.auth.user, req.body || {});
    res.status(201).json({ success: true, message: 'تم إنشاء حساب الموظف بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await crm.updateEmployee(req.auth.user, req.params.id, req.body || {});
    res.json({ success: true, message: 'تم تحديث بيانات الموظف بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function toggleStatus(req, res, next) {
  try {
    const data = await crm.toggleEmployeeStatus(req.auth.user, req.params.id, req.body?.status);
    res.json({ success: true, message: 'تم تحديث حالة الموظف بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const data = await crm.deleteEmployee(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف الموظف بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function savePreset(req, res, next) {
  try {
    const data = await crm.saveRolePreset(req.auth.user, req.body || {});
    res.json({ success: true, message: 'تم حفظ الصلاحية الجاهزة بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function removePreset(req, res, next) {
  try {
    const data = await crm.deleteRolePreset(req.auth.user, req.params.id);
    res.json({ success: true, message: 'تم حذف الصلاحية الجاهزة.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function resetPresets(req, res, next) {
  try {
    const data = await crm.resetRolePresets(req.auth.user);
    res.json({ success: true, message: 'تمت استعادة القوالب الافتراضية.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function savePermissionDef(req, res, next) {
  try {
    const data = await crm.savePermissionDefinition(req.auth.user, req.body || {});
    res.json({ success: true, message: 'تم حفظ الصلاحية بنجاح.', data, error: null });
  } catch (err) {
    next(err);
  }
}

export async function removePermissionDef(req, res, next) {
  try {
    const data = await crm.deletePermissionDefinition(req.auth.user, req.params.key);
    res.json({ success: true, message: 'تم حذف تعريف الصلاحية.', data, error: null });
  } catch (err) {
    next(err);
  }
}
