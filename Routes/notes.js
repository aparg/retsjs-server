const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const tableName = "notesTable";
const getDatabaseInfo = require("../Utils/getDatbaseInfo");

// Helper function to ensure table exists
const ensureTable = (db) => {
  return new Promise((resolve, reject) => {
    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      message TEXT, 
      email TEXT, 
      listingId TEXT, 
      receiver TEXT, 
      timestamp DATE,
      replyTo TEXT,
      FOREIGN KEY (replyTo) REFERENCES ${tableName}(id)
    )`;
    db.run(createTableQuery, (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

const createThread = (rows) => {
  // Organize messages into threads
  const threads = rows.reduce((acc, row) => {
    if (!row.replyTo) {
      // This is a parent message
      if (!acc[row.id]) {
        acc[row.id] = {
          id: row.id,
          message: row.message,
          email: row.email,
          timestamp: row.timestamp,
          listingId: row.listingId || null,
          replies: [],
        };
      }
      // Add reply if it exists
      if (row.reply_id) {
        acc[row.id].replies.push({
          id: row.reply_id,
          message: row.reply_message,
          email: row.reply_email,
          timestamp: row.reply_timestamp,
        });
      }
    }
    return acc;
  }, {});

  return Object.values(threads);
};

//Post route that takes in message and ip address and saves it to the database
router.post("/:route", async (req, res) => {
  const receiver = "admin";
  //get timestamp from body and also add timestamp in the table
  const { message, email, listingId, timestamp, replyTo } = req.body;
  const messageId = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`; // Generate unique ID
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `INSERT INTO ${tableName} (id, message, email, listingId, receiver, timestamp, replyTo) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await db.run(
      query,
      [
        messageId,
        message,
        email,
        listingId,
        receiver,
        timestamp,
        replyTo || null,
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        } else {
          return res.status(200).json({
            message: "Note saved successfully",
            messageId: messageId,
          });
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
    const query = `
      SELECT m1.*, m2.message as reply_message, m2.timestamp as reply_timestamp, 
             m2.email as reply_email, m2.id as reply_id
      FROM ${tableName} m1
      LEFT JOIN ${tableName} m2 ON m1.id = m2.replyTo
      WHERE (m1.email=? OR m1.receiver = ?)
      ${listingId ? "AND m1.listingId = ?" : ""}
      ORDER BY m1.timestamp ASC, m2.timestamp ASC`;

    const params = listingId ? [email, email, listingId] : [email, email];

    await db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const threads = createThread(rows);
      return res.status(200).json(threads);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:route/all-notes", async (req, res) => {
  // CORS check
  // const allowedOrigins = ["https://lowrise.ca", "http://localhost:4000"]; // Adjust these domains
  // const origin = req.headers.origin;

  // if (!allowedOrigins.includes(origin)) {
  //   return res.status(403).json({ error: "Origin not allowed" });
  // }

  // res.header("Access-Control-Allow-Origin", origin);
  // res.header("Access-Control-Allow-Methods", "GET");

  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `SELECT m1.*, m2.message as reply_message, m2.timestamp as reply_timestamp, 
            m2.email as reply_email, m2.id as reply_id FROM ${tableName} m1
            LEFT JOIN ${tableName} m2 ON m1.id = m2.replyTo
            ORDER BY m1.timestamp ASC, m2.timestamp ASC`;
    await db.all(query, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const threads = createThread(rows);
      return res.status(200).json(threads);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:route/admin-message", async (req, res) => {
  // CORS check
  // const allowedOrigins = ["https://lowrise.ca", "http://localhost:4000"];
  // const origin = req.headers.origin;

  // if (!allowedOrigins.includes(origin)) {
  //   return res.status(403).json({ error: "Origin not allowed" });
  // }

  // res.header("Access-Control-Allow-Origin", origin);
  // res.header("Access-Control-Allow-Methods", "POST");

  const { message, receiver, listingId, timestamp, replyTo } = req.body;
  const email = "milan@homebaba.ca";
  const messageId = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`; // Generate unique ID
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTable(db);
    const query = `INSERT INTO ${tableName} (id, message, email, listingId, receiver, timestamp, replyTo) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      query,
      [
        messageId,
        message,
        email,
        listingId,
        receiver,
        timestamp,
        replyTo || null,
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          message: "Admin message saved successfully",
          messageId: messageId,
        });
      }
    );
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
