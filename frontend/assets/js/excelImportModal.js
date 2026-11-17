/**
 * RENTAL GATE CRM — ExcelJS Import (Validate + Dedup Preview + Commit) & Export Modal
 */
(function (root) {
  'use strict';

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var ENTITY_LABELS = {
    reservations: { ar: 'الحجوزات', en: 'Reservations' },
    customers: { ar: 'العملاء', en: 'Customers' },
    tasks: { ar: 'المهام', en: 'Tasks' },
    employees: { ar: 'الموظفون', en: 'Employees' }
  };

  function open(defaultEntity, ctx, onImported) {
    var modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;
    var lang = ctx && ctx.lang === 'en' ? 'en' : 'ar';
    var currentEntity = ENTITY_LABELS[defaultEntity] ? defaultEntity : 'reservations';
    var lastPreview = null;

    function entityLabel(k) {
      return (ENTITY_LABELS[k] && ENTITY_LABELS[k][lang]) || k;
    }

    modalRoot.innerHTML =
      '<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="xl-modal-title">' +
        '<div class="modal-panel" style="max-width:760px;">' +
          '<div class="modal-header">' +
            '<div>' +
              '<h3 class="modal-title" id="xl-modal-title">' + (lang === 'en' ? 'Excel Import & Validation' : 'استيراد وفحص ملفات Excel (.xlsx)') + '</h3>' +
              '<p class="section-subtitle" style="margin:2px 0 0;">' + (lang === 'en' ? 'Columns, data validity, and duplicate checks run on the Backend before saving to Google Sheets.' : 'يتم فحص الأعمدة والبيانات ومنع التكرار على الخادم قبل الحفظ الفعلي في Google Sheets.') + '</p>' +
            '</div>' +
            '<button type="button" class="btn btn-sm" id="xl-close-btn">' + (lang === 'en' ? 'Close' : 'إغلاق') + '</button>' +
          '</div>' +

          '<div class="form-grid-2" style="align-items:end;">' +
            '<div class="form-group">' +
              '<label class="form-label" for="xl-entity">' + (lang === 'en' ? 'Target Data Type' : 'نوع البيانات المستهدف') + '</label>' +
              '<select class="select" id="xl-entity">' +
                Object.keys(ENTITY_LABELS).map(function (k) {
                  return '<option value="' + k + '"' + (k === currentEntity ? ' selected' : '') + '>' + entityLabel(k) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<span class="form-label">' + (lang === 'en' ? 'Template & Export' : 'النموذج والتصدير') + '</span>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button type="button" class="btn btn-sm" id="xl-dl-template">' + (lang === 'en' ? 'Download Template .xlsx' : 'تنزيل نموذج فارغ (.xlsx)') + '</button>' +
                '<button type="button" class="btn btn-sm btn-charcoal" id="xl-dl-export">' + (lang === 'en' ? 'Export Current Data' : 'تصدير البيانات الحالية') + '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="form-group">' +
            '<label class="form-label" for="xl-file">' + (lang === 'en' ? 'Select Excel File (.xlsx)' : 'اختر ملف Excel (.xlsx) للفحص') + '</label>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<input type="file" id="xl-file" class="input" accept=".xlsx" style="flex:1;">' +
              '<button type="button" class="btn btn-primary" id="xl-preview-btn">' + (lang === 'en' ? 'Validate & Preview' : 'فحص ومعاينة الملف') + '</button>' +
            '</div>' +
          '</div>' +

          '<div id="xl-preview-region"></div>' +

          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-primary hidden" id="xl-commit-btn">' + (lang === 'en' ? 'Confirm Import Valid Rows' : 'تأكيد استيراد الصفوف الصالحة') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('xl-close-btn').addEventListener('click', function () {
      modalRoot.innerHTML = '';
    });

    document.getElementById('xl-dl-template').addEventListener('click', async function () {
      var ent = document.getElementById('xl-entity').value;
      try {
        await root.RGApi.downloadFile('/excel/template/' + encodeURIComponent(ent), 'template-' + ent + '.xlsx');
        ctx.toast(lang === 'en' ? 'Template downloaded.' : 'تم تنزيل نموذج Excel بنجاح.');
      } catch (err) {
        ctx.toast(err.message || 'تعذر تنزيل النموذج.', true);
      }
    });

    document.getElementById('xl-dl-export').addEventListener('click', async function () {
      var ent = document.getElementById('xl-entity').value;
      try {
        await root.RGApi.downloadFile('/excel/export/' + encodeURIComponent(ent), 'export-' + ent + '.xlsx');
        ctx.toast(lang === 'en' ? 'Workbook exported.' : 'تم تصدير ملف Excel بنجاح.');
      } catch (err) {
        ctx.toast(err.message || 'تعذر تصدير الملف.', true);
      }
    });

    function renderPreviewResult(preview) {
      lastPreview = preview;
      var region = document.getElementById('xl-preview-region');
      var commitBtn = document.getElementById('xl-commit-btn');
      if (!region) return;

      var errorsHtml = '';
      if (preview.errorRows && preview.errorRows.length > 0) {
        errorsHtml =
          '<div style="margin-top:12px;">' +
            '<h4 style="margin:0 0 6px;font-size:13px;color:var(--status-danger-text);">' + (lang === 'en' ? 'Validation Errors' : 'أخطاء الفحص قبل الاستيراد') + ' (' + preview.errorRows.length + ')</h4>' +
            '<div class="table-wrap"><table class="data-table"><thead><tr><th>الصف</th><th>الأخطاء المكتشفة</th></tr></thead><tbody>' +
              preview.errorRows.map(function (er) {
                return '<tr><td class="mono">' + er.rowNumber + '</td><td style="color:var(--status-danger-text);">' + esc((er.errors || []).join(' · ')) + '</td></tr>';
              }).join('') +
            '</tbody></table></div>' +
          '</div>';
      }

      var dupesHtml = '';
      if (preview.duplicateRows && preview.duplicateRows.length > 0) {
        dupesHtml =
          '<div style="margin-top:12px;">' +
            '<h4 style="margin:0 0 6px;font-size:13px;color:var(--status-warning-text);">' + (lang === 'en' ? 'Skipped Duplicates' : 'سجلات مكررة سيتم تخطيها') + ' (' + preview.duplicateRows.length + ')</h4>' +
            '<div class="table-wrap"><table class="data-table"><thead><tr><th>الصف</th><th>السبب</th></tr></thead><tbody>' +
              preview.duplicateRows.map(function (dp) {
                return '<tr><td class="mono">' + dp.rowNumber + '</td><td>' + esc(dp.reason) + '</td></tr>';
              }).join('') +
            '</tbody></table></div>' +
          '</div>';
      }

      region.innerHTML =
        '<div class="detail-summary-grid" style="margin-top:8px;">' +
          '<div class="detail-kv"><span class="detail-k">إجمالي الصفوف</span><span class="detail-v tabular-nums">' + preview.totalRows + '</span></div>' +
          '<div class="detail-kv"><span class="detail-k">صفوف صالحة</span><span class="detail-v tabular-nums" style="color:var(--status-success-text);">' + preview.validCount + '</span></div>' +
          '<div class="detail-kv"><span class="detail-k">مكررة</span><span class="detail-v tabular-nums" style="color:var(--status-warning-text);">' + preview.duplicateCount + '</span></div>' +
          '<div class="detail-kv"><span class="detail-k">بها أخطاء</span><span class="detail-v tabular-nums" style="color:var(--status-danger-text);">' + preview.errorCount + '</span></div>' +
        '</div>' +
        errorsHtml +
        dupesHtml;

      if (preview.validCount > 0) {
        commitBtn.classList.remove('hidden');
        commitBtn.textContent = (lang === 'en' ? 'Confirm Import (' + preview.validCount + ' valid rows)' : 'تأكيد استيراد (' + preview.validCount + ' صف صالح)');
      } else {
        commitBtn.classList.add('hidden');
      }
    }

    document.getElementById('xl-preview-btn').addEventListener('click', async function () {
      var fileInp = document.getElementById('xl-file');
      var ent = document.getElementById('xl-entity').value;
      var region = document.getElementById('xl-preview-region');
      if (!fileInp.files || !fileInp.files[0]) {
        region.innerHTML = '<div class="form-error">يرجى اختيار ملف .xlsx أولاً.</div>';
        return;
      }

      var fd = new FormData();
      fd.append('entity', ent);
      fd.append('file', fileInp.files[0]);

      var btn = document.getElementById('xl-preview-btn');
      btn.disabled = true;
      btn.textContent = lang === 'en' ? 'Validating...' : 'جاري الفحص...';
      var res = await root.RGApi.request('POST', '/excel/preview', fd);
      btn.disabled = false;
      btn.textContent = lang === 'en' ? 'Validate & Preview' : 'فحص ومعاينة الملف';

      if (!res.success || !res.data) {
        region.innerHTML = '<div class="form-error">' + esc(res.message || 'فشل فحص الملف.') + '</div>';
        document.getElementById('xl-commit-btn').classList.add('hidden');
        return;
      }
      renderPreviewResult(res.data);
    });

    document.getElementById('xl-commit-btn').addEventListener('click', async function () {
      if (!lastPreview || !lastPreview.validRows || !lastPreview.validRows.length) return;
      var btn = document.getElementById('xl-commit-btn');
      btn.disabled = true;
      btn.textContent = lang === 'en' ? 'Importing...' : 'جاري الحفظ...';

      var res = await root.RGApi.request('POST', '/excel/import', {
        entity: lastPreview.entity,
        rows: lastPreview.validRows
      });
      btn.disabled = false;
      if (res.success) {
        root.RGApi.clearCache();
        ctx.toast(res.message || 'تم الاستيراد بنجاح.');
        modalRoot.innerHTML = '';
        if (onImported) onImported(res.data);
      } else {
        ctx.toast(res.message || 'فشل تأكيد الاستيراد.', true);
        btn.textContent = lang === 'en' ? 'Confirm Import' : 'تأكيد الاستيراد';
      }
    });
  }

  root.RGExcelModal = { open: open };
})(window);
