# 🏥 Code Health Report — NodeShop

> **Reviewer role:** Lead Software Architect  
> **Date:** 2026-03-31  
> **Scope:** Full codebase — backend API, MongoDB DAL, Cloudinary utility, frontend routes, EJS views, and client-side JS.

---

## Executive Summary

The codebase is **clean, readable, and well-intentioned** for a small shop application. The naming is consistent, the separation of concerns is reasonable, and the UI logic is solid. However, there are **4 real production risks** and **several refactoring opportunities** that will cause pain as the app grows. Each issue is rated by severity below.

| Severity | Count |
|----------|-------|
| 🔴 Critical (can crash the server) | 3 |
| 🟠 High (silent data corruption / bad UX) | 3 |
| 🟡 Medium (tech debt, future pain) | 4 |
| 🟢 Low (quality-of-life improvements) | 3 |

---

## 1. Edge Case Handling

### 🔴 CRITICAL — `ObjectId` construction is unguarded and will crash on bad input

**Files:** `backend/mongoDAL.js` (lines 63, 75, 99)

```js
// Current — throws a BSONError if `id` is not a valid 24-char hex string:
return await coll.findOne({ _id: new ObjectId(id) });
```

If someone navigates to `/edit-item/not-a-valid-id` or sends a crafted `DELETE` request, `new ObjectId(id)` **throws synchronously** before the query even runs. The `try/catch` in the calling route *does* catch it, but only because the error bubbles up — right now it returns a generic 500. It will never return a clean 404. The risk escalates when you add auth middleware that relies on a valid DB lookup.

**Fix:** Validate the ID format before constructing `ObjectId`.

```js
const { ObjectId } = require('mongodb');

function toObjectId(id) {
    if (!ObjectId.isValid(id)) return null;
    return new ObjectId(id);
}

// Usage in DAL:
getItemById: async function (id) {
    const oid = toObjectId(id);
    if (!oid) return null; // caller treats null as 404
    // ...
}
```

---

### 🔴 CRITICAL — `/register` and `/login` have **no try/catch** — a DB error crashes the request

**File:** `backend/app.js` (lines 335–387)

```js
app.post("/register", async (req, res) => {
    // ... validation ...
    const result = await dal.createUser({ ... }); // ← NO try/catch around this
    // If MongoDB is down, this throws, Express catches it as an unhandled rejection
```

Both `/register` and `/login` directly `await` DAL calls with zero error handling. If MongoDB drops, the request hangs or Express 5's default error handler sends a generic 500 with no useful information. Compare this to `/items/:id` and `/delete`, which are properly wrapped.

**Fix:**

```js
app.post("/register", async (req, res) => {
    // ... validation ...
    try {
        const result = await dal.createUser({ ... });
        if (result.error) return res.status(409).json({ error: result.error });
        res.json({ code: 200, message: "Account created. Please log in." });
    } catch (err) {
        console.error("Error creating user:", err);
        res.status(500).json({ error: "Registration failed. Please try again." });
    }
});
```

---

### 🟠 HIGH — Cloudinary delete is called **before** the MongoDB delete — no rollback

**File:** `backend/app.js` (lines 225–259)

```js
// Step 1: Delete from Cloudinary ← happens FIRST
const result = await deleteImage(publicId);

// Step 2: Delete from MongoDB
await dal.deleteItem(id);
```

If Cloudinary succeeds but `dal.deleteItem()` fails (network hiccup, timeout), you now have an item in the DB that **points to a destroyed image**. The `onerror` fallback in the EJS will silently substitute the placeholder, hiding the corruption entirely.

**Fix:** Reverse the order. Delete from MongoDB first (source of truth), then clean up Cloudinary as a best-effort background step. A failed Cloudinary cleanup is a storage leak — survivable. A DB record pointing to a dead image is a UX bug.

```js
// Step 1: Delete from DB first (source of truth)
await dal.deleteItem(id);
log(`Item "${item.nombre}" (${id}) deleted from DB.`);

// Step 2: Clean up Cloudinary (best-effort — don't fail the request if this errors)
if (imagenUrl.includes("cloudinary.com")) {
    const match = imagenUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    if (match?.[1]) {
        deleteImage(match[1])   // ← intentionally NOT awaited
            .then(r => log(`Cloudinary delete for "${match[1]}": ${r?.result}`))
            .catch(e => console.error("Cloudinary cleanup failed (non-fatal):", e));
    }
}

res.json({ success: true });
```

---

### 🟠 HIGH — Cloudinary outage = silent failure for file uploads

**File:** `backend/utils/cloudinary.js`

`multer-storage-cloudinary` uploads the file to Cloudinary *during the middleware phase*, before your route handler even runs. If Cloudinary is unreachable, multer throws an error that propagates into your `try/catch` as a generic `MulterError` or network error. Your current handler returns a 500 with the raw error message, which is fine — but the user gets no actionable feedback.

**What to add:** A proper error message for the user side, and a multer error handling middleware:

```js
// In backend/app.js, after your routes but before the generic error handler:
app.use((err, req, res, next) => {
    if (err.name === 'MulterError' || err.message?.includes('cloudinary')) {
        return res.status(503).json({ 
            error: "Image upload service is temporarily unavailable. Please use a URL instead." 
        });
    }
    next(err);
});
```

---

### 🟡 MEDIUM — Category case-sensitivity is a latent data bug

**Files:** `root.js` (line 660–675), `admin.ejs` (line 61), `edit-item.ejs` (line 95–96)

The `root.js` static data uses `"tenis"` (lowercase) for items 120–122. The `admin.ejs` filter uses `"Tenis"` (capital T). The home page filter button targets `"Tenis"`. Items with `categoria: "tenis"` will **never match** the filter button and will disappear from the catalog when the Tenis filter is active.

The `edit-item.ejs` includes both `'Tenis'` and `'tenis'` in the options list, acknowledging the inconsistency — but that's a workaround for a bug, not a fix.

**Fix:** Normalize all category values to lowercase on write (`categoria.toLowerCase()`) at the DAL layer, and update the static `productos` array and all filter buttons to use lowercase `"tenis"` consistently.

---

## 2. Code Duplication

### 🟠 HIGH — `activateUrl` / `activateFile` logic is copy-pasted verbatim across 2 files

**Files:** `frontend/public/js/admin.js`, `frontend/public/js/edit-item.js`

Both files implement identical exclusive-image-toggle logic:

```js
// admin.js lines 102–121
function activateUrl() {
    optUrl.classList.add('is-active');
    optUrl.classList.remove('is-disabled');
    optFile.classList.add('is-disabled');
    optFile.classList.remove('is-active');
    fileInput.value = '';
    // ...
}

// edit-item.js lines 34–57 — IDENTICAL pattern, different variable names
function activateUrl() {
    optUrl.classList.add('is-active');
    optUrl.classList.remove('is-disabled');
    // ...
}
```

The FileReader preview block (`reader.onload = e => { previewImg.src = e.target.result; }`) and the drag-and-drop handler are also cloned.

This is a textbook "Shotgun Surgery" smell: if you add a third option (e.g. a camera feed), you have to touch 2+ files. If you fix a bug in the toggle logic, you must remember to fix it in both.

**Refactor:** Extract a shared utility module.

**New file: `frontend/public/js/image-picker.js`**

```js
/**
 * Initializes the dual URL/file image picker.
 * @param {object} opts - Element references and callbacks
 */
function initImagePicker({ optUrl, optFile, urlInput, fileInput, dropZone, dropText, previewImg, placeholderSrc }) {

    function activateUrl() {
        optUrl.classList.add('is-active');
        optUrl.classList.remove('is-disabled');
        optFile.classList.add('is-disabled');
        optFile.classList.remove('is-active');
        fileInput.value = '';
        if (dropText) dropText.textContent = 'Arrastra o haz clic';
    }

    function activateFile() {
        optFile.classList.add('is-active');
        optFile.classList.remove('is-disabled');
        optUrl.classList.add('is-disabled');
        optUrl.classList.remove('is-active');
        urlInput.value = '';
    }

    function resetBoth() {
        [optUrl, optFile].forEach(el => el.classList.remove('is-active', 'is-disabled'));
    }

    function previewFile(file) {
        const reader = new FileReader();
        reader.onload = e => { previewImg.src = e.target.result; };
        reader.readAsDataURL(file);
    }

    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (val) { activateUrl(); previewImg.src = val; }
        else { resetBoth(); previewImg.src = placeholderSrc; }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files?.[0]) {
            activateFile();
            if (dropText) dropText.textContent = `📎 ${fileInput.files[0].name}`;
            previewFile(fileInput.files[0]);
        } else {
            resetBoth();
        }
    });

    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                if (dropText) dropText.textContent = `📎 ${file.name}`;
                activateFile();
                previewFile(file);
            }
        });
    }
}
```

Then `admin.js` and `edit-item.js` both become thin callers of `initImagePicker(...)`.

---

### 🟡 MEDIUM — Gender/category badge mapping is repeated in 3 places

**Files:** `frontend/public/js/root.js` (lines 727–748, 800–816), `frontend/views/admin.ejs` (lines 139–163)

The `genero → emoji/label` mapping appears as if-else chains in:
1. `root.js → actualizarIndicador()` 
2. `root.js → mostrarProductos()`
3. `admin.ejs` EJS block

If you add a new gender category (e.g., `"otro"`), you must update 3 separate places.

**Refactor (JS side):** Extract maps at the top of `root.js`:

```js
const GENERO_MAP = {
    masculino: { label: '👨 Hombre', clase: 'masculino' },
    femenino:  { label: '👩 Mujer',  clase: 'femenino'  },
    unisex:    { label: '♾️ Unisex', clase: 'unisex'    },
    nino:      { label: '🧒 Niño',   clase: 'nino'      },
    nina:      { label: '👧 Niña',   clase: 'nina'      },
};
const CAT_MAP = {
    ropa:        '👕', Tenis: '👟', tenis: '👟',
    accesorios:  '🕶️', hogar: '🏠',
};
```

Then all three repeat-sites become single lookups: `GENERO_MAP[producto.genero]?.label ?? '♾️ Unisex'`.

**Refactor (EJS side):** Move the mapping into an EJS partial or a server-side helper passed to the template as a local variable.

---

### 🟡 MEDIUM — Image resolution priority logic copy-pasted across two API routes

**File:** `backend/app.js` (lines 134–143 and 185–193)

The "file > URL > fallback" logic appears in both `POST /items` and `POST /items/:id`:

```js
// Duplicated in both routes:
let imagen;
if (req.file) {
    imagen = req.file.path;
} else if (imagenUrl && imagenUrl.trim() !== "") {
    imagen = imagenUrl.trim();
} else {
    // (one returns 400, the other uses placeholder)
}
```

**Refactor:** Extract a helper:

```js
// backend/utils/resolveImage.js
function resolveImage(file, urlInput, fallback = null) {
    if (file) return file.path;
    if (urlInput?.trim()) return urlInput.trim();
    return fallback;
}
module.exports = { resolveImage };

// In routes:
const imagen = resolveImage(req.file, imagenUrl, "/images/placeholder.svg");
if (!imagen) return res.status(400).send("Debes proporcionar una imagen.");
```

---

## 3. Scalability

### 🔴 CRITICAL — `getItems()` loads the **entire collection** into memory on every page load

**File:** `backend/mongoDAL.js` (line 52)

```js
return await coll.find({}).toArray();
```

At 50–100 items, this is fine. At 1,000+ items, this:
- Allocates a large array in Node heap on every visit to `/admin`
- Sends all documents (including full descriptions, image URLs) to EJS just to render a grid
- Has no index to fall back on — it's a guaranteed full collection scan every time

**Fix — Add pagination:**

```js
getItems: async function ({ page = 1, limit = 50 } = {}) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const coll = client.db("ItemsForSale").collection("Items");
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            coll.find({}).skip(skip).limit(limit).toArray(),
            coll.countDocuments()
        ]);
        return { items, total, page, totalPages: Math.ceil(total / limit) };
    } finally {
        await client.close();
    }
},
```

Also add a MongoDB index:

```js
// Run once in a DB setup script:
db.collection("Items").createIndex({ categoria: 1, genero: 1 });
```

---

### 🟡 MEDIUM — A new MongoClient connection is opened and closed on **every single request**

**File:** `backend/mongoDAL.js` (every function)

```js
getItems: async function () {
    const client = new MongoClient(uri);  // ← new TCP connection each time
    try {
        await client.connect();           // ← handshake + auth on every call
        // ...
    } finally {
        await client.close();             // ← teardown
    }
},
```

Each call to the DAL creates a full TCP connection, performs auth, runs the query, and tears down. At low traffic this is invisible. Under any load, this becomes a bottleneck — MongoDB connection pools exist for exactly this reason.

**Fix:** Use a shared client singleton:

```js
// backend/mongoDAL.js — top of file
const client = new MongoClient(uri);
let connected = false;

async function getClient() {
    if (!connected) {
        await client.connect();
        connected = true;
    }
    return client;
}

// Each DAL function becomes:
getItems: async function () {
    const c = await getClient();
    const coll = c.db("ItemsForSale").collection("Items");
    return coll.find({}).toArray();
},
```

This keeps one persistent connection pool alive (MongoDB driver manages pooling internally).

---

### 🟡 MEDIUM — `root.js` uses `innerHTML +=` in a loop — O(n²) DOM re-serialization

**File:** `frontend/public/js/root.js` (line 820)

```js
productosFiltrados.forEach(producto => {
    catalogoDiv.innerHTML += `<div class="producto">...</div>`;
    //                    ^^^ re-serializes the entire DOM on every iteration
});
```

At 100 products this already causes visible jank. At 1,000 products it will freeze the tab for several seconds.

**Fix:** Build a fragment or collect HTML strings, then set `innerHTML` once:

```js
function mostrarProductos() {
    const productosFiltrados = obtenerProductosFiltrados();
    if (productosFiltrados.length === 0) {
        catalogoDiv.innerHTML = `<div class="no-results">...</div>`;
        return;
    }

    const html = productosFiltrados.map(producto => {
        // ... build string per item ...
        return `<div class="producto">...</div>`;
    }).join('');

    catalogoDiv.innerHTML = html; // ← single DOM write
    
    // re-attach event listeners
    catalogoDiv.querySelectorAll('.producto img').forEach(img => {
        handleImageLoading(img);
        img.addEventListener('click', e => { e.stopPropagation(); abrirLightbox(img.src); });
    });
}
```

---

## 4. Error Boundaries

### Summary table

| Route / File | Has `try/catch`? | Notes |
|---|---|---|
| `POST /upload` | ✅ | Fine |
| `POST /items/:id` | ✅ | Fine |
| `POST /items` | ✅ | Fine |
| `DELETE /items/:id` | ✅ | Fine — but operation order is wrong (see §1) |
| `POST /register` | ❌ **MISSING** | DB error = unhandled rejection crash |
| `POST /login` | ❌ **MISSING** | DB error = unhandled rejection crash |
| `GET /admin` (frontend) | ✅ | Fine |
| `GET /edit-item/:id` (frontend) | ✅ | Fine — but no ObjectId validation before DAL call |
| `cloudinary.deleteImage()` | ✅ partial | Guarded, but return value not validated |
| `DAL.updateItem()` | ✅ (from route) | `matchedCount` is never checked — silent 0-match update |

---

### 🟠 HIGH — `updateItem()` returns silently regardless of whether any document was matched

**File:** `backend/app.js` (line 146), `backend/mongoDAL.js` (line 74)

```js
const result = await dal.updateItem(id, fields);
// result.matchedCount is never checked
res.redirect(`/edit-item/${id}?success=1`);
```

If the item was deleted between the user loading the edit page and clicking Save, the update silently returns `{ matchedCount: 0, modifiedCount: 0 }` and the user is redirected to a success page for an item that no longer exists.

**Fix:**

```js
const result = await dal.updateItem(id, fields);
if (result.matchedCount === 0) {
    return res.status(404).send("Artículo no encontrado.");
}
res.redirect(`/edit-item/${id}?success=1`);
```

---

### 🟢 LOW — Global error handler is missing

**File:** `app.js` (root)

Express 5 will catch unhandled async errors, but there is no centralized error handler to log them or return a structured response. Add one at the very end of `backend/app.js`:

```js
// Must be defined AFTER all routes, with 4 parameters (err, req, res, next)
app.use((err, req, res, next) => {
    console.error("[Global Error Handler]", err);
    res.status(500).json({ error: "An unexpected error occurred." });
});
```

---

### 🟢 LOW — Session secret has no fallback validation at startup

**File:** `app.js` (root, line 10)

If `process.env.SESSION_SECRET` is undefined (e.g., deploying without `.env`), `express-session` will use `undefined` as the secret, which it accepts without complaint — but sessions will be cryptographically insecure and will break between restarts.

**Fix:** Add a startup guard:

```js
if (!process.env.SESSION_SECRET || !process.env.CONNECTION_STRING) {
    console.error("FATAL: Required environment variables are missing. Check your .env file.");
    process.exit(1);
}
```

---

### 🟢 LOW — `/admin` route has no authentication guard

**File:** `frontend/app.js` (line 32)

The admin panel — which renders all items with Delete and Update controls — is accessible to anyone who knows the URL `/admin`. There is no session check.

**Fix:** Add an auth middleware:

```js
function requireAuth(req, res, next) {
    if (req.session?.userId) return next();
    res.redirect('/');
}

app.get("/admin", requireAuth, async (req, res) => { ... });
app.get("/edit-item/:id", requireAuth, async (req, res) => { ... });
```

The API routes (`DELETE /api/items/:id`, `POST /api/items`) also need the same protection.

---

## Recommended Action Order

| Priority | Action | Effort |
|---|---|---|
| 1 | Add `try/catch` to `/register` and `/login` | 15 min |
| 2 | Add ObjectId validation helper to DAL | 20 min |
| 3 | Reverse Cloudinary/DB delete order | 10 min |
| 4 | Add auth guard to `/admin` and API mutation routes | 30 min |
| 5 | Check `matchedCount` after `updateItem` | 10 min |
| 6 | Add a global error handler middleware | 15 min |
| 7 | Extract `initImagePicker` shared utility | 45 min |
| 8 | Fix MongoDB singleton connection | 30 min |
| 9 | Add pagination to `getItems` | 1–2 hrs |
| 10 | Fix `innerHTML +=` loop in `root.js` | 30 min |
| 11 | Normalize category case-sensitivity | 20 min |
| 12 | Extract `resolveImage` helper | 15 min |
| 13 | Add env variable startup guard | 5 min |
