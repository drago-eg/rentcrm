/**
 * RENTAL GATE CRM — Tasks Management (Full CRUD, Filters, Quick Status & Excel Integration)
 */
(function (root) {
  'use strict';

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(v) {
    if (!v) return '-';
    return (root.RGCrmCore && root.RGCrmCore.formatDisplayDate) ? (root.RGCrmCore.formatDisplayDate(v) || '-') : String(v);
  }

  function prioBadge(p) {
    if (p === 'عاجل' || p === 'مرتفع') return '<span class="status-tag status-danger">' + esc(p) + '</span>';
    if (p === 'متوسط') return '<span class="status-tag status-warning">' + esc(p) + '</span>';
    return '<span class="status-tag status-neutral">' + esc(p || 'عادي') + '</span>';
  }

  async function render(container, ctx) {
    var t = ctx.t;
    var user = root.RGAuth.getUser();
    var isManagerOrSup = user && (user.role === 'general_manager' || user.role === 'supervisor');
    var canExport = user && root.RGCrmCore.canUserPerform(user, 'export_reports');

    var state = ctx.state.tasks || { search: '', status: '', priority: '', assignedToId: '' };
    ctx.state.tasks = state;

    var [taskRes, empRes] = await Promise.all([
      root.RGApi.callApi('getTasks', state),
      root.RGApi.callApi('getEmployees', {})
    ]);

    if (!taskRes.success) {
      container.innerHTML = '<div class="form-error">' + esc(taskRes.message) + '</div>';
      return;
    }

    var items = (taskRes.data && taskRes.data.items) || [];
    var employees = (empRes.success && empRes.data && empRes.data.items) || [];
    var statuses = root.RGCrmCore.TASK_STATUSES || ['جديدة', 'قيد التنفيذ', 'بانتظار المراجعة', 'مكتملة', 'ملغاة'];
    var priorities = root.RGCrmCore.TASK_PRIORITIES || ['عادي', 'متوسط', 'مرتفع', 'عاجل'];

    container.innerHTML =
      '<div class="surface-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<h2 class="section-title">' + t('nav_tasks') + '</h2>' +
            '<p class="section-subtitle">' + (ctx.lang === 'en' ? 'Active & Scheduled Tasks: ' : 'إجمالي المهام المطابقة: ') + '<strong class="tabular-nums">' + items.length + '</strong></p>' +
          '</div>' +
          '<div class="toolbar-row" style="margin-bottom:0;">' +
            '<button type="button" class="btn btn-primary" id="tsk-add-btn">' + (ctx.lang === 'en' ? '+ New Task' : '+ مهمة جديدة') + '</button>' +
            (isManagerOrSup ? '<button type="button" class="btn btn-charcoal" id="tsk-import-xlsx">' + t('import_excel') + '</button>' : '') +
            (canExport ? '<button type="button" class="btn" id="tsk-export-xlsx">' + t('export_excel') + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="filter-grid">' +
          '<input type="search" class="input" id="tsk-search" placeholder="' + (ctx.lang === 'en' ? 'Search tasks, reservation, customer...' : 'بحث بعنوان المهمة، رقم الحجز، العميل...') + '" value="' + esc(state.search || '') + '">' +
          '<select class="select" id="tsk-status" aria-label="الحالة"><option value="">جميع الحالات</option>' +
            statuses.map(function (s) { return '<option value="' + esc(s) + '"' + (state.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
          '</select>' +
          '<select class="select" id="tsk-prio" aria-label="الأولوية"><option value="">جميع الأولويات</option>' +
            priorities.map(function (p) { return '<option value="' + esc(p) + '"' + (state.priority === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') +
          '</select>' +
          '<select class="select" id="tsk-emp" aria-label="المسؤول"><option value="">جميع الموظفين</option>' +
            employees.map(function (e) { return '<option value="' + esc(e.id) + '"' + (state.assignedToId === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') +
          '</select>' +
          '<button type="button" class="btn btn-sm" id="tsk-reset">' + t('reset_filters') + '</button>' +
        '</div>' +
        (items.length === 0
          ? '<div class="empty-state">' + (ctx.lang === 'en' ? 'No tasks match your filters.' : 'لا توجد مهام مطابقة حاليًا.') + '</div>'
          : '<div class="table-wrap"><table class="data-table"><thead><tr>' +
              '<th>المهمة</th><th>الحجز / العميل</th><th>المسؤول</th><th>الأولوية</th><th>الحالة</th><th>تاريخ الاستحقاق</th><th>إجراءات</th>' +
            '</tr></thead><tbody>' +
              items.map(function (tk) {
                return '<tr>' +
                  '<td><strong>' + esc(tk.title) + '</strong>' + (tk.description ? '<div style="font-size:11.5px;color:var(--text-muted);">' + esc(tk.description) + '</div>' : '') + '</td>' +
                  '<td>' + (tk.reservationNumber ? '<span class="mono">' + esc(tk.reservationNumber) + '</span> ' : '') + esc(tk.customerName || '-') + '</td>' +
                  '<td>' + esc(tk.assignedToName || 'غير مسندة') + '</td>' +
                  '<td>' + prioBadge(tk.priority) + '</td>' +
                  '<td>' +
                    '<select class="quick-status-select tsk-quick-status" data-id="' + esc(tk.id) + '" aria-label="حالة المهمة">' +
                      statuses.map(function (s) {
                        return '<option value="' + esc(s) + '"' + (tk.status === s ? ' selected' : '') + '>' + esc(s) + '</option>';
                      }).join('') +
                    '</select>' +
                  '</td>' +
                  '<td class="mono tabular-nums" style="white-space:nowrap;">' + esc(formatDate(tk.dueDate)) + '</td>' +
                  '<td><div style="display:flex;gap:6px;">' +
                    '<button type="button" class="btn btn-sm tsk-edit-btn" data-id="' + esc(tk.id) + '">تعديل</button>' +
                    (isManagerOrSup ? '<button type="button" class="btn btn-sm btn-danger tsk-del-btn" data-id="' + esc(tk.id) + '" data-confirm="0">حذف</button>' : '') +
                  '</div></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table></div>') +
      '</div>';

    document.getElementById('tsk-add-btn').addEventListener('click', function () {
      openTaskModal(null, employees, ctx, function () { render(container, ctx); });
    });

    var importBtn = document.getElementById('tsk-import-xlsx');
    if (importBtn && root.RGExcelModal) {
      importBtn.addEventListener('click', function () {
        root.RGExcelModal.open('tasks', ctx, function () { render(container, ctx); });
      });
    }

    var exportBtn = document.getElementById('tsk-export-xlsx');
    if (exportBtn) {
      exportBtn.addEventListener('click', async function () {
        try {
          await root.RGApi.downloadFile('/excel/export/tasks', 'tasks.xlsx');
          ctx.toast('تم تصدير المهام إلى Excel بنجاح.');
        } catch (err) {
          ctx.toast(err.message || 'تعذر التصدير.', true);
        }
      });
    }

    var timer = null;
    document.getElementById('tsk-search').addEventListener('input', function (ev) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.search = ev.target.value;
        render(container, ctx);
      }, 250);
    });

    ['tsk-status', 'tsk-prio', 'tsk-emp'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        state.status = document.getElementById('tsk-status').value;
        state.priority = document.getElementById('tsk-prio').value;
        state.assignedToId = document.getElementById('tsk-emp').value;
        render(container, ctx);
      });
    });

    document.getElementById('tsk-reset').addEventListener('click', function () {
      state.search = ''; state.status = ''; state.priority = ''; state.assignedToId = '';
      render(container, ctx);
    });

    container.querySelectorAll('.tsk-quick-status').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        sel.disabled = true;
        var resUpd = await root.RGApi.callApi('updateTask', { id: sel.getAttribute('data-id'), status: sel.value });
        if (resUpd.success) {
          ctx.toast('تم تحديث حالة المهمة.');
          render(container, ctx);
        } else {
          ctx.toast(resUpd.message, true);
          sel.disabled = false;
        }
      });
    });

    container.querySelectorAll('.tsk-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var found = items.find(function (x) { return x.id === btn.getAttribute('data-id'); });
        if (found) openTaskModal(found, employees, ctx, function () { render(container, ctx); });
      });
    });

    container.querySelectorAll('.tsk-del-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (btn.getAttribute('data-confirm') !== '1') {
          btn.setAttribute('data-confirm', '1');
          btn.textContent = 'تأكيد؟';
          setTimeout(function () {
            if (document.body.contains(btn)) {
              btn.setAttribute('data-confirm', '0');
              btn.textContent = 'حذف';
            }
          }, 3000);
          return;
        }
        var delRes = await root.RGApi.callApi('deleteTask', { id: btn.getAttribute('data-id') });
        if (delRes.success) {
          ctx.toast('تم حذف المهمة.');
          render(container, ctx);
        } else {
          ctx.toast(delRes.message, true);
        }
      });
    });
  }

  function openTaskModal(existing, employees, ctx, onSaved) {
    var isEdit = Boolean(existing);
    var modalRoot = document.getElementById('modal-root');
    var statuses = root.RGCrmCore.TASK_STATUSES || ['جديدة', 'قيد التنفيذ', 'بانتظار المراجعة', 'مكتملة', 'ملغاة'];
    var priorities = root.RGCrmCore.TASK_PRIORITIES || ['عادي', 'متوسط', 'مرتفع', 'عاجل'];

    modalRoot.innerHTML =
      '<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tsk-modal-title">' +
        '<form class="modal-panel" id="tsk-form">' +
          '<div class="modal-header">' +
            '<h3 class="modal-title" id="tsk-modal-title">' + (isEdit ? 'تعديل المهمة' : 'إنشاء مهمة جديدة') + '</h3>' +
            '<button type="button" class="btn btn-sm" id="tsk-modal-close">إغلاق</button>' +
          '</div>' +
          '<div class="form-group"><label class="form-label" for="tf-title">عنوان المهمة *</label><input class="input" id="tf-title" value="' + esc(existing ? existing.title : '') + '" required></div>' +
          '<div class="form-group"><label class="form-label" for="tf-desc">الوصف والتفاصيل</label><textarea class="textarea" id="tf-desc">' + esc(existing ? existing.description : '') + '</textarea></div>' +
          '<div class="form-grid-2">' +
            '<div class="form-group"><label class="form-label" for="tf-resnum">رقم الحجز (اختياري)</label><input class="input mono" id="tf-resnum" value="' + esc(existing ? existing.reservationNumber : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="tf-cusname">اسم العميل (اختياري)</label><input class="input" id="tf-cusname" value="' + esc(existing ? existing.customerName : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="tf-emp">إسناد إلى موظف</label><select class="select" id="tf-emp"><option value="">غير مسندة</option>' +
              employees.filter(function (e) { return e.status === 'active'; }).map(function (e) {
                return '<option value="' + esc(e.id) + '"' + (existing && existing.assignedToId === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>';
              }).join('') +
            '</select></div>' +
            '<div class="form-group"><label class="form-label" for="tf-due">تاريخ الاستحقاق</label><input type="date" class="input" id="tf-due" value="' + esc(existing && existing.dueDate ? formatDate(existing.dueDate) : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="tf-prio">الأولوية</label><select class="select" id="tf-prio">' +
              priorities.map(function (p) { return '<option value="' + esc(p) + '"' + (existing && existing.priority === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-group"><label class="form-label" for="tf-status">الحالة</label><select class="select" id="tf-status">' +
              statuses.map(function (s) { return '<option value="' + esc(s) + '"' + (existing && existing.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
            '</select></div>' +
          '</div>' +
          '<div id="tf-err" class="form-error hidden"></div>' +
          '<div class="modal-footer"><button type="submit" class="btn btn-primary">' + (isEdit ? 'حفظ التعديلات' : 'إنشاء المهمة') + '</button></div>' +
        '</form>' +
      '</div>';

    document.getElementById('tsk-modal-close').addEventListener('click', function () {
      modalRoot.innerHTML = '';
    });

    document.getElementById('tsk-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var errEl = document.getElementById('tf-err');
      errEl.classList.add('hidden');
      var payload = {
        title: document.getElementById('tf-title').value.trim(),
        description: document.getElementById('tf-desc').value.trim(),
        reservationNumber: document.getElementById('tf-resnum').value.trim(),
        customerName: document.getElementById('tf-cusname').value.trim(),
        assignedToId: document.getElementById('tf-emp').value,
        dueDate: document.getElementById('tf-due').value,
        priority: document.getElementById('tf-prio').value,
        status: document.getElementById('tf-status').value
      };
      if (isEdit) payload.id = existing.id;

      var res = await root.RGApi.callApi(isEdit ? 'updateTask' : 'createTask', payload);
      if (res.success) {
        ctx.toast(isEdit ? 'تم تحديث المهمة.' : 'تم إنشاء المهمة بنجاح.');
        modalRoot.innerHTML = '';
        if (onSaved) onSaved();
      } else {
        errEl.textContent = res.message || 'تعذر حفظ المهمة.';
        errEl.classList.remove('hidden');
      }
    });
  }

  root.RGTasks = { render: render };
})(window);
