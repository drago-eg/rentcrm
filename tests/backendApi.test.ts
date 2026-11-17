import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { createBackendApp } from '../backend/src/app.js';

const GAS_SECRET = 'test-gas-shared-secret-9988';

const RESOURCE_CFG: Record<string, { idField: string; prefix: string; uniqueFields: string[] }> = {
  users: { idField: 'id', prefix: 'USR', uniqueFields: ['username'] },
  employees: { idField: 'id', prefix: 'EMP', uniqueFields: ['username'] },
  customers: { idField: 'id', prefix: 'CUS', uniqueFields: ['phone', 'email'] },
  reservations: { idField: 'id', prefix: 'RES', uniqueFields: ['reservationNumber'] },
  extensions: { idField: 'id', prefix: 'EXT', uniqueFields: ['extensionNumber'] },
  assignments: { idField: 'id', prefix: 'ASN', uniqueFields: [] },
  followups: { idField: 'id', prefix: 'FU', uniqueFields: [] },
  followup_history: { idField: 'id', prefix: 'FUH', uniqueFields: [] },
  problems: { idField: 'id', prefix: 'PRB', uniqueFields: ['problemNumber'] },
  problem_updates: { idField: 'id', prefix: 'PU', uniqueFields: [] },
  tasks: { idField: 'id', prefix: 'TSK', uniqueFields: [] },
  activity_log: { idField: 'id', prefix: 'ACT', uniqueFields: [] },
  notifications: { idField: 'id', prefix: 'NTF', uniqueFields: [] },
  settings: { idField: 'key', prefix: 'SET', uniqueFields: ['key'] },
  roles: { idField: 'id', prefix: 'PRESET', uniqueFields: ['id'] },
  permissions: { idField: 'key', prefix: 'PERM', uniqueFields: ['key'] },
  sessions: { idField: 'tokenHash', prefix: 'SES', uniqueFields: ['tokenHash'] },
  sync_log: { idField: 'id', prefix: 'SYNC', uniqueFields: [] },
};

function createInMemoryGasMockServer() {
  let seq = 1;
  const legacySalt = 'salt-legacy-1';
  const legacySha256 = crypto
    .createHash('sha256')
    .update(`${legacySalt}::RENTAL_GATE_CRM::AgentPass123!`)
    .digest('hex');

  const store: Record<string, any[]> = {
    employees: [
      {
        id: 'EMP_ADMIN_1',
        name: 'مدير النظام الاختباري',
        username: 'admin',
        passwordHash: bcrypt.hashSync('AdminPass123!', 10),
        salt: '',
        role: 'general_manager',
        jobTitle: 'المدير العام',
        phone: '0500000001',
        email: 'admin@rentalgate.test',
        status: 'active',
        permissions: [],
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
        lastActivity: '2026-11-01T10:00:00.000Z',
      },
      {
        id: 'EMP_AGENT_1',
        name: 'موظف المتابعة الاختباري',
        username: 'agent1',
        passwordHash: legacySha256,
        salt: legacySalt,
        role: 'agent',
        jobTitle: 'موظف متابعة',
        phone: '0500000002',
        email: 'agent1@rentalgate.test',
        status: 'active',
        permissions: [],
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
        lastActivity: '2026-11-01T10:00:00.000Z',
      },
    ],
    customers: [
      {
        id: 'CUS_SEED_1',
        name: 'عميل حالي مسجل',
        phone: '0551112223',
        email: 'existing@customer.test',
        nationalId: '1099887766',
        company: 'الأولى لتأجير السيارات',
        status: 'active',
        notes: 'سجل موجود مسبقاً',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    reservations: [],
    extensions: [],
    assignments: [],
    followups: [],
    followup_history: [],
    problems: [],
    problem_updates: [],
    tasks: [],
    activity_log: [],
    notifications: [],
    settings: [{ key: 'companyName', value: 'RENTAL GATE CRM' }],
    roles: [],
    permissions: [],
    sessions: [],
    sync_log: [],
    users: [],
  };

  function nextId(prefix: string) {
    seq += 1;
    return `${prefix}_${Date.now()}_${seq}`;
  }

  function assertUnique(resource: string, candidate: any, excludeId?: string) {
    const cfg = RESOURCE_CFG[resource];
    if (!cfg || !cfg.uniqueFields.length) return;
    const rows = store[resource] || [];
    for (const f of cfg.uniqueFields) {
      const val = String(candidate?.[f] || '').trim().toLowerCase();
      if (!val) continue;
      for (const row of rows) {
        if (excludeId && String(row[cfg.idField]) === String(excludeId)) continue;
        const rVal = String(row?.[f] || '').trim().toLowerCase();
        if (rVal && rVal === val) {
          throw new Error(`DUPLICATE_RECORD: السجل مكرر بناءً على الحقل (${f}: ${candidate[f]}).`);
        }
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(ch as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    const params = Object.fromEntries(reqUrl.searchParams.entries());
    const secret = body.secret || params.secret || '';
    if (secret !== GAS_SECRET) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'UNAUTHORIZED: Invalid secret', error: 'UNAUTHORIZED' }));
      return;
    }

    try {
      const action = body.action || params.action || '';
      const resource = String(body.resource || params.resource || '').toLowerCase();
      const method = String(body._method || req.method || 'GET').toUpperCase();
      const id = String(body.id || params.id || '');
      const payload = body.payload || {};

      if (action === 'engine_health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { ok: true, spreadsheetId: 'MOCK_SHEET_ID', hasRgToken: false, timestamp: new Date().toISOString() },
        }));
        return;
      }

      if (action === 'engine_init') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { initialized: true } }));
        return;
      }

      if (action === 'engine_snapshot') {
        const wanted = Array.isArray(payload.resources) && payload.resources.length
          ? payload.resources
          : Object.keys(store);
        const out: Record<string, any> = {};
        for (const r of wanted) out[r] = store[r] || [];
        out._meta = { hasRgToken: false, timestamp: new Date().toISOString() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: out }));
        return;
      }

      if (action === 'engine_upsert_batch') {
        const cfg = RESOURCE_CFG[resource];
        const rows = store[resource] || (store[resource] = []);
        const keyField = payload.keyField || cfg.idField;
        const recs = Array.isArray(payload.records) ? payload.records : [];
        let inserted = 0;
        let updated = 0;
        for (const r of recs) {
          const copy = { ...r };
          if (!copy[cfg.idField]) copy[cfg.idField] = nextId(cfg.prefix);
          if (!copy.createdAt) copy.createdAt = new Date().toISOString();
          copy.updatedAt = new Date().toISOString();
          const idx = rows.findIndex((x) => String(x[keyField]) === String(copy[keyField]));
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...copy };
            updated += 1;
          } else {
            rows.push(copy);
            inserted += 1;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { inserted, updated } }));
        return;
      }

      const cfg = RESOURCE_CFG[resource];
      if (!cfg) throw new Error(`UNKNOWN_RESOURCE: ${resource}`);
      const list = store[resource] || (store[resource] = []);

      if (method === 'GET') {
        if (id) {
          const item = list.find((x) => String(x[cfg.idField]) === id);
          if (!item) throw new Error('NOT_FOUND: السجل غير موجود.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { item } }));
          return;
        }
        const q = String(params.q || params.search || '').trim().toLowerCase();
        const filtered = q ? list.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : list;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { items: filtered, total: filtered.length } }));
        return;
      }

      if (method === 'POST') {
        const data = { ...payload };
        if (!data[cfg.idField]) data[cfg.idField] = nextId(cfg.prefix);
        if (resource === 'problems' && !data.problemNumber) data.problemNumber = `PRB-${Math.floor(1000 + Math.random() * 9000)}`;
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();
        if (!body.allowDuplicate) assertUnique(resource, data);
        list.push(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { item: data } }));
        return;
      }

      if (method === 'PUT') {
        const idx = list.findIndex((x) => String(x[cfg.idField]) === id);
        if (idx < 0) throw new Error('NOT_FOUND: السجل غير موجود للتحديث.');
        const merged = { ...list[idx], ...payload, [cfg.idField]: id, updatedAt: new Date().toISOString() };
        assertUnique(resource, merged, id);
        list[idx] = merged;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { item: merged } }));
        return;
      }

      if (method === 'DELETE') {
        const idx = list.findIndex((x) => String(x[cfg.idField]) === id);
        if (idx < 0) throw new Error('NOT_FOUND: السجل غير موجود للحذف.');
        list.splice(idx, 1);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { deleted: true, id } }));
        return;
      }

      throw new Error(`Unsupported method: ${method}`);
    } catch (err: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err?.message || String(err) }));
    }
  });

  return { server, store };
}

test('Full Stack Backend API: Auth, JWT, RBAC, CRUD, Duplicate Prevention, and ExcelJS Import/Export', async (t) => {
  const { server: gasServer, store } = createInMemoryGasMockServer();
  await new Promise<void>((resolve) => gasServer.listen(0, '127.0.0.1', resolve));
  const gasAddr = gasServer.address() as { port: number };

  process.env.GAS_WEB_APP_URL = `http://127.0.0.1:${gasAddr.port}/exec`;
  process.env.GAS_API_SECRET = GAS_SECRET;
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-integration-suite';
  process.env.NODE_ENV = 'test';

  const app = createBackendApp();
  const apiServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  const apiAddr = apiServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${apiAddr.port}/api`;

  t.after(async () => {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    await new Promise<void>((resolve) => gasServer.close(() => resolve()));
  });

  // 1. Health check
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  const healthJson: any = await healthRes.json();
  assert.equal(healthJson.success, true);
  assert.equal(healthJson.data.gasConfigured, true);

  // 2. Protected routes reject missing JWT
  const unauthRes = await fetch(`${baseUrl}/customers`);
  assert.equal(unauthRes.status, 401);

  // 3. Login Admin (bcrypt) & Agent (legacy SHA-256 -> auto re-hashed to bcrypt!)
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass123!' }),
  });
  assert.equal(adminLoginRes.status, 200);
  const adminLoginJson: any = await adminLoginRes.json();
  assert.equal(adminLoginJson.success, true);
  const adminToken = adminLoginJson.data.token;
  assert.ok(adminToken);
  assert.equal(adminLoginJson.data.user.passwordHash, undefined);
  assert.equal(adminLoginJson.data.user.salt, undefined);

  const agentLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'agent1', password: 'AgentPass123!' }),
  });
  assert.equal(agentLoginRes.status, 200);
  const agentLoginJson: any = await agentLoginRes.json();
  const agentToken = agentLoginJson.data.token;
  // Confirm legacy SHA-256 user was migrated to bcrypt in GAS store
  const migratedAgent = store.employees.find((e) => e.username === 'agent1');
  assert.ok(String(migratedAgent.passwordHash).startsWith('$2'));

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };
  const agentHeaders = {
    Authorization: `Bearer ${agentToken}`,
    'Content-Type': 'application/json',
  };

  // 4. RBAC Enforcement: Agent is blocked (403) from privileged operations
  const forbiddenCreateEmp = await fetch(`${baseUrl}/employees`, {
    method: 'POST',
    headers: agentHeaders,
    body: JSON.stringify({ name: 'test', username: 'x1', password: 'Password1!', role: 'agent' }),
  });
  assert.equal(forbiddenCreateEmp.status, 403);

  const forbiddenDelCus = await fetch(`${baseUrl}/customers/CUS_SEED_1`, {
    method: 'DELETE',
    headers: agentHeaders,
  });
  assert.equal(forbiddenDelCus.status, 403);

  // 5. Customers CRUD + Search + Duplicate Rejection
  const createCusRes = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'نورة القحطاني',
      phone: '0559998887',
      email: 'noura@example.com',
      company: 'بدجت',
    }),
  });
  assert.equal(createCusRes.status, 201);
  const createdCus: any = await createCusRes.json();
  const cusId = createdCus.data.customer?.id || createdCus.data.id;
  assert.ok(cusId);

  // Duplicate phone rejected with 409 Conflict
  const dupCusRes = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'مكرر',
      phone: '0559998887',
    }),
  });
  assert.equal(dupCusRes.status, 409);

  // Search Customers
  const searchCusRes = await fetch(`${baseUrl}/customers?search=${encodeURIComponent('نورة')}`, {
    headers: adminHeaders,
  });
  assert.equal(searchCusRes.status, 200);
  const searchCusJson: any = await searchCusRes.json();
  assert.equal(searchCusJson.data.items.length, 1);

  // Update Customer
  const updateCusRes = await fetch(`${baseUrl}/customers/${cusId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ notes: 'VIP عميل' }),
  });
  assert.equal(updateCusRes.status, 200);

  // 6. Reservations CRUD + Claim + Quick Status + Duplicate Number check
  const createRes = await fetch(`${baseUrl}/reservations`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      reservationNumber: 'RG-9001',
      customerName: 'نورة القحطاني',
      customerPhone: '0559998887',
      companyName: 'بدجت',
      branchName: 'الرياض',
      carName: 'هيونداي سوناتا',
      startDate: '2026-11-20',
      endDate: '2026-11-24',
      baseAmount: 800,
    }),
  });
  assert.equal(createRes.status, 201);
  const resObj: any = await createRes.json();
  const resId = resObj.data.reservation?.id || resObj.data.id;
  assert.ok(resId);

  const claimRes = await fetch(`${baseUrl}/reservations/${resId}/claim`, {
    method: 'POST',
    headers: agentHeaders,
  });
  assert.equal(claimRes.status, 200);
  const claimJson: any = await claimRes.json();
  const claimedResObj = claimJson.data.reservation || claimJson.data;
  assert.ok(claimedResObj.assignedEmployeeIds.includes('EMP_AGENT_1'));

  const quickStatusRes = await fetch(`${baseUrl}/reservations/${resId}/quick-status`, {
    method: 'POST',
    headers: agentHeaders,
    body: JSON.stringify({ status: 'تم التسليم', note: 'تم التسليم بنجاح' }),
  });
  assert.equal(quickStatusRes.status, 200);
  const quickJson: any = await quickStatusRes.json();
  const quickResObj = quickJson.data.reservation || quickJson.data;
  assert.equal(quickResObj.internalStatus, 'تم التسليم');

  // Duplicate reservationNumber returns 409
  const dupReservation = await fetch(`${baseUrl}/reservations`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      reservationNumber: 'RG-9001',
      customerName: 'شخص آخر',
      customerPhone: '0501234567',
    }),
  });
  assert.equal(dupReservation.status, 409);

  // 7. Tasks & Problems CRUD
  const createTaskRes = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: agentHeaders,
    body: JSON.stringify({
      title: 'مراجعة عقد الحجز',
      reservationNumber: 'RG-9001',
      priority: 'مرتفع',
      dueDate: '2026-11-25',
    }),
  });
  assert.equal(createTaskRes.status, 201);
  const taskJson: any = await createTaskRes.json();
  const taskId = taskJson.data.task?.id || taskJson.data.id;
  assert.ok(taskId);

  const updateTaskRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
    method: 'PUT',
    headers: agentHeaders,
    body: JSON.stringify({ status: 'مكتملة' }),
  });
  assert.equal(updateTaskRes.status, 200);

  const createProblemRes = await fetch(`${baseUrl}/problems`, {
    method: 'POST',
    headers: agentHeaders,
    body: JSON.stringify({
      reservationId: resId,
      description: 'تأخر تجهيز المركبة',
      priority: 'مرتفع',
    }),
  });
  assert.equal(createProblemRes.status, 201);

  // 8. Employee creation hashes password with bcrypt & never returns passwordHash
  const createEmpRes = await fetch(`${baseUrl}/employees`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'سلمان الشهري',
      username: 'salman.sup',
      password: 'StrongPassword#2026',
      role: 'supervisor',
      jobTitle: 'مشرف عمليات',
    }),
  });
  assert.equal(createEmpRes.status, 201);
  const empJson: any = await createEmpRes.json();
  const empCreatedObj = empJson.data.employee || empJson.data;
  assert.equal(empCreatedObj.passwordHash, undefined);
  const storedSalman = store.employees.find((e) => e.username === 'salman.sup');
  assert.ok(storedSalman);
  assert.ok(storedSalman.passwordHash.startsWith('$2'));
  assert.equal(await bcrypt.compare('StrongPassword#2026', storedSalman.passwordHash), true);

  // 9. ExcelJS Integration: Template Download -> Validation Preview -> Commit Import -> Export
  const tplRes = await fetch(`${baseUrl}/excel/template/customers`, { headers: adminHeaders });
  assert.equal(tplRes.status, 200);
  const tplBuf = await tplRes.arrayBuffer();
  const tplWb = new ExcelJS.Workbook();
  await tplWb.xlsx.load(tplBuf);
  assert.equal(tplWb.worksheets[0].name, 'Customers');

  // Build test upload workbook:
  // Row 2: Valid new customer
  // Row 3: Duplicate phone (existing '0551112223')
  // Row 4: Invalid (empty name & invalid phone '123')
  const uploadWb = new ExcelJS.Workbook();
  const ws = uploadWb.addWorksheet('Customers');
  ws.addRow(['اسم العميل', 'رقم الجوال', 'البريد الإلكتروني', 'الشركة', 'الحالة']);
  ws.addRow(['عبدالعزيز التميمي', '0547778889', 'aziz@example.com', 'الذيب', 'active']);
  ws.addRow(['عميل مكرر', '0551112223', 'dup@example.com', 'بدجت', 'active']);
  ws.addRow(['', '123', 'bad-email', 'بدجت', 'active']);
  const uploadBuf = Buffer.from(await uploadWb.xlsx.writeBuffer());

  const form = new FormData();
  form.append('entity', 'customers');
  form.append(
    'file',
    new Blob([uploadBuf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'customers-import.xlsx'
  );

  const previewRes = await fetch(`${baseUrl}/excel/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
  assert.equal(previewRes.status, 200);
  const previewJson: any = await previewRes.json();
  assert.equal(previewJson.data.validCount, 1);
  assert.equal(previewJson.data.duplicateCount, 1);
  assert.equal(previewJson.data.errorCount, 1);

  const commitRes = await fetch(`${baseUrl}/excel/import`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      entity: 'customers',
      rows: previewJson.data.validRows,
    }),
  });
  assert.equal(commitRes.status, 201);
  const commitJson: any = await commitRes.json();
  assert.equal(commitJson.data.importedCount, 1);

  // Confirm imported customer is exported via ExcelJS
  const exportRes = await fetch(`${baseUrl}/excel/export/customers`, { headers: adminHeaders });
  assert.equal(exportRes.status, 200);
  const exportBuf = await exportRes.arrayBuffer();
  const exportWb = new ExcelJS.Workbook();
  await exportWb.xlsx.load(exportBuf);
  const sheetRows: string[] = [];
  exportWb.worksheets[0].eachRow((row) => {
    sheetRows.push(JSON.stringify(row.values));
  });
  assert.ok(sheetRows.some((r) => r.includes('عبدالعزيز التميمي')));

  // Delete Reservation (Admin only) & verify Agent forbidden
  const agentDelRes = await fetch(`${baseUrl}/reservations/${resId}`, {
    method: 'DELETE',
    headers: agentHeaders,
  });
  assert.equal(agentDelRes.status, 403);

  const adminDelRes = await fetch(`${baseUrl}/reservations/${resId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  assert.equal(adminDelRes.status, 200);
});

test('Vercel Serverless entrypoint (api/index.js) serves /api routes cleanly', async (t) => {
  const { default: vercelHandler } = await import('../api/index.js');
  const srv = http.createServer((req, res) => vercelHandler(req, res));
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address() as { port: number };
  t.after(async () => {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  const hRes = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
  assert.equal(hRes.status, 200);
  const hJson: any = await hRes.json();
  assert.equal(hJson.success, true);

  const rootApiRes = await fetch(`http://127.0.0.1:${addr.port}/health`);
  assert.equal(rootApiRes.status, 200);

  const unauth = await fetch(`http://127.0.0.1:${addr.port}/api/customers`);
  assert.equal(unauth.status, 401);
});

