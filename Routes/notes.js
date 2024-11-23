const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const tableName = "notesTable";
const getDatabaseInfo = require("../Utils/getDatbaseInfo");

// Helper function to ensure table exists
const ensureTable = (db) => {
  return new Promise((resolve, reject) => {
    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (message TEXT, email TEXT, listingId TEXT, receiver TEXT, timestamp DATE)`;
    db.run(createTableQuery, (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

//Post route that takes in message and ip address and saves it to the database
router.post("/:route", async (req, res) => {
  const receiver = "admin";
  //get timestamp from body and also add timestamp in the table
  const { message, email, listingId, timestamp } = req.body;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `INSERT INTO ${tableName} (message,email, listingId, receiver,timestamp) VALUES (?, ?, ?,?,?)`;
    await db.run(
      query,
      [message, email, listingId, receiver, timestamp],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        } else {
          return res.status(200).json({ message: "Note saved successfully" });
        }
      }
    );
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Changed from GET to POST for better security with email handling
router.post("/:route/getmessages", async (req, res) => {
  const { route } = req.params;
  const { email, listingId } = req.body; // Changed from req.query to req.body
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    console.log(email, listingId);
    const query = `SELECT message, email, listingId, timestamp FROM ${tableName} WHERE (email=? OR receiver = ?) AND listingId = ? ORDER BY timestamp DESC`;
    await db.all(query, [email, email, listingId], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(200).json(rows);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:route/all-notes", async (req, res) => {
  // CORS check
  const allowedOrigins = ["https://lowrise.ca", "http://localhost:4000"]; // Adjust these domains
  const origin = req.headers.origin;

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "GET");

  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `SELECT * FROM ${tableName} ORDER BY timestamp DESC`;
    await db.all(query, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(200).json(rows);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:route/admin-message", async (req, res) => {
  // CORS check
  const allowedOrigins = ["https://lowrise.ca", "http://localhost:4000"];
  const origin = req.headers.origin;

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "POST");

  const { message, receiver, listingId } = req.body;
  const email = "milan@homebaba.ca"; // Fixed email for all messages
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `INSERT INTO ${tableName} (message, email, listingId, receiver) VALUES (?, ?, ?, ?)`;
    db.run(query, [message, email, listingId, receiver], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res
        .status(200)
        .json({ message: "Admin message saved successfully" });
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:route/delete-messages", async (req, res) => {
  // CORS check
  const allowedOrigins = ["https://lowrise.ca", "http://localhost:4000"];
  const origin = req.headers.origin;

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "DELETE");

  const { email, listingId } = req.body; // Added listingId
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    let query, params;
    if (listingId) {
      // Delete messages for specific email and listingId
      query = `DELETE FROM ${tableName} WHERE (email = ? OR receiver = ?) AND listingId = ?`;
      params = [email, email, listingId];
    } else {
      // Delete all messages for email
      query = `DELETE FROM ${tableName} WHERE email = ? OR receiver = ?`;
      params = [email, email];
    }

    db.run(query, params, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(200).json({ message: "Messages deleted successfully" });
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
