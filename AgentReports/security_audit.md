# 🔐 NodeShop Security Audit Report
**Date:** 2026-03-31 | **Auditor:** Antigravity (Senior Cybersecurity Researcher Mode)  
**Stack:** Node.js / Express 5 / MongoDB / EJS / Cloudinary

---

## Summary Table

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| 1 | 🔴 CRITICAL | Broken Access Control | `/admin` and all mutation API routes have zero authentication |
| 2 | 🔴 CRITICAL | Sensitive Info Exposure | Real secrets committed — `.env` has live DB credentials & Cloudinary keys |
| 3 | 🔴 CRITICAL | No `.gitignore` | `.env` will be pushed to any git remote as plaintext |
| 4 | 🟠 HIGH | XSS | Unsafe `<%-` raw output tag used in EJS (header partial injection) |
| 5 | 🟠 HIGH | Session Security | Session cookie lacks `httpOnly`, `secure`, and `sameSite` flags |
| 6 | 🟡 MEDIUM | File Upload | `allowedFormats` alone is client-hintable; no MIME type server-side check |
| 7 | 🟡 MEDIUM | NoSQL Injection | `getUserByEmail` passes raw user-controlled string directly into `findOne` |
| 8 | 🟢 LOW | Open Redirect | Redirect destination on login (`/`) is hardcoded — low risk, but noted |

---

## 🔴 Finding #1 — CRITICAL: Broken Access Control on All Admin Routes

### Location
- `frontend/app.js` — Lines 32–52 (`GET /admin`, `GET /edit-item/:id`)
- `backend/app.js` — Lines 127–155 (`POST /api/items/:id`), 181–204 (`POST /api/items`), 225–260 (`DELETE /api/items/:id`)

### The Problem
There is **no authentication middleware on any route**. Any anonymous visitor who knows (or guesses) the URL can:
- View the full admin panel at `/admin`
- Edit any item via `POST /api/items/:id`
- **Permanently delete any item** via `DELETE /api/items/:id`
- Create items via `POST /api/items`

The `req.session.userId` is set on login (line 381 of `backend/app.js`) but **never checked** on any of these routes.

### How to Fix

**Step 1 — Create a reusable auth middleware** (e.g., `backend/middleware/auth.js`):
```js
function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        // For API routes — return JSON 401
        if (req.path.startsWith('/api') || req.xhr) {
            return res.status(401).json({ error: 'Unauthorized. Please log in.' });
        }
        // For page routes — redirect to login
        return res.redirect('/login');
    }
    next();
}
module.exports = { requireAuth };
```

**Step 2 — Apply it to every protected route:**
```js
// frontend/app.js
const { requireAuth } = require('../backend/middleware/auth');

app.get('/admin', requireAuth, async (req, res) => { ... });
app.get('/edit-item/:id', requireAuth, async (req, res) => { ... });

// backend/app.js
const { requireAuth } = require('./middleware/auth');

app.post('/items', requireAuth, upload.single('imagenFile'), ...);
app.post('/items/:id', requireAuth, upload.single('imagenFile'), ...);
app.delete('/items/:id', requireAuth, ...);
```

---

## 🔴 Finding #2 — CRITICAL: Live Secrets in `.env` (Committed to Repo)

### Location
- `.env` — Lines 1–5

### The Problem
Your `.env` file contains **real, live credentials**:
- `CONNECTION_STRING` — Full MongoDB Atlas URI including username and password
- `CLOUDINARY_API_SECRET` — Anyone with this can upload/delete from your account
- `SESSION_SECRET` — A weak, descriptive name ("SUPER_MEGA_SECRET_THINGY_THAT_MUST_BE_CHANGED_IN_PRODUCTION") that is still being used in production

These are **real keys visible in this file right now**. If this project were ever pushed to a public GitHub repo, all three services would be immediately compromised.

### How to Fix

1. **Rotate all credentials immediately** — Change the MongoDB Atlas password, regenerate the Cloudinary API secret, and generate a new `SESSION_SECRET`.
2. **Generate a strong session secret:**
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
3. **Replace the `.env` with a `.env.example`** (safe to commit) and add `.env` to `.gitignore`:
```
# .env.example
CONNECTION_STRING=mongodb+srv://<user>:<password>@<cluster>/?appName=<app>
SESSION_SECRET=<generate-with-crypto-randomBytes-64>
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
```

---

## 🔴 Finding #3 — CRITICAL: No `.gitignore` File

### Location
- Project root — **file does not exist**

### The Problem
Running `git add .` will commit **everything**, including:
- `.env` (live secrets — see Finding #2)
- `node_modules/` (thousands of files, bloats the repo)

### How to Fix
Create `.gitignore` at the project root:
```gitignore
# Environment — NEVER commit
.env
.env.local
.env.production

# Dependencies
node_modules/
**/node_modules/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db
```

---

## 🟠 Finding #4 — HIGH: XSS via Unsafe `<%-` in EJS Templates

### Location
- `frontend/views/admin.ejs` — Line 11: `<%- include("partials/header.ejs") %>`
- `frontend/views/admin.ejs` — Line 179: `<%- include("partials/footer.ejs") %>`
- `frontend/views/edit-item.ejs` — Lines 12, 170
- `frontend/views/home.ejs` — Lines 11, 43

Also, `edit-item.ejs` Line 62:
```ejs
<div class="flash flash--error">❌ <%= error %></div>
```
If `error` is ever set from user input (e.g., via a query param), this is an XSS vector.

### The Problem
`<%-` renders **raw, unescaped HTML**. This is intentional and correct for trusted `include()` calls, but it's important to know this is the **only** safe use. If you ever accidentally pass a user-controlled variable through `<%-` instead of `<%=`, you have a stored XSS vulnerability.

The **good news**: all user data fields (`item.nombre`, `item.descripcion`, etc.) correctly use `<%= %>` which auto-escapes HTML. ✅

### Areas That Need Attention

`edit-item.ejs` line 19 — Item `_id` rendered into a `<code>` tag with `<%= %>` (safe ✅), but also used in the form `action` attribute on line 54:
```ejs
action="/api/items/<%= item._id %>"
```
MongoDB `ObjectId` values are hex strings (`[a-f0-9]{24}`) so this poses no real risk, but you should still **validate the ID format** on the backend.

### How to Fix (Backend ID Validation)
Add this to your DAL functions and route handlers:
```js
const { ObjectId } = require('mongodb');

// Guard at route entry points
function isValidObjectId(id) {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

// In your routes:
app.delete('/items/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'Invalid item ID.' });
    }
    // ... rest of handler
});
```
This prevents `CastError` exceptions from leaking stack traces to users.

---

## 🟠 Finding #5 — HIGH: Insecure Session Cookie Configuration

### Location
- `app.js` (root) — Lines 9–19

### The Problem
```js
cookie: { maxAge: 1000 * 60 * 60 * 24 }
```
The cookie is missing three critical security flags:

| Missing Flag | Risk |
|---|---|
| `httpOnly: true` | Without it, browser JavaScript (`document.cookie`) can read the session ID — XSS → session hijack |
| `secure: true` | Without it, session cookie is sent over plain HTTP, enabling MITM interception |
| `sameSite: 'strict'` | Without it, session cookie is sent on cross-site requests — enables CSRF attacks |

### How to Fix
```js
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ ... }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,                                      // ← ADD
        secure: process.env.NODE_ENV === 'production',       // ← ADD (HTTPS only in prod)
        sameSite: 'strict'                                   // ← ADD
    }
}));
```

> [!NOTE]
> `MongoStore` is imported from `connect-mongo`. You are correctly using the class constructor (`new MongoStore(...)`) but `connect-mongo` v6+ recommends `MongoStore.create(...)` as the factory method. Either works, but the factory is preferred.

---

## 🟡 Finding #6 — MEDIUM: File Upload — Insufficient Server-Side MIME Validation

### Location
- `backend/utils/cloudinary.js` — Lines 11–17

### The Problem
```js
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'shop_items',
        allowedFormats: ['jpg', 'png', 'jpeg'],  // ← enforced by Cloudinary SDK
    },
});
```
`allowedFormats` is passed as a hint to Cloudinary which does enforce it server-side. **However**, there is no local pre-flight check before the file is sent to Cloudinary. A user can:
1. Upload a `.php` or `.html` file renamed as `.jpg` — Cloudinary will reject it, but multer will have already buffered it in memory.
2. There is no `fileSize` limit — a user can upload a very large file, consuming your Cloudinary bandwidth quota and memory.

The `accept="image/*"` on the HTML `<input>` is a UI hint only and **is trivially bypassed**.

### How to Fix
Add multer-level MIME type and size filtering **before** the file reaches Cloudinary:
```js
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB max
    fileFilter: (req, file, cb) => {
        const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (ALLOWED_MIMES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed.'), false);
        }
    }
});
```

---

## 🟡 Finding #7 — MEDIUM: Potential NoSQL Injection via Unvalidated Email Input

### Location
- `backend/mongoDAL.js` — Lines 36–45 (`getUserByEmail`)
- `backend/app.js` — Line 375 (`POST /login`)

### The Problem
```js
// mongoDAL.js
getUserByEmail: async function (email) {
    return await coll.findOne({ email });  // email is a raw string from req.body
}

// backend/app.js  
const user = await dal.getUserByEmail(email);  // email = req.body.email
```
If an attacker sends:
```json
{ "email": { "$gt": "" }, "password": "anything" }
```
…and Express has `express.json()` middleware active (it does, line 38), MongoDB will receive `{ email: { $gt: "" } }` as the query, which matches **every user in the collection** — effectively bypassing the email lookup and returning the first user.

### Context / Severity Note
The attack is partially mitigated because after finding a user, `bcrypt.compare()` is still called against the real hash. **However**, this is still a data enumeration risk and will throw unexpected errors that could leak application state.

### How to Fix
**Option A — Validate the type (recommended):**
```js
// In backend/app.js POST /login handler
const { email, password } = req.body;

// Reject if email is not a plain string
if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input format.' });
}
```

**Option B — Use express-mongo-sanitize middleware** (covers all routes automatically):
```bash
npm install express-mongo-sanitize
```
```js
// app.js (root) — add after body parsers
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());  // strips keys containing $ or .
```

---

## 🟢 Finding #8 — LOW: Swagger Docs Publicly Accessible (Information Disclosure)

### Location
- `backend/app.js` — Line 36: `app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));`
- Root `app.js` — Line 24: `app.use("/api", backendApp);`

### The Problem
The Swagger UI at `/api/docs` is **publicly accessible without authentication**. It documents every API endpoint, their request bodies, and expected responses. This is a roadmap for attackers.

### How to Fix
Gate the docs route behind `requireAuth` or an environment check:
```js
// Only serve docs in development
if (process.env.NODE_ENV !== 'production') {
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));
}
```

---

## Recommended Fix Priority

```
IMMEDIATELY (before any external deployment):
  1. Rotate all leaked credentials (MongoDB, Cloudinary, Session Secret)
  2. Create .gitignore — add .env
  3. Add requireAuth middleware to all admin/mutation routes

THIS WEEK:
  4. Add secure/httpOnly/sameSite to the session cookie
  5. Add typeof checks or express-mongo-sanitize

THIS MONTH:
  6. Add multer fileFilter + fileSize limits
  7. Gate Swagger docs behind NODE_ENV check
  8. Add ObjectId validation to route handlers
```
