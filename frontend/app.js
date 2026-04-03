const express = require("express");
const path = require("path");
const crypto = require("crypto");
const debugLogger = require("../logger");

const { upload } = require("../backend/utils/cloudinary");
const { dal } = require("../backend/mongoDAL");

const app = express();
const PORT = process.env.PORT || 3050;
const API_URL = `http://localhost:${PORT}/api/`;

const log = debugLogger("Frontend");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.locals.isAdmin = req.session?.isAdmin === true;
    next();
});

// ── Auth guard: redirect unauthenticated requests to home ──────────────────
function requireAuth(req, res, next) {
    if (req.session?.isAdmin === true) return next();
    return res.redirect("/");
}

app.get("/", (req, res) => {
    res.render("home");
});

app.get("/admin", requireAuth, async (req, res) => {
    try {
        const items = await dal.getItems();
        res.render("admin", { items });
    } catch (err) {
        console.error("Error fetching items:", err);
        res.status(500).send("Error loading items from the database.");
    }
});

app.get("/edit-item/:id", requireAuth, async (req, res) => {
    try {
        const item = await dal.getItemById(req.params.id);
        if (!item) return res.status(404).send("Artículo no encontrado.");
        const success = req.query.success === "1";
        res.render("edit-item", { item, success });
    } catch (err) {
        console.error("Error fetching item:", err);
        res.status(500).send("Error cargando el artículo.");
    }
});


app.get("/login", (req, res) => {
    if (req.session?.isAdmin) return res.redirect("/admin");
    res.render("login", { error: null });
});

app.post("/login", (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render("login", { error: "El usuario y contraseña son obligatorios." });
        }

        const adminUser = process.env.ADMIN_USER || "";
        const adminPass = process.env.ADMIN_PASS || "";

        const userBuf = Buffer.from(username);
        const adminUserBuf = Buffer.from(adminUser);
        const passBuf = Buffer.from(password);
        const adminPassBuf = Buffer.from(adminPass);

        const userMatch = adminUser.length > 0 &&
            userBuf.length === adminUserBuf.length &&
            crypto.timingSafeEqual(userBuf, adminUserBuf);

        const passMatch = adminPass.length > 0 &&
            passBuf.length === adminPassBuf.length &&
            crypto.timingSafeEqual(passBuf, adminPassBuf);

        if (!userMatch || !passMatch) {
            return res.render("login", { error: "Credenciales inválidas." });
        }

        // Regenerate session ID to prevent session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session error on login:", err);
                return res.render("login", { error: "Error de sesión. Inténtalo de nuevo." });
            }
            req.session.isAdmin = true;
            res.redirect("/admin");
        });
    } catch (err) {
        console.error("Error during login:", err);
        res.render("login", { error: "Error del servidor. Inténtalo de nuevo." });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Error al cerrar sesión:", err);
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

module.exports = app;
