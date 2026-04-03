const express = require("express");
const app = express();
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");


const { upload, deleteImage } = require("./utils/cloudinary");
const { dal, isValidObjectId } = require("./mongoDAL");
const debugLogger = require("../logger");

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Small Shop API",
      version: "1.0.0",
      summary: "API layer for a small little shop",
    },
  },
  servers: [
    {
      url: "/api",
      description: "API layer for a small little shop",
    },
  ],
  apis: [path.join(__dirname, "app.js")],
};

const specs = swaggerJsdoc(options);

const log = debugLogger("Backend");

app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Global Cache Versioning ──────────────────────────────────────────────
let globalDataVersion = Date.now();
function bumpVersion() {
    globalDataVersion = Date.now();
}

// ── Auth guard ─────────────────────────────────────────────────────────────
// Checks for the isAdmin session flag set on successful login.
function requireAuth(req, res, next) {
    if (req.session?.isAdmin === true) return next();
    return res.status(401).json({ error: "Unauthorized. Please log in." });
}

app.get("/api", (req, res) => {
  res.redirect("/docs");
});

/**
 * @openapi
 * /version:
 *   get:
 *     summary: Returns the current cache version of the database items
 *     responses:
 *       200:
 *         description: Success
 */
app.get("/version", (req, res) => {
    res.json({ version: globalDataVersion });
});

/**
 * @openapi
 * /items:
 *   get:
 *     summary: Returns all items from the catalog
 *     responses:
 *       200:
 *         description: Success
 */
app.get("/items", async (req, res) => {
    try {
        const items = await dal.getItems();
        res.json(items);
    } catch (err) {
        console.error("Error fetching items:", err);
        res.status(500).json({ error: "Failed to fetch items" });
    }
});

/**
 * @openapi
 * /api/upload:
 *   post:
 *     summary: Upload an image to a company subfolder
 *     description: Uploads an image to Cloudinary. Use 'companyName' to organize into subfolders.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 description: The name of the company (used for subfolder naming)
 *                 example: "AcmeCorp"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: The image file to upload
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                 publicId:
 *                   type: string
 */
app.post("/upload", requireAuth, upload.single("image"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        log("File uploaded successfully!");
        res.json({
            message: "Upload successful!",
            imageUrl: req.file.path,
            publicId: req.file.filename,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @openapi
 * /items/{id}:
 *   post:
 *     summary: Update an existing item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:     { type: string }
 *               descripcion:{ type: string }
 *               categoria:  { type: string }
 *               genero:     { type: string }
 *               imagenUrl:  { type: string }
 *               imagenFile: { type: string, format: binary }
 *     responses:
 *       302:
 *         description: Redirects to /edit-item/:id on success
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
app.post("/items/:id", requireAuth, upload.single("imagenFile"), async (req, res) => {
    try {
        const { id } = req.params;

        // ID Validation — prevents BSON errors from crashing the server
        if (!isValidObjectId(id))
            return res.status(400).send("ID de artículo inválido.");

        const { nombre, descripcion, categoria, genero, imagenUrl } = req.body;

        let imagen;
        if (req.file) {
            imagen = req.file.path;
            log(`Image uploaded to Cloudinary: ${imagen}`);
        } else if (imagenUrl && imagenUrl.trim() !== "") {
            imagen = imagenUrl.trim();
        } else {
            return res.status(400).send("Debes proporcionar una imagen (URL o archivo).");
        }

        const fields = { nombre, descripcion, categoria, genero, imagen };
        const result = await dal.updateItem(id, fields);

        // matchedCount === 0 means no document with that _id exists
        if (result.matchedCount === 0)
            return res.status(404).send("Artículo no encontrado.");

        bumpVersion();
        log(`Item ${id} updated successfully.`);
        res.redirect(`/edit-item/${id}?success=1`);
    } catch (err) {
        console.error("Error updating item:", err);
        res.status(500).send("Error al actualizar el artículo.");
    }
});

/**
 * @openapi
 * /items:
 *   post:
 *     summary: Create a new item in the catalog
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:     { type: string }
 *               descripcion:{ type: string }
 *               categoria:  { type: string }
 *               genero:     { type: string }
 *               imagenUrl:  { type: string }
 *               imagenFile: { type: string, format: binary }
 *     responses:
 *       302:
 *         description: Redirects to /admin on success
 *       500:
 *         description: Server error
 */
app.post("/items", requireAuth, upload.single("imagenFile"), async (req, res) => {
    try {
        const { nombre, descripcion, categoria, genero, imagenUrl } = req.body;

        let imagen;
        if (req.file) {
            imagen = req.file.path;   // Cloudinary secure URL
            log(`New item image uploaded to Cloudinary: ${imagen}`);
        } else if (imagenUrl && imagenUrl.trim() !== "") {
            imagen = imagenUrl.trim();
        } else {
            imagen = "/images/placeholder.svg";
        }

        const fields = { nombre, descripcion, categoria, genero, imagen };
        await dal.createItem(fields);

        bumpVersion();
        log(`New item "${nombre}" created.`);
        res.redirect("/admin");
    } catch (err) {
        console.error("Error creating item:", err);
        res.status(500).send("Error al crear el artículo.");
    }
});

/**
 * @openapi
 * /items/{id}:
 *   delete:
 *     summary: Delete an item from the catalog and remove its image from Cloudinary
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
app.delete("/items/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // ID Validation — prevents BSON errors from crashing the server
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "ID de artículo inválido." });

        // 1. Fetch the item so we have its imagen URL before deleting
        const item = await dal.getItemById(id);
        if (!item)
            return res.status(404).json({ error: "Item not found." });

        // 2. Delete from MongoDB FIRST — data integrity takes priority
        await dal.deleteItem(id);
        bumpVersion();
        log(`Item "${item.nombre}" (${id}) deleted from DB.`);

        // 3. Attempt Cloudinary cleanup — non-fatal if it fails
        const imagenUrl = item.imagen || "";
        if (imagenUrl.includes("cloudinary.com")) {
            // Extract public_id:
            // https://res.cloudinary.com/<cloud>/image/upload/v123456/shop_items/1.jpg
            //   → "shop_items/1"
            const match = imagenUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
            if (match && match[1]) {
                try {
                    const result = await deleteImage(match[1]);
                    log(`Cloudinary delete for "${match[1]}": ${result?.result}`);
                } catch (cloudErr) {
                    // Log but don't fail the request — the DB record is already gone
                    console.error("Cloudinary cleanup failed (non-fatal):", cloudErr.message);
                }
            }
        } else {
            log(`Skipping Cloudinary deletion — not a Cloudinary URL: ${imagenUrl}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting item:", err);
        res.status(500).json({ error: "Error al eliminar el artículo." });
    }
});


// vvvvvv Will possible add later vvvvvvv




// /**
//  * @openapi
//  * /contact:
//  *   post:
//  *     summary: Send a contact form message via email
//  *     responses:
//  *       200:
//  *         description: Email sent successfully
//  *       400:
//  *         description: Missing required fields
//  *       500:
//  *         description: Failed to send email
//  */
// app.post("/contact", async (req, res) => {
//   const { name, email, subject, message } = req.body;

//   if (!name || !email || !message) {
//     return res.status(400).json({ code: 400, error: "Name, email, and message are required." });
//   }

//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: process.env.GMAIL_USER,
//       pass: process.env.GMAIL_APP_PASSWORD,
//     },
//   });

//   const mailOptions = {
//     from: `"InventoryTracker+ Contact" <${process.env.GMAIL_USER}>`,
//     to: process.env.GMAIL_USER,
//     replyTo: `"${name}" <${email}>`,
//     subject: subject ? `[Contact Form] ${subject}` : `[Contact Form] Message from ${name}`,
//     html: `
//       <h2>New Contact Form Submission</h2>
//       <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
//       <hr />
//       <p>${message.replace(/\n/g, "<br/>")}</p>
//       <hr />
//       <p style="color:#888;font-size:12px;">Sent via InventoryTracker+ contact form</p>
//     `,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     log("(API) Contact form email sent successfully");
//     res.json({ code: 200, message: "Email sent successfully." });
//   } catch (err) {
//     console.error("Error sending contact email:", err);
//     res.status(500).json({ code: 500, error: "Failed to send email. Please try again later." });
//   }
// });


module.exports = app;
