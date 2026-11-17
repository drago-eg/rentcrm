import ExcelJS from 'exceljs';
import { core, FOLLOWUP_STATUSES, PROBLEM_PRIORITIES, TASK_STATUSES, TASK_PRIORITIES } from '../config/permissions.js';
import { badRequest } from '../utils/errors.js';
import { normalizeStr, toNumber, isValidEmail, isValidPhone, isValidDateStr, normalizeRole } from '../utils/validators.js';
import { formatDisplayDate, formatDisplayDateTime, nowIso, todayDateStr, currentTime24Str } from '../utils/dateUtils.js';
import { gasClient } from './gasClient.js';

const ENTITY_SCHEMAS = {
  reservations: {
    sheetTitle: 'Reservations',
    resource: 'reservations',
    uniqueField: 'reservationNumber',
    columns: [
      { key: 'reservationNumber', label: 'رقم الحجز', aliases: ['reservationnumber', 'reservation_number', 'رقم الحجز', 'رقم_الحجز'], required: true },
      { key: 'customerName', label: 'اسم العميل', aliases: ['customername', 'customer_name', 'اسم العميل', 'العميل'], required: true },
      { key: 'customerPhone', label: 'الجوال', aliases: ['customerphone', 'customer_phone', 'phone', 'الجوال', 'رقم الجوال'], required: true, validator: 'phone' },
      { key: 'companyName', label: 'الشركة', aliases: ['companyname', 'company_name', 'company', 'الشركة'], required: false },
      { key: 'branchName', label: 'الفرع', aliases: ['branchname', 'branch_name', 'branch', 'الفرع'], required: false },
      { key: 'carName', label: 'السيارة', aliases: ['carname', 'car_name', 'car', 'السيارة'], required: false },
      { key: 'plateNumber', label: 'رقم اللوحة', aliases: ['platenumber', 'plate_number', 'رقم اللوحة'], required: false },
      { key: 'startDate', label: 'بداية الحجز', aliases: ['startdate', 'start_date', 'بداية الحجز', 'تاريخ البداية'], required: false, validator: 'date' },
      { key: 'endDate', label: 'نهاية الحجز', aliases: ['enddate', 'end_date', 'نهاية الحجز', 'تاريخ النهاية'], required: false, validator: 'date' },
      { key: 'daysCount', label: 'الأيام', aliases: ['dayscount', 'days_count', 'days', 'الأيام', 'عدد الأيام'], required: false, validator: 'number' },
      { key: 'baseAmount', label: 'المبلغ الأساسي', aliases: ['baseamount', 'base_amount', 'amount', 'المبلغ الأساسي'], required: false, validator: 'number' },
      { key: 'extensionsAmount', label: 'مبلغ التمديد', aliases: ['extensionsamount', 'extensions_amount', 'مبلغ التمديد'], required: false, validator: 'number' },
      { key: 'totalAmount', label: 'الإجمالي', aliases: ['totalamount', 'total_amount', 'total', 'الإجمالي'], required: false, validator: 'number' },
      { key: 'internalStatus', label: 'الحالة الداخلية', aliases: ['internalstatus', 'internal_status', 'status', 'الحالة الداخلية', 'الحالة'], required: false },
      { key: 'priority', label: 'الأولوية', aliases: ['priority', 'الأولوية'], required: false },
      { key: 'lastUpdateText', label: 'آخر تحديث', aliases: ['lastupdatetext', 'notes', 'آخر تحديث', 'ملاحظات'], required: false },
    ],
    sampleRow: {
      reservationNumber: 'RG-2026-1001',
      customerName: 'خالد محمد العتيبي',
      customerPhone: '0551234567',
      companyName: 'بدجت لتأجير السيارات',
      branchName: 'الرياض - المطار',
      carName: 'تويوتا كامري 2026',
      plateNumber: 'أ ب ج 1234',
      startDate: '2026-11-20',
      endDate: '2026-11-25',
      daysCount: 5,
      baseAmount: 1200,
      extensionsAmount: 0,
      totalAmount: 1200,
      internalStatus: 'تم الإنشاء',
      priority: 'عادي',
      lastUpdateText: 'مستورد عبر Excel',
    },
  },
  customers: {
    sheetTitle: 'Customers',
    resource: 'customers',
    uniqueField: 'phone',
    columns: [
      { key: 'name', label: 'اسم العميل', aliases: ['name', 'customername', 'اسم العميل', 'الاسم'], required: true },
      { key: 'phone', label: 'رقم الجوال', aliases: ['phone', 'customerphone', 'mobile', 'رقم الجوال', 'الجوال'], required: true, validator: 'phone' },
      { key: 'email', label: 'البريد الإلكتروني', aliases: ['email', 'البريد الإلكتروني', 'البريد'], required: false, validator: 'email' },
      { key: 'nationalId', label: 'رقم الهوية / الإقامة', aliases: ['nationalid', 'national_id', 'idnumber', 'رقم الهوية', 'الهوية'], required: false },
      { key: 'company', label: 'الشركة', aliases: ['company', 'companyname', 'الشركة'], required: false },
      { key: 'status', label: 'الحالة', aliases: ['status', 'الحالة'], required: false },
      { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'ملاحظات'], required: false },
    ],
    sampleRow: {
      name: 'سارة عبدالله السبيعي',
      phone: '0509876543',
      email: 'sara@example.com',
      nationalId: '1020304050',
      company: 'شركة النخيل',
      status: 'active',
      notes: 'عميل دائم',
    },
  },
  tasks: {
    sheetTitle: 'Tasks',
    resource: 'tasks',
    uniqueField: null,
    columns: [
      { key: 'title', label: 'عنوان المهمة', aliases: ['title', 'task', 'عنوان المهمة', 'المهمة'], required: true },
      { key: 'description', label: 'التفاصيل', aliases: ['description', 'details', 'التفاصيل', 'الوصف'], required: false },
      { key: 'reservationNumber', label: 'رقم الحجز', aliases: ['reservationnumber', 'reservation_number', 'رقم الحجز'], required: false },
      { key: 'customerName', label: 'اسم العميل', aliases: ['customername', 'customer_name', 'اسم العميل', 'العميل'], required: false },
      { key: 'assignedToName', label: 'الموظف المسؤول', aliases: ['assignedtoname', 'assigned_to', 'employee', 'الموظف المسؤول', 'الموظف'], required: false },
      { key: 'priority', label: 'الأولوية', aliases: ['priority', 'الأولوية'], required: false },
      { key: 'status', label: 'الحالة', aliases: ['status', 'الحالة'], required: false },
      { key: 'dueDate', label: 'تاريخ الاستحقاق', aliases: ['duedate', 'due_date', 'تاريخ الاستحقاق'], required: false, validator: 'date' },
    ],
    sampleRow: {
      title: 'تأكيد استلام السيارة للعميل',
      description: 'التواصل مع العميل قبل موعد الاستلام بساعتين',
      reservationNumber: 'RG-2026-1001',
      customerName: 'خالد محمد العتيبي',
      assignedToName: 'المدير العام',
      priority: 'متوسط',
      status: 'جديدة',
      dueDate: '2026-11-22',
    },
  },
  employees: {
    sheetTitle: 'Employees',
    resource: 'employees',
    uniqueField: 'username',
    columns: [
      { key: 'name', label: 'الاسم الكامل', aliases: ['name', 'fullname', 'الاسم الكامل', 'الاسم'], required: true },
      { key: 'username', label: 'اسم المستخدم', aliases: ['username', 'user', 'اسم المستخدم'], required: true },
      { key: 'phone', label: 'الجوال', aliases: ['phone', 'mobile', 'الجوال'], required: false, validator: 'phone' },
      { key: 'email', label: 'البريد الإلكتروني', aliases: ['email', 'البريد الإلكتروني'], required: false, validator: 'email' },
      { key: 'jobTitle', label: 'المسمى الوظيفي', aliases: ['jobtitle', 'job_title', 'المسمى الوظيفي', 'الوظيفة'], required: false },
      { key: 'role', label: 'الدور', aliases: ['role', 'الدور'], required: true },
      { key: 'status', label: 'الحالة', aliases: ['status', 'الحالة'], required: false },
    ],
    sampleRow: {
      name: 'فهد القحطاني',
      username: 'fahad.agent',
      phone: '0551122334',
      email: 'fahad@rentalgate.net',
      jobTitle: 'موظف خدمة العملاء',
      role: 'agent',
      status: 'active',
    },
  },
  problems: {
    sheetTitle: 'Problems',
    resource: 'problems',
    uniqueField: 'problemNumber',
    columns: [
      { key: 'problemNumber', label: 'رقم المشكلة', aliases: ['problemnumber', 'رقم المشكلة'], required: false },
      { key: 'reservationNumber', label: 'رقم الحجز', aliases: ['reservationnumber', 'رقم الحجز'], required: true },
      { key: 'customerName', label: 'العميل', aliases: ['customername', 'العميل'], required: true },
      { key: 'description', label: 'الوصف', aliases: ['description', 'الوصف'], required: true },
      { key: 'priority', label: 'الأولوية', aliases: ['priority', 'الأولوية'], required: false },
      { key: 'status', label: 'الحالة', aliases: ['status', 'الحالة'], required: false },
      { key: 'createdByName', label: 'أنشئت بواسطة', aliases: ['createdbyname', 'المنشئ'], required: false },
    ],
    sampleRow: null,
  },
  followups: {
    sheetTitle: 'FollowUps',
    resource: 'followups',
    uniqueField: null,
    columns: [
      { key: 'reservationNumber', label: 'رقم الحجز', aliases: ['reservationnumber', 'رقم الحجز'], required: true },
      { key: 'customerName', label: 'العميل', aliases: ['customername', 'العميل'], required: true },
      { key: 'employeeName', label: 'الموظف', aliases: ['employeename', 'الموظف'], required: false },
      { key: 'status', label: 'الحالة', aliases: ['status', 'الحالة'], required: false },
      { key: 'action', label: 'الإجراء', aliases: ['action', 'الإجراء'], required: true },
      { key: 'notes', label: 'الملاحظات', aliases: ['notes', 'الملاحظات'], required: false },
      { key: 'followUpDate', label: 'تاريخ المتابعة', aliases: ['followupdate', 'التاريخ'], required: false },
      { key: 'followUpTime', label: 'الوقت', aliases: ['followuptime', 'الوقت'], required: false },
    ],
    sampleRow: null,
  },
};

function resolveEntitySchema(entity) {
  const key = normalizeStr(entity).toLowerCase();
  const schema = ENTITY_SCHEMAS[key];
  if (!schema) {
    throw badRequest(`نوع البيانات "${entity}" غير مدعوم في تكامل Excel.`);
  }
  return { key, schema };
}

function normalizeHeaderToken(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[*:\s_-]+/g, '');
}

function mapCellValue(cellValue) {
  if (cellValue === null || cellValue === undefined) return '';
  if (cellValue instanceof Date) {
    return formatDisplayDate(cellValue);
  }
  if (typeof cellValue === 'object') {
    if (cellValue.text !== undefined) return String(cellValue.text).trim();
    if (cellValue.result !== undefined) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((r) => r.text || '').join('').trim();
    }
  }
  return String(cellValue).trim();
}

export async function buildWorkbookBuffer(entity, rows = []) {
  const { schema } = resolveEntitySchema(entity);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RENTAL GATE CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(schema.sheetTitle, {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }],
  });

  const headers = schema.columns.map((c) => c.label);
  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF313232' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D2D4' } },
      bottom: { style: 'medium', color: { argb: 'FFD32228' } },
    };
  });

  for (const row of rows) {
    const rowValues = schema.columns.map((col) => {
      let val = row?.[col.key];
      if (Array.isArray(val)) return val.join('، ');
      if (col.validator === 'date' && val) return formatDisplayDate(val);
      if (col.key === 'createdAt' || col.key === 'updatedAt' || col.key === 'lastUpdatedAt') {
        return val ? formatDisplayDateTime(val) : '';
      }
      return val !== undefined && val !== null ? val : '';
    });
    const added = sheet.addRow(rowValues);
    added.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  schema.columns.forEach((col, idx) => {
    const column = sheet.getColumn(idx + 1);
    let maxLen = col.label.length + 6;
    rows.slice(0, 100).forEach((r) => {
      const len = String(r?.[col.key] ?? '').length + 4;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(45, Math.max(15, maxLen));
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: schema.columns.length },
    };
  }

  return workbook.xlsx.writeBuffer();
}

export async function buildTemplateBuffer(entity) {
  const { schema } = resolveEntitySchema(entity);
  const sample = schema.sampleRow ? [schema.sampleRow] : [];
  return buildWorkbookBuffer(entity, sample);
}

function validateAndNormalizeRow(rowObj, schema, rowIndex) {
  const errors = [];
  const normalized = {};

  for (const col of schema.columns) {
    const rawVal = normalizeStr(rowObj[col.key]);
    if (col.required && !rawVal) {
      errors.push(`الحقل "${col.label}" مطلوب.`);
      continue;
    }
    if (!rawVal) {
      normalized[col.key] = '';
      continue;
    }

    if (col.validator === 'phone' && !isValidPhone(rawVal)) {
      errors.push(`رقم الجوال في "${col.label}" غير صالح (${rawVal}).`);
    } else if (col.validator === 'email' && !isValidEmail(rawVal)) {
      errors.push(`البريد الإلكتروني في "${col.label}" غير صالح (${rawVal}).`);
    } else if (col.validator === 'date') {
      if (!isValidDateStr(rawVal)) {
        errors.push(`صيغة التاريخ في "${col.label}" غير صالحة (${rawVal}).`);
      } else {
        normalized[col.key] = formatDisplayDate(rawVal);
        continue;
      }
    } else if (col.validator === 'number') {
      const n = Number(rawVal);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`القيمة الرقمية في "${col.label}" غير صالحة (${rawVal}).`);
      } else {
        normalized[col.key] = n;
        continue;
      }
    }

    if (col.key === 'role') {
      const r = normalizeRole(rawVal);
      if (!r) {
        errors.push(`الدور الوظيفي غير صالح (${rawVal}) — القيم المسموحة: general_manager, supervisor, agent.`);
      } else {
        normalized.role = r;
        continue;
      }
    }

    normalized[col.key] = rawVal;
  }

  // Domain defaults
  if (schema.resource === 'reservations') {
    normalized.internalStatus = normalized.internalStatus || FOLLOWUP_STATUSES[3]; // تم الإنشاء
    normalized.priority = PROBLEM_PRIORITIES.includes(normalized.priority) ? normalized.priority : 'عادي';
    normalized.baseAmount = toNumber(normalized.baseAmount, 0);
    normalized.extensionsAmount = toNumber(normalized.extensionsAmount, 0);
    normalized.totalAmount =
      toNumber(normalized.totalAmount, 0) ||
      Math.round((normalized.baseAmount + normalized.extensionsAmount) * 100) / 100;
    normalized.daysCount = Math.max(1, toNumber(normalized.daysCount, 1));
    normalized.originalStatusCode = normalized.originalStatusCode || 'confirmed';
    normalized.originalStatusAr = normalized.originalStatusAr || 'مؤكد';
  } else if (schema.resource === 'customers') {
    normalized.status = normalized.status || 'active';
  } else if (schema.resource === 'tasks') {
    normalized.status = TASK_STATUSES.includes(normalized.status) ? normalized.status : 'جديدة';
    normalized.priority = TASK_PRIORITIES.includes(normalized.priority) ? normalized.priority : 'عادي';
  } else if (schema.resource === 'employees') {
    normalized.status = normalized.status === 'disabled' ? 'disabled' : 'active';
    normalized.jobTitle = normalized.jobTitle || 'موظف خدمة العملاء';
  }

  return {
    rowNumber: rowIndex,
    data: normalized,
    errors,
  };
}

export async function parseAndValidateExcel(buffer, entity) {
  const { key, schema } = resolveEntitySchema(entity);
  if (!schema.sampleRow && !['reservations', 'customers', 'tasks', 'employees'].includes(key)) {
    throw badRequest(`الاستيراد غير مدعوم لهذا الكيان (${entity}).`);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw badRequest('ملف Excel غير صالح أو تالف. يرجى رفع ملف .xlsx صحيح.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw badRequest('ملف Excel فارغ أو لا يحتوي على صفوف بيانات بعد صف العناوين.');
  }

  // Map header columns
  const headerRow = sheet.getRow(1);
  const colIndexToField = {};
  const headersDetected = [];

  headerRow.eachCell((cell, colNumber) => {
    const rawHeader = mapCellValue(cell.value);
    if (!rawHeader) return;
    headersDetected.push(rawHeader);
    const token = normalizeHeaderToken(rawHeader);
    for (const def of schema.columns) {
      const matches =
        normalizeHeaderToken(def.key) === token ||
        normalizeHeaderToken(def.label) === token ||
        def.aliases.some((a) => normalizeHeaderToken(a) === token);
      if (matches) {
        colIndexToField[colNumber] = def.key;
        break;
      }
    }
  });

  const mappedFields = new Set(Object.values(colIndexToField));
  const missingColumns = schema.columns
    .filter((c) => c.required && !mappedFields.has(c.key))
    .map((c) => c.label);

  if (missingColumns.length > 0) {
    return {
      entity: key,
      totalRows: Math.max(0, sheet.rowCount - 1),
      validCount: 0,
      duplicateCount: 0,
      errorCount: missingColumns.length,
      headersDetected,
      missingColumns,
      validRows: [],
      duplicateRows: [],
      errorRows: [
        {
          rowNumber: 1,
          data: {},
          errors: [`الأعمدة الإلزامية المفقودة في ملف Excel: ${missingColumns.join('، ')}`],
        },
      ],
    };
  }

  // Load existing Google Sheets records to detect DB duplicates
  let existingKeys = new Set();
  if (schema.uniqueField) {
    const existingRes = await gasClient.list(schema.resource, { skipCache: 'true' });
    const existingItems = existingRes?.items || [];
    for (const item of existingItems) {
      const kVal = normalizeStr(item?.[schema.uniqueField]).toLowerCase();
      if (kVal) existingKeys.add(kVal);
    }
  }

  const inFileKeys = new Set();
  const validRows = [];
  const duplicateRows = [];
  const errorRows = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rawObj = {};
    let hasAnyValue = false;

    for (const [colIdxStr, fieldKey] of Object.entries(colIndexToField)) {
      const val = mapCellValue(row.getCell(Number(colIdxStr)).value);
      if (val !== '') hasAnyValue = true;
      rawObj[fieldKey] = val;
    }

    if (!hasAnyValue) continue;

    const checked = validateAndNormalizeRow(rawObj, schema, r);
    if (checked.errors.length > 0) {
      errorRows.push(checked);
      continue;
    }

    if (schema.uniqueField) {
      const uniqueVal = normalizeStr(checked.data[schema.uniqueField]).toLowerCase();
      if (existingKeys.has(uniqueVal)) {
        duplicateRows.push({
          rowNumber: r,
          reason: `موجود مسبقًا في قاعدة البيانات (${schema.uniqueField}: ${checked.data[schema.uniqueField]})`,
          data: checked.data,
        });
        continue;
      }
      if (inFileKeys.has(uniqueVal)) {
        duplicateRows.push({
          rowNumber: r,
          reason: `مكرر داخل ملف Excel (${schema.uniqueField}: ${checked.data[schema.uniqueField]})`,
          data: checked.data,
        });
        continue;
      }
      inFileKeys.add(uniqueVal);
    }

    validRows.push(checked);
  }

  return {
    entity: key,
    totalRows: validRows.length + duplicateRows.length + errorRows.length,
    validCount: validRows.length,
    duplicateCount: duplicateRows.length,
    errorCount: errorRows.length,
    headersDetected,
    missingColumns: [],
    validRows,
    duplicateRows,
    errorRows,
  };
}

export async function commitExcelImport(entity, candidateRows, actor) {
  const { key, schema } = resolveEntitySchema(entity);
  if (!Array.isArray(candidateRows) || candidateRows.length === 0) {
    throw badRequest('لا توجد صفوف صالحة للاستيراد.');
  }

  let existingKeys = new Set();
  if (schema.uniqueField) {
    const existingRes = await gasClient.list(schema.resource, { skipCache: 'true' });
    const existingItems = existingRes?.items || [];
    for (const item of existingItems) {
      const kv = normalizeStr(item?.[schema.uniqueField]).toLowerCase();
      if (kv) existingKeys.add(kv);
    }
  }

  const seenNow = new Set();
  const recordsToInsert = [];
  const skippedDuplicates = [];
  const errorRows = [];
  const now = nowIso();

  candidateRows.forEach((rawRow, idx) => {
    const rowData = rawRow?.data ? rawRow.data : rawRow;
    const checked = validateAndNormalizeRow(rowData, schema, rawRow?.rowNumber || idx + 2);
    if (checked.errors.length > 0) {
      errorRows.push(checked);
      return;
    }
    if (schema.uniqueField) {
      const uk = normalizeStr(checked.data[schema.uniqueField]).toLowerCase();
      if (existingKeys.has(uk) || seenNow.has(uk)) {
        skippedDuplicates.push({
          rowNumber: checked.rowNumber,
          value: checked.data[schema.uniqueField],
        });
        return;
      }
      seenNow.add(uk);
    }

    const enriched = { ...checked.data, createdAt: now, updatedAt: now };
    if (key === 'reservations') {
      enriched.id = `RES_${enriched.reservationNumber}`;
      enriched.lastUpdatedById = actor.id;
      enriched.lastUpdatedByName = actor.name;
      enriched.lastUpdatedAt = now;
      enriched.assignedEmployeeIds = [];
      enriched.assignedEmployeeNames = [];
      enriched.hasExtensions = toNumber(enriched.extensionsAmount, 0) > 0;
      enriched.hasProblem = false;
    } else if (key === 'tasks') {
      enriched.createdById = actor.id;
      enriched.createdByName = actor.name;
    } else if (key === 'employees') {
      enriched.permissions = core.resolveEffectivePermissions(enriched.role);
    }
    recordsToInsert.push(enriched);
  });

  if (recordsToInsert.length === 0) {
    throw badRequest('لم يتبقَ أي سجل جديد صالح للاستيراد بعد التحقق ومنع التكرار.');
  }

  const keyField = schema.uniqueField || 'id';
  await gasClient.upsertBatch(schema.resource, keyField, recordsToInsert);

  await gasClient.create(
    'activity_log',
    {
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      actionType: 'استيراد Excel',
      entityType: schema.sheetTitle,
      entityId: `IMPORT_${recordsToInsert.length}`,
      details: `تم استيراد ${recordsToInsert.length} سجل إلى ${schema.sheetTitle} (تخطي مكرر: ${skippedDuplicates.length})`,
      logDate: todayDateStr(),
      logTime: currentTime24Str(),
    },
    { allowDuplicate: true }
  ).catch(() => {});

  return {
    entity: key,
    importedCount: recordsToInsert.length,
    skippedDuplicatesCount: skippedDuplicates.length,
    errorCount: errorRows.length,
    skippedDuplicates,
    errorRows,
  };
}
