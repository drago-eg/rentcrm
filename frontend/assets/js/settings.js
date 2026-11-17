/**
 * RENTAL GATE CRM — System Settings, Backend/GAS Health & Rental Gate API Sync Center
 */
(function (root) {
  'use strict';

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function render(container, ctx) {
    var t = ctx.t;
    var user = root.RGAuth.getUser();
    var canAccessApi = root.RGCrmCore.canAccessApi(user);
    var canSync = root.RGCrmCore.canUserPerform(user, 'sync_data');
    var canManageSettings = root.RGCrmCore.canUserPerform(user, 'manage_settings');

    if (!canAccessApi && !canManageSettings) {
      container.innerHTML =
        '<div class="surface-card">' +
          '<h2 class="section-title">صلاحية مقيدة</h2>' +
          '<p class="section-subtitle">إعدادات النظام وربط API والمزامنة مخصصة للمدير العام والمشرف فقط.</p>' +
        '</div>';
      return;
    }

    var results = await Promise.all([
      root.RGApi.callApi('getSettings', {}),
      canSync ? root.RGApi.callApi('getSyncStatus', {}) : Promise.resolve({ success: true, data: { logs: [], lastSync: null } })
    ]);

    var settingsRes = results[0];
    var syncRes = results[1];
    var settings = (settingsRes.success && settingsRes.data) || {};
    var syncData = (syncRes.success && syncRes.data) || { logs: [], lastSync: null };
    var lastSync = syncData.lastSync;

    var autoSyncEnabled = settings.auto_sync_enabled !== undefined ? Boolean(settings.auto_sync_enabled) : (syncData.autoSyncEnabled !== false);
    var autoSyncHours = Number(settings.auto_sync_interval_hours || syncData.autoSyncIntervalHours || 12);

    container.innerHTML =
      '<div class="surface-card">' +
        '<div class="section-header">' +
          '<div><h2 class="section-title">حالة الربط مع الخادم وقاعدة البيانات (Google Sheets)</h2>' +
          '<p class="section-subtitle">تُدار روابط Google Apps Script والمفاتيح السرية بأمان كامل داخل متغيرات بيئة الخادم (Node.js Backend) ولا تُخزن في المتصفح.</p></div>' +
          '<div class="toolbar-row" style="margin-bottom:0;">' +
            '<button type="button" class="btn btn-primary" id="btn-test-db-conn">فحص اتصال Google Sheets</button>' +
          '</div>' +
        '</div>' +
        '<div class="detail-summary-grid">' +
          '<div class="detail-kv"><span class="detail-k">حالة خادم Backend</span><span class="detail-v" style="color:var(--status-success-text);">متصل (JWT + RBAC)</span></div>' +
          '<div class="detail-kv"><span class="detail-k">تهيئة GAS_WEB_APP_URL</span><span class="detail-v">' + (settings.gasConfigured ? 'مضبوط على الخادم' : 'غير مضبوط في .env') + '</span></div>' +
        '</div>' +
        '<div id="db-test-result" class="hidden" style="margin-top:10px;"></div>' +
      '</div>' +

      (canSync ? (
        '<div class="surface-card">' +
          '<div class="section-header">' +
            '<div><h2 class="section-title">مزامنة بيانات Rental Gate API</h2>' +
            '<p class="section-subtitle">يتم السحب عبر خادم Node.js باستخدام التوكن المحفوظ بأمان على الخادم وتحديث Google Sheets عبر Apps Script.</p></div>' +
            '<div class="toolbar-row" style="margin-bottom:0;">' +
              '<button type="button" class="btn" id="btn-test-rg">اختبار اتصال Rental Gate</button>' +
              '<button type="button" class="btn btn-primary" id="btn-sync-now">سحب الحجوزات الآن</button>' +
            '</div>' +
          '</div>' +
          '<div class="detail-summary-grid" style="margin-bottom:16px;">' +
            '<div class="detail-kv"><span class="detail-k">حالة التوكن</span><span class="detail-v" id="sync-conn-status">' + (settings.hasRgToken ? 'توكن Rental Gate مضبوط على الخادم' : 'غير مضبوط بعد') + '</span></div>' +
            '<div class="detail-kv"><span class="detail-k">جدولة التحديث التلقائي</span><span class="detail-v" id="sync-auto-badge">' + (autoSyncEnabled ? ('مفعل — كل ' + autoSyncHours + ' ساعة') : 'متوقف حاليًا') + '</span></div>' +
            '<div class="detail-kv"><span class="detail-k">آخر تاريخ سحب</span><span class="detail-v mono tabular-nums">' + (lastSync && lastSync.finishedAt ? root.RGApi.formatDisplayDateTime(lastSync.finishedAt) : 'لم يتم السحب بعد') + '</span></div>' +
            '<div class="detail-kv"><span class="detail-k">آخر نتيجة</span><span class="detail-v tabular-nums">' + (lastSync ? (lastSync.importedCount + ' مستورد · ' + lastSync.updatedCount + ' محدث · ' + lastSync.extensionsCount + ' تمديد') : '0 / 0 / 0') + '</span></div>' +
          '</div>' +
          '<div style="margin-bottom:16px;padding:12px 14px;border:1px solid var(--border-hairline);border-radius:var(--radius-sm);background:var(--bg-surface-subtle);">' +
            '<label class="form-label" for="set-rg-token">تحديث توكن Rental Gate API (RG_API_TOKEN)</label>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;">' +
              '<div class="password-field-wrap" style="flex:1;min-width:240px;">' +
                '<input type="password" class="input mono" id="set-rg-token" dir="ltr" autocomplete="off" spellcheck="false" placeholder="الصق Bearer Token لحفظه على الخادم">' +
                '<button type="button" class="password-toggle-btn" id="toggle-rg-token" aria-label="إظهار التوكن">إظهار</button>' +
              '</div>' +
              '<button type="button" class="btn btn-primary" id="btn-save-rg-token">حفظ التوكن على الخادم</button>' +
            '</div>' +
          '</div>' +
          '<div id="sync-action-msg" class="hidden" style="margin-bottom:14px;"></div>' +
          '<h3 style="margin:0 0 10px;font-size:14.5px;">سجل عمليات السحب (SyncLog)</h3>' +
          (!syncData.logs || syncData.logs.length === 0
            ? '<div class="empty-state" style="padding:20px;">لا توجد عمليات مزامنة مسجلة بعد.</div>'
            : '<div class="table-wrap"><table class="data-table"><thead><tr>' +
                '<th>المعرف</th><th>المنفذ</th><th>الحالة</th><th>مستورد</th><th>محدث</th><th>تمديدات</th><th>الصفحات</th><th>الرسالة</th><th>التوقيت</th>' +
              '</tr></thead><tbody>' +
                syncData.logs.map(function (l) {
                  return '<tr>' +
                    '<td class="mono">' + esc(l.id) + '</td>' +
                    '<td>' + esc(l.triggeredByName) + '</td>' +
                    '<td><span class="status-tag ' + (l.status === 'success' ? 'status-success' : 'status-danger') + '">' + (l.status === 'success' ? 'ناجح' : 'فشل') + '</span></td>' +
                    '<td class="tabular-nums">' + l.importedCount + '</td>' +
                    '<td class="tabular-nums">' + l.updatedCount + '</td>' +
                    '<td class="tabular-nums">' + l.extensionsCount + '</td>' +
                    '<td class="tabular-nums">' + l.pagesFetched + '</td>' +
                    '<td>' + esc(l.errorMessage || '-') + '</td>' +
                    '<td class="mono tabular-nums" style="white-space:nowrap;">' + esc(root.RGApi.formatDisplayDateTime(l.finishedAt) || '-') + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table></div>') +
        '</div>'
      ) : '') +

      (canManageSettings ? (
        '<form class="surface-card" id="sys-settings-form">' +
          '<div class="section-header"><div><h2 class="section-title">' + t('nav_settings') + ' العامة</h2><p class="section-subtitle">تُحفظ الإعدادات في ورقة Settings داخل Google Sheets عبر الخادم.</p></div></div>' +
          '<div class="form-grid-2">' +
            '<div class="form-group"><label class="form-label" for="set-company">اسم الشركة</label><input class="input" id="set-company" value="' + esc(settings.company_name || 'RENTAL GATE') + '"></div>' +
            '<div class="form-group"><label class="form-label" for="set-ttl">مدة صلاحية الجلسة (ساعات)</label><input class="input tabular-nums" type="number" min="1" max="168" id="set-ttl" value="' + (settings.session_ttl_hours || 24) + '"></div>' +
            '<div class="form-group"><label class="form-label" for="set-excluded">الحالات المستبعدة أثناء السحب (مفصولة بفاصلة)</label><input class="input mono" id="set-excluded" value="' + esc(Array.isArray(settings.excluded_statuses) ? settings.excluded_statuses.join(', ') : 'draft, test, abandoned') + '"></div>' +
            '<div class="form-group" style="justify-content:center;"><label class="checkbox-item"><input type="checkbox" id="set-agent-all"' + (settings.allow_agent_view_all ? ' checked' : '') + '> السماح لموظف خدمة العملاء باستعراض جميع الحجوزات</label></div>' +
          '</div>' +
          '<div style="margin-top:16px;padding:14px;border:1px solid var(--border-hairline);border-radius:var(--radius-sm);background:var(--bg-surface-subtle);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
              '<div><strong style="font-size:14px;">جدول التحديث التلقائي</strong></div>' +
              '<label class="checkbox-item" style="font-weight:700;"><input type="checkbox" id="set-auto-sync-enabled"' + (autoSyncEnabled ? ' checked' : '') + '> تفعيل التحديث التلقائي</label>' +
            '</div>' +
            '<div class="form-grid-2" style="align-items:end;">' +
              '<div class="form-group">' +
                '<label class="form-label" for="set-auto-sync-hours">فترة التحديث التلقائي (بالساعات)</label>' +
                '<input class="input tabular-nums" type="number" min="1" max="168" id="set-auto-sync-hours" value="' + autoSyncHours + '">' +
              '</div>' +
              '<div class="form-group">' +
                '<span class="form-label">اختيارات سريعة</span>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                  '<button type="button" class="btn btn-sm auto-sync-preset" data-hours="1">كل ساعة</button>' +
                  '<button type="button" class="btn btn-sm auto-sync-preset" data-hours="4">كل 4 ساعات</button>' +
                  '<button type="button" class="btn btn-sm auto-sync-preset" data-hours="12">كل 12 ساعة</button>' +
                  '<button type="button" class="btn btn-sm auto-sync-preset" data-hours="24">كل 24 ساعة</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:14px;"><button type="submit" class="btn btn-primary" id="btn-save-sys-settings">حفظ الإعدادات</button></div>' +
        '</form>'
      ) : '');

    var dbTestBtn = document.getElementById('btn-test-db-conn');
    if (dbTestBtn) {
      dbTestBtn.addEventListener('click', async function () {
        var out = document.getElementById('db-test-result');
        dbTestBtn.disabled = true;
        var res = await root.RGApi.callApi('testDatabaseConnection', {});
        dbTestBtn.disabled = false;
        out.className = res.success ? 'form-success' : 'form-error';
        out.textContent = res.message || (res.success ? 'متصل بنجاح.' : 'فشل الاتصال.');
      });
    }

    var rgTokenInput = document.getElementById('set-rg-token');
    var toggleRgTokenBtn = document.getElementById('toggle-rg-token');
    if (rgTokenInput && toggleRgTokenBtn) {
      toggleRgTokenBtn.addEventListener('click', function () {
        var nextType = rgTokenInput.type === 'password' ? 'text' : 'password';
        rgTokenInput.type = nextType;
        toggleRgTokenBtn.textContent = nextType === 'text' ? 'إخفاء' : 'إظهار';
      });
    }

    var saveRgTokenBtn = document.getElementById('btn-save-rg-token');
    if (saveRgTokenBtn) {
      saveRgTokenBtn.addEventListener('click', async function () {
        var inp = document.getElementById('set-rg-token');
        var msg = document.getElementById('sync-action-msg');
        var raw = inp ? inp.value.trim() : '';
        if (!raw) {
          msg.className = 'form-error';
          msg.textContent = 'يرجى لصق التوكن أولاً ثم الضغط على حفظ.';
          return;
        }
        saveRgTokenBtn.disabled = true;
        var res = await root.RGApi.callApi('saveApiToken', { token: raw, testAfterSave: true });
        saveRgTokenBtn.disabled = false;
        if (res.success) {
          if (inp) inp.value = '';
          msg.className = (res.data && res.data.connection && res.data.connection.connected === false) ? 'form-error' : 'form-success';
          msg.textContent = (res.data && res.data.connection && res.data.connection.message) || res.message || 'تم حفظ التوكن بنجاح.';
          ctx.toast('تم حفظ التوكن بنجاح.');
        } else {
          msg.className = 'form-error';
          msg.textContent = res.message || 'تعذر حفظ التوكن.';
        }
      });
    }

    var testRgBtn = document.getElementById('btn-test-rg');
    if (testRgBtn) {
      testRgBtn.addEventListener('click', async function () {
        var msg = document.getElementById('sync-action-msg');
        var res = await root.RGApi.callApi('testConnection', {});
        msg.className = (res.success && res.data && res.data.connected) ? 'form-success' : 'form-error';
        msg.textContent = (res.data && res.data.message) || res.message;
      });
    }

    var syncNowBtn = document.getElementById('btn-sync-now');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async function () {
        syncNowBtn.disabled = true;
        syncNowBtn.textContent = 'جاري السحب...';
        var res = await root.RGApi.callApi('syncRentalGate', {});
        if (res.success) {
          ctx.toast('اكتملت المزامنة بنجاح.');
          render(container, ctx);
        } else {
          var msg = document.getElementById('sync-action-msg');
          msg.className = 'form-error';
          msg.textContent = res.message;
          syncNowBtn.disabled = false;
          syncNowBtn.textContent = 'سحب الحجوزات الآن';
        }
      });
    }

    container.querySelectorAll('.auto-sync-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var inp = document.getElementById('set-auto-sync-hours');
        var chk = document.getElementById('set-auto-sync-enabled');
        if (inp) inp.value = btn.getAttribute('data-hours');
        if (chk) chk.checked = true;
      });
    });

    var sysForm = document.getElementById('sys-settings-form');
    if (sysForm) {
      sysForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var excluded = document.getElementById('set-excluded').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var autoEnabled = document.getElementById('set-auto-sync-enabled').checked;
        var autoHours = Math.max(1, Math.min(168, Number(document.getElementById('set-auto-sync-hours').value || 12)));
        var res = await root.RGApi.callApi('updateSettings', {
          company_name: document.getElementById('set-company').value,
          session_ttl_hours: Number(document.getElementById('set-ttl').value || 24),
          excluded_statuses: excluded,
          allow_agent_view_all: document.getElementById('set-agent-all').checked,
          auto_sync_enabled: autoEnabled,
          auto_sync_interval_hours: autoHours
        });
        if (res.success) {
          ctx.toast('تم حفظ الإعدادات بنجاح.');
          render(container, ctx);
        } else {
          ctx.toast(res.message, true);
        }
      });
    }
  }

  root.RGSettings = { render: render };
})(window);
