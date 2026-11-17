/**
 * RENTAL GATE CRM — Customers Management (Full CRUD, Search, Filter & Excel Integration)
 */
(function (root) {
  'use strict';

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTs(v) {
    if (!v) return '-';
    return (root.RGCrmCore && root.RGCrmCore.formatDisplayDateTime)
      ? (root.RGCrmCore.formatDisplayDateTime(v) || '-')
      : String(v);
  }

  async function render(container, ctx) {
    var t = ctx.t;
    var user = root.RGAuth.getUser();
    var isManagerOrSup = user && (user.role === 'general_manager' || user.role === 'supervisor');
    var canExport = user && root.RGCrmCore.canUserPerform(user, 'export_reports');

    var state = ctx.state.customers || { search: '', status: '' };
    ctx.state.customers = state;

    var res = await root.RGApi.callApi('getCustomers', state);
    if (!res.success) {
      container.innerHTML = '<div class="form-error">' + esc(res.message) + '</div>';
      return;
    }

    var items = (res.data && res.data.items) || [];

    container.innerHTML =
      '<div class="surface-card">' +
        '<div class="section-header">' +
          '<div>' +
            '<h2 class="section-title">' + t('nav_customers') + '</h2>' +
            '<p class="section-subtitle">' + (ctx.lang === 'en' ? 'Total Customers: ' : 'إجمالي العملاء المسجلين: ') + '<strong class="tabular-nums">' + items.length + '</strong></p>' +
          '</div>' +
          '<div class="toolbar-row" style="margin-bottom:0;">' +
            '<button type="button" class="btn btn-primary" id="cus-add-btn">' + (ctx.lang === 'en' ? '+ New Customer' : '+ إضافة عميل') + '</button>' +
            (isManagerOrSup ? '<button type="button" class="btn btn-charcoal" id="cus-import-xlsx">' + t('import_excel') + '</button>' : '') +
            (canExport ? '<button type="button" class="btn" id="cus-export-xlsx">' + t('export_excel') + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="filter-grid">' +
          '<input type="search" class="input" id="cus-search" placeholder="' + (ctx.lang === 'en' ? 'Search name, phone, email, ID...' : 'بحث بالاسم، الجوال، البريد، الهوية...') + '" value="' + esc(state.search || '') + '">' +
          '<select class="select" id="cus-status" aria-label="الحالة">' +
            '<option value="">' + (ctx.lang === 'en' ? 'All Statuses' : 'جميع الحالات') + '</option>' +
            '<option value="active"' + (state.status === 'active' ? ' selected' : '') + '>' + (ctx.lang === 'en' ? 'Active' : 'نشط') + '</option>' +
            '<option value="inactive"' + (state.status === 'inactive' ? ' selected' : '') + '>' + (ctx.lang === 'en' ? 'Inactive' : 'غير نشط') + '</option>' +
          '</select>' +
          '<button type="button" class="btn btn-sm" id="cus-reset">' + t('reset_filters') + '</button>' +
        '</div>' +
        (items.length === 0
          ? '<div class="empty-state">' + (ctx.lang === 'en' ? 'No matching customers found.' : 'لا يوجد عملاء مسجلون حاليًا.') + '</div>'
          : '<div class="table-wrap"><table class="data-table"><thead><tr>' +
              '<th>الاسم</th><th>الجوال</th><th>البريد الإلكتروني</th><th>الهوية / الإقامة</th><th>الشركة</th><th>الحالة</th><th>آخر تحديث</th><th>إجراءات</th>' +
            '</tr></thead><tbody>' +
              items.map(function (c) {
                var active = c.status !== 'inactive';
                return '<tr>' +
                  '<td><strong>' + esc(c.name) + '</strong>' + (c.notes ? '<div style="font-size:11.5px;color:var(--text-muted);">' + esc(c.notes) + '</div>' : '') + '</td>' +
                  '<td class="mono">' + esc(c.phone) + '</td>' +
                  '<td class="mono">' + esc(c.email || '-') + '</td>' +
                  '<td class="mono">' + esc(c.nationalId || '-') + '</td>' +
                  '<td>' + esc(c.company || '-') + '</td>' +
                  '<td><span class="status-tag ' + (active ? 'status-success' : 'status-neutral') + '">' + (active ? 'نشط' : 'غير نشط') + '</span></td>' +
                  '<td class="mono tabular-nums" style="white-space:nowrap;">' + esc(formatTs(c.updatedAt || c.createdAt)) + '</td>' +
                  '<td><div style="display:flex;gap:6px;">' +
                    '<button type="button" class="btn btn-sm cus-edit-btn" data-id="' + esc(c.id) + '">تعديل</button>' +
                    (isManagerOrSup ? '<button type="button" class="btn btn-sm btn-danger cus-del-btn" data-id="' + esc(c.id) + '" data-confirm="0">حذف</button>' : '') +
                  '</div></td>' +
                '</tr>';
              }).join('') +
            '</tbody></table></div>') +
      '</div>';

    document.getElementById('cus-add-btn').addEventListener('click', function () {
      openCustomerModal(null, ctx, function () { render(container, ctx); });
    });

    var importBtn = document.getElementById('cus-import-xlsx');
    if (importBtn && root.RGExcelModal) {
      importBtn.addEventListener('click', function () {
        root.RGExcelModal.open('customers', ctx, function () { render(container, ctx); });
      });
    }

    var exportBtn = document.getElementById('cus-export-xlsx');
    if (exportBtn) {
      exportBtn.addEventListener('click', async function () {
        try {
          await root.RGApi.downloadFile('/excel/export/customers', 'customers.xlsx');
          ctx.toast('تم تصدير قائمة العملاء إلى Excel بنجاح.');
        } catch (err) {
          ctx.toast(err.message || 'تعذر التصدير.', true);
        }
      });
    }

    var timer = null;
    document.getElementById('cus-search').addEventListener('input', function (ev) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.search = ev.target.value;
        render(container, ctx);
      }, 250);
    });

    document.getElementById('cus-status').addEventListener('change', function (ev) {
      state.status = ev.target.value;
      render(container, ctx);
    });

    document.getElementById('cus-reset').addEventListener('click', function () {
      state.search = '';
      state.status = '';
      render(container, ctx);
    });

    container.querySelectorAll('.cus-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var found = items.find(function (x) { return x.id === btn.getAttribute('data-id'); });
        if (found) openCustomerModal(found, ctx, function () { render(container, ctx); });
      });
    });

    container.querySelectorAll('.cus-del-btn').forEach(function (btn) {
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
        var delRes = await root.RGApi.callApi('deleteCustomer', { id: btn.getAttribute('data-id') });
        if (delRes.success) {
          ctx.toast('تم حذف العميل بنجاح.');
          render(container, ctx);
        } else {
          ctx.toast(delRes.message, true);
        }
      });
    });
  }

  function openCustomerModal(existing, ctx, onSaved) {
    var isEdit = Boolean(existing);
    var modalRoot = document.getElementById('modal-root');

    modalRoot.innerHTML =
      '<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cus-modal-title">' +
        '<form class="modal-panel" id="cus-form">' +
          '<div class="modal-header">' +
            '<h3 class="modal-title" id="cus-modal-title">' + (isEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد') + '</h3>' +
            '<button type="button" class="btn btn-sm" id="cus-modal-close">إغلاق</button>' +
          '</div>' +
          '<div class="form-grid-2">' +
            '<div class="form-group"><label class="form-label" for="cf-name">اسم العميل *</label><input class="input" id="cf-name" value="' + esc(existing ? existing.name : '') + '" required></div>' +
            '<div class="form-group"><label class="form-label" for="cf-phone">رقم الجوال *</label><input class="input mono" id="cf-phone" dir="ltr" value="' + esc(existing ? existing.phone : '') + '" required></div>' +
            '<div class="form-group"><label class="form-label" for="cf-email">البريد الإلكتروني</label><input class="input mono" type="email" dir="ltr" id="cf-email" value="' + esc(existing ? existing.email : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="cf-nid">رقم الهوية / الإقامة</label><input class="input mono" dir="ltr" id="cf-nid" value="' + esc(existing ? existing.nationalId : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="cf-company">الشركة</label><input class="input" id="cf-company" value="' + esc(existing ? existing.company : '') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="cf-status">الحالة</label><select class="select" id="cf-status">' +
              '<option value="active"' + (!existing || existing.status !== 'inactive' ? ' selected' : '') + '>نشط</option>' +
              '<option value="inactive"' + (existing && existing.status === 'inactive' ? ' selected' : '') + '>غير نشط</option>' +
            '</select></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label" for="cf-notes">ملاحظات</label><textarea class="textarea" id="cf-notes">' + esc(existing ? existing.notes : '') + '</textarea></div>' +
          '<div id="cf-err" class="form-error hidden"></div>' +
          '<div class="modal-footer"><button type="submit" class="btn btn-primary">' + (isEdit ? 'حفظ التعديلات' : 'حفظ العميل') + '</button></div>' +
        '</form>' +
      '</div>';

    document.getElementById('cus-modal-close').addEventListener('click', function () {
      modalRoot.innerHTML = '';
    });

    document.getElementById('cus-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var errEl = document.getElementById('cf-err');
      errEl.classList.add('hidden');
      var payload = {
        name: document.getElementById('cf-name').value.trim(),
        phone: document.getElementById('cf-phone').value.trim(),
        email: document.getElementById('cf-email').value.trim(),
        nationalId: document.getElementById('cf-nid').value.trim(),
        company: document.getElementById('cf-company').value.trim(),
        status: document.getElementById('cf-status').value,
        notes: document.getElementById('cf-notes').value.trim()
      };
      if (isEdit) payload.id = existing.id;

      var res = await root.RGApi.callApi(isEdit ? 'updateCustomer' : 'createCustomer', payload);
      if (res.success) {
        ctx.toast(isEdit ? 'تم تحديث العميل بنجاح.' : 'تمت إضافة العميل بنجاح.');
        modalRoot.innerHTML = '';
        if (onSaved) onSaved();
      } else {
        errEl.textContent = res.message || 'تعذر حفظ بيانات العميل.';
        errEl.classList.remove('hidden');
      }
    });
  }

  root.RGCustomers = { render: render };
})(window);
