const debugLogger = require('../logger');
const log = debugLogger("DAL");

const { MongoClient, ObjectId } = require('mongodb');

const ITEMS_DB   = "ItemsForSale";
const ITEMS_COLL = "Items";

// ── Connection pool singleton ────────────────────────────────────────────────
// MongoClient is created once and reused for the lifetime of the process.
// The driver manages an internal connection pool automatically.
let _client = null;

async function getClient() {
    if (!_client) {
        _client = new MongoClient(process.env.CONNECTION_STRING, {
            maxPoolSize: 10,     // max simultaneous connections
            minPoolSize: 2,      // keep-alive floor
            serverSelectionTimeoutMS: 5000,
        });
        await _client.connect();
        log("MongoDB connection pool initialised.");
    }
    return _client;
}

/**
 * Returns true if `id` is a valid 24-character hex ObjectId string.
 * Call this before any DAL method that constructs `new ObjectId(id)`
 * to prevent BSON errors from propagating to the HTTP layer.
 */
function isValidObjectId(id) {
    return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Normalise a category string to lowercase for consistent DB storage. */
function normaliseCategory(cat) {
    return typeof cat === 'string' ? cat.trim().toLowerCase() : cat;
}

// ── DAL ───────────────────────────────────────────────────────────────────────
const dal = {

    // ── Items ──────────────────────────────────────────────────────

    getItems: async function () {
        const client = await getClient();
        return client.db(ITEMS_DB).collection(ITEMS_COLL).find({}).toArray();
    },

    getItemById: async function (id) {
        const client = await getClient();
        return client.db(ITEMS_DB).collection(ITEMS_COLL).findOne({ _id: new ObjectId(id) });
    },

    updateItem: async function (id, fields) {
        const client = await getClient();
        const normalised = { ...fields, categoria: normaliseCategory(fields.categoria) };
        return client.db(ITEMS_DB).collection(ITEMS_COLL).updateOne(
            { _id: new ObjectId(id) },
            { $set: normalised }
        );
    },

    createItem: async function (fields) {
        const client = await getClient();
        const normalised = { ...fields, categoria: normaliseCategory(fields.categoria), createdAt: new Date() };
        return client.db(ITEMS_DB).collection(ITEMS_COLL).insertOne(normalised);
    },

    deleteItem: async function (id) {
        const client = await getClient();
        return client.db(ITEMS_DB).collection(ITEMS_COLL).deleteOne({ _id: new ObjectId(id) });
    },
};

exports.dal = dal;
exports.isValidObjectId = isValidObjectId;
