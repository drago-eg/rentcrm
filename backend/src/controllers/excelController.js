import * as crm from '../services/crmDataService.js';
import * as excelService from '../services/excelService.js';
import { badRequest } from '../utils/errors.js';

export async function downloadTemplate(req, res, next) {
  try {
    const { entity } = req.params;
    const buffer = await excelService.buildTemplateBuffer(entity);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="rental-gate-${entity}-template.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

export async function exportWorkbook(req, res, next) {
  try {
    const { entity } = req.params;
    let rows = [];
    if (entity === 'reservations') {
      const r = await crm.listReservations(req.auth.user, { ...req.query, page: 1, pageSize: 5000 });
      rows = r.items || [];
    } else if (entity === 'customers') {
      const c = await crm.listCustomers(req.query || {});
      rows = c.items || [];
    } else if (entity === 'tasks') {
      const t = await crm.listTasks(req.auth.user, req.query || {});
      rows = t.items || [];
    } else if (entity === 'employees') {
      const e = await crm.listEmployees();
      rows = e.items || [];
    } else if (entity === 'problems') {
      const p = await crm.listProblems(req.auth.user, req.query || {});
      rows = p.items || [];
    } else if (entity === 'followups') {
      const f = await crm.getTeamFollowUps(req.query || {});
      rows = f.items || [];
    } else {
      throw badRequest(`نوع التصدير غير مدعوم: ${entity}`);
    }

    const buffer = await excelService.buildWorkbookBuffer(entity, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="rental-gate-${entity}-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

export async function previewImport(req, res, next) {
  try {
    const entity = req.body?.entity || req.query?.entity || 'reservations';
    if (!req.file || !req.file.buffer) {
      throw badRequest('يرجى إرفاق ملف Excel (.xlsx) للفحص.');
    }
    const preview = await excelService.parseAndValidateExcel(req.file.buffer, entity);
    res.json({
      success: true,
      message: 'تم فحص ملف Excel بنجاح.',
      data: preview,
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

export async function commitImport(req, res, next) {
  try {
    const { entity, rows } = req.body || {};
    if (!entity || !Array.isArray(rows)) {
      throw badRequest('بيانات الاستيراد غير مكتملة (entity و rows مطلوبان).');
    }
    const result = await excelService.commitExcelImport(entity, rows, req.auth.user);
    res.status(201).json({
      success: true,
      message: `تم استيراد ${result.importedCount} سجل بنجاح.`,
      data: result,
      error: null,
    });
  } catch (err) {
    next(err);
  }
}
