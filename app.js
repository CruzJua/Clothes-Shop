const express = require("express");
const app = express();
require("dotenv").config({ path: ".env" });

const session = require("express-session");
const { MongoStore } = require("connect-mongo");

app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
        mongoUrl: process.env.CONNECTION_STRING,
        dbName: "TheShop",
        collectionName: "Sessions"
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,   // 24 hours
        httpOnly: true,                  // JS cannot read the cookie
        sameSite: 'strict',              // blocks cross-site request forgery
        secure: process.env.NODE_ENV === 'production'  // HTTPS-only in prod
    }
}));

const frontendApp = require("./frontend/app");
const backendApp = require("./backend/app");

app.use("/api", backendApp);
app.use("", frontendApp);

const PORT = process.env.PORT || 3050;
app.listen(PORT, () => {
    console.log(`InventoryTrackerPlus running on port ${PORT}`);
    console.log(`API & Docs: http://localhost:${PORT}/api/docs`);
    console.log(`Frontend: http://localhost:${PORT}/`);
});
