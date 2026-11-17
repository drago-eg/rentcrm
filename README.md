# RENTAL GATE CRM — Full Stack System

نظام **RENTAL GATE CRM** المتكامل لإدارة الحجوزات، العملاء، المهام، المتابعات، المشكلات، الموظفين، الصلاحيات، والتقارير (Excel / Arabic RTL PDF)، مبني بمعمارية ثلاثية الطبقات:

- **Frontend (`frontend/`)**: واجهة احترافية تدعم العربية والإنجليزية (`RTL` / `LTR`)، والوضع النهاري والليلي، وتصميم متجاوب بالكامل. تتصل فقط بـ Node.js Backend عبر REST API وJWT Authentication.
- **Backend (`backend/`)**: خادم Node.js + Express.js مستقل يوفر REST API مع JWT Authentication، تشفير كلمات المرور باستخدام `bcrypt`، التحقق من الصلاحيات (`RBAC` Middleware)، التحقق من المدخلات (`Validators`)، معالجة الأخطاء المركزية، وتكامل Excel احترافي عبر `ExcelJS` (تصدير، قوالب، فحص أخطاء وتكرار قبل الاستيراد).
- **Database (`google-apps-script/`)**: قاعدة بيانات منظمة داخل **Google Sheets** عبر **Google Apps Script Web App API** يدعم `GET / POST / PUT / DELETE`، الفلترة والبحث، منع التكرار، إنشاء المعرفات الفريدة، تتبع `createdAt` و`updatedAt`، وحماية التزامن (`LockService`) مع مصادقة سرية بين Backend وApps Script (`GAS_API_SECRET`).

---

## هيكل المشروع (Project Structure)

```text
.
├── frontend/                  # الواجهة الأمامية المستقلة (للنشر على Vercel / Cloudflare Pages)
│   ├── assets/                # CSS / JS / Vendor (Chart.js, SheetJS, jsPDF) / Images
│   ├── src/index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json
│   └── .env.example
├── backend/                   # خادم Backend المستقل (للنشر على Render)
│   ├── src/
│   │   ├── config/            # env.js & permissions.js
│   │   ├── controllers/       # Auth, Customers, Reservations, Tasks, Problems, Employees, Excel, Settings...
│   │   ├── middleware/        # auth.js (JWT), rbac.js, validate.js, errorHandler.js
│   │   ├── routes/            # authRoutes, customerRoutes, reservationRoutes, excelRoutes...
│   │   ├── services/          # gasClient.js, authService.js, crmDataService.js, excelService.js, rentalGateSyncService.js
│   │   ├── utils/             # errors.js, dateUtils.js, validators.js
│   │   └── app.js
│   ├── package.json
│   ├── server.js
│   └── .env.example
├── google-apps-script/        # محرك قاعدة البيانات على Google Sheets
│   ├── Code.gs                # Web App API Router (doGet / doPost + method tunneling)
│   ├── DataEngine.gs          # محرك CRUD مع LockService ومنع التكرار وحماية GAS_API_SECRET
│   ├── Database.gs            # تهيئة الجداول (Tabs) والأعمدة والبذور الأولية
│   ├── Utils.gs               # أدوات المساعدة والمصادقة والتواريخ
│   ├── Auth.gs                # دعم إدارة المستخدمين والصلاحيات
│   ├── Reservations.gs        # تكامل الحجوزات والتمديدات
│   ├── Reports.gs             # استعلامات التقارير
│   └── ...
├── .env.example
├── server.ts                  # نقطة التشغيل الموحدة للتطوير والـ Preview
└── README.md
```

---

## الخطوة 1: إعداد قاعدة البيانات (Google Sheets + Google Apps Script)

1. أنشئ ملف **Google Spreadsheet** جديداً من Google Drive (أو استخدم ملفاً مخصصاً).
2. افتح **Extensions -> Apps Script**.
3. انسخ جميع الملفات الموجودة في مجلد `google-apps-script/` إلى محرر Apps Script بنفس الأسماء (`Code.gs`, `DataEngine.gs`, `Database.gs`, `Utils.gs`, `Auth.gs`, `Reservations.gs`, `FollowUps.gs`, `Problems.gs`, `Employees.gs`, `Reports.gs`, `RentalGateApi.gs`, `Notifications.gs`, `Migrations.gs`).
4. من قائمة **Project Settings -> Script Properties** أضف الخصائص التالية:
   - `GAS_API_SECRET`: كلمة سر طويلة وعشوائية (نفس القيمة التي ستوضع لاحقاً في Backend).
   - `RG_TOKEN`: (اختياري) توكن API الخاص بـ Rental Gate إذا كنت تستخدم المزامنة التلقائية.
5. في محرر Apps Script اختر الدالة `setupRentalGateDatabase` واضغط **Run** لإنشاء كافة الأوراق (Tabs) والأعمدة التالية تلقائياً:
   - `Users`, `Employees`, `Customers`, `Tasks`, `Reservations`, `Extensions`, `Assignments`, `FollowUps`, `FollowUpHistory`, `Issues`, `Problems`, `ProblemUpdates`, `ActivityLog`, `Notifications`, `Settings`, `Roles`, `Permissions`, `Sessions`, `SyncLog`
   > ملاحظة: يمكنك تعديل اسم المستخدم وكلمة المرور الأولية بعد أول تسجيل دخول من صفحة الموظفين، حيث يقوم Backend بترحيل وتشفير كلمات المرور تلقائياً إلى `bcrypt` عند أول تسجيل دخول، وجميع الموظفين الجدد يُخزنون بتشفير `bcrypt` فقط.
6. اضغط **Deploy -> New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (حماية الوصول تتم عبر `GAS_API_SECRET` في كل طلب).
7. انسخ رابط الـ Web App المنتهي بـ `/exec` لاستخدامه في `GAS_WEB_APP_URL`.

---

## الخطوة 2 (الأسهل): النشر الكامل على Vercel فقط (Frontend + Backend معاً)

يمكنك استضافة الواجهة الأمامية والخادم الخلفي (`api/index.js` + `backend/`) في مشروع واحد مجاني على **Vercel** بدون الحاجة إلى Render:

1. ارفع المستودع على GitHub ثم افتح [Vercel](https://vercel.com) واضغط **Add New -> Project**.
2. اترك **Root Directory** على الجذر `./` (يقرأ تلقائياً ملف `vercel.json` و`package.json`).
3. أضف **Environment Variables** في Vercel:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: مفتاح سري عشوائي قوي (64 حرفاً على الأقل)
   - `JWT_EXPIRES_IN`: `24h`
   - `GAS_WEB_APP_URL`: رابط Web App من الخطوة 1 (`/exec`)
   - `GAS_API_SECRET`: نفس الكلمة السرية الموضوعة في Apps Script
   - `RG_API_TOKEN`: (اختياري) توكن Rental Gate API
   > اترك `VITE_API_BASE_URL` فارغاً ليتصل الموقع تلقائياً بنفس الدومين على `/api`.
4. اضغط **Deploy** ثم اختبر `https://<your-project>.vercel.app/api/health`.

---

## الخطوة 2 (البديل المنفصل): نشر Backend مجاناً على Render

1. ارفع المشروع إلى مستودع GitHub أو GitLab خاص بك.
2. سجل الدخول إلى [Render](https://render.com) واضغط **New -> Web Service**.
3. اربط المستودع وحدد الإعدادات التالية:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. أضف **Environment Variables** في Render:
   - `PORT`: `10000` (أو الافتراضي من Render)
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: مفتاح سري عشوائي قوي (64 حرفاً على الأقل)
   - `JWT_EXPIRES_IN`: `24h`
   - `GAS_WEB_APP_URL`: رابط Web App من الخطوة 1 (`/exec`)
   - `GAS_API_SECRET`: نفس الكلمة السرية الموضوعة في Apps Script
   - `CORS_ORIGIN`: رابط موقعك الأمامي (مثال: `https://rental-gate-crm.vercel.app`)
   - `RG_API_TOKEN`: (اختياري) توكن Rental Gate API
5. بعد اكتمال النشر، اختبر الرابط:
   `https://<your-backend>.onrender.com/api/health`
   يجب أن يعيد استجابة JSON تؤكد الاتصال بـ GAS وGoogle Sheets.

---

## الخطوة 3: نشر Frontend مجاناً على Vercel أو Cloudflare Pages

### الخيار أ: Vercel
1. في [Vercel](https://vercel.com) اضغط **Add New -> Project** واختر المستودع.
2. في إعدادات المشروع:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. أضف متغير البيئة:
   - `VITE_API_BASE_URL`: `https://<your-backend>.onrender.com/api`
4. اضغط **Deploy**.

### الخيار ب: Cloudflare Pages
1. في **Workers & Pages -> Create application -> Pages -> Connect to Git**:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
2. أضف متغير البيئة:
   - `VITE_API_BASE_URL`: `https://<your-backend>.onrender.com/api`
3. انشر الموقع وتأكد من إضافة رابط Cloudflare Pages ضمن `CORS_ORIGIN` في إعدادات Render.

---

## التشغيل المحلي (Local Development)

1. انسخ ملف البيئة:
   ```bash
   cp .env.example .env
   ```
   وأدخل `JWT_SECRET` و`GAS_WEB_APP_URL` و`GAS_API_SECRET`.
2. ثبّت الاعتماديات وشغّل النظام:
   ```bash
   npm install
   npm run dev
   ```
3. يفتح النظام على `http://localhost:3000`.
4. لتشغيل الاختبارات الآلية (الوحدة + اختبارات REST API وRBAC وExcelJS):
   ```bash
   npm test
   ```

---

## ميزات النظام الرئيسية والأمان

- **الأمان والمصادقة**:
  - تسجيل دخول عبر JWT (`Authorization: Bearer <token>`) محفوظ في `sessionStorage` فقط.
  - تشفير كلمات المرور بواسطة `bcryptjs` داخل Node.js Backend.
  - فرض الصلاحيات (Admin / General Manager, Supervisor, Employee / Agent) داخل Backend Middleware وليس فقط في الواجهة.
  - لا توجد أي مفاتيح سرية أو روابط Google Apps Script في كود Frontend.
- **الإدارة والعمليات**:
  - لوحة التحكم التحليلية مع رسوم بيانية حيّة ومؤشرات KPI.
  - إدارة **العملاء** (`Customers`)، **الحجوزات** (`Reservations`)، **المتابعات** (`FollowUps`)، **المشكلات** (`Problems`)، **المهام** (`Tasks`)، **الموظفين والصلاحيات** (`Employees`)، و**التقارير** (`Reports`).
- **تكامل Excel (`ExcelJS`)**:
  - تنزيل قوالب `.xlsx` جاهزة لكل نوع بيانات (العملاء، الحجوزات، المهام).
  - رفع ملف Excel وفحص الأعمدة وصحة البيانات واكتشاف التكرار وعرض تقرير معاينة تفصيلي قبل تأكيد الحفظ في Google Sheets.
  - تصدير البيانات والتقارير المباشر إلى `.xlsx` و`PDF` (عربي RTL).
