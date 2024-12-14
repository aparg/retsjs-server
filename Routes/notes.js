const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const messagesTableName = "messages";
const usersTableName = "users";
const getDatabaseInfo = require("../Utils/getDatbaseInfo");

// Modified helper function to ensure both tables exist
const ensureTables = (db) => {
  return new Promise((resolve, reject) => {
    // Create users table first
    const createUsersTableQuery = `CREATE TABLE IF NOT EXISTS ${usersTableName} (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      created_at DATE DEFAULT CURRENT_TIMESTAMP,
      last_activity DATE,
      admin_unread_count INTEGER DEFAULT 0,
      user_unread_count INTEGER DEFAULT 0
    )`;

    // Create messages table with foreign key to users
    const createMessagesTableQuery = `CREATE TABLE IF NOT EXISTS ${messagesTableName} (
      id TEXT PRIMARY KEY,
      message TEXT,
      sender_id TEXT,
      receiver_id TEXT,
      listingId TEXT,
      timestamp DATE,
      replyTo TEXT,
      filters TEXT,
      FOREIGN KEY (sender_id) REFERENCES ${usersTableName}(id),
      FOREIGN KEY (receiver_id) REFERENCES ${usersTableName}(id),
      FOREIGN KEY (replyTo) REFERENCES ${messagesTableName}(id)
    )`;

    // Create tables in sequence
    db.run(createUsersTableQuery, (err) => {
      if (err) return reject(err);

      db.run(createMessagesTableQuery, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

// Helper function to ensure user exists
const ensureUser = (db, email, username = null, phone = null) => {
  return new Promise((resolve, reject) => {
    // First try to find the user
    db.get(
      `SELECT id FROM ${usersTableName} WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) return reject(err);

        if (row) {
          // User exists, return their id
          resolve(row.id);
        } else {
          // Create new user
          const userId = `user_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 11)}`;
          db.run(
            `INSERT INTO ${usersTableName} (id, username, email, phone) VALUES (?, ?, ?, ?)`,
            [userId, username || email?.split("@")[0] || "", email, phone],
            (err) => {
              if (err) return reject(err);
              resolve(userId);
            }
          );
        }
      }
    );
  });
};

// Add this function before the routes
const createThread = (rows) => {
  const threads = {};

  rows.forEach((row) => {
    const parentId = row.replyTo || row.id;

    // If this is a parent message or we haven't seen it yet
    if (!threads[parentId]) {
      threads[parentId] = {
        id: parentId,
        message: row.replyTo ? null : row.message,
        sender_email: row.sender_email,
        receiver_email: row.replyTo ? null : row.receiver_email,
        listingId: row.replyTo ? null : row.listingId,
        timestamp: row.replyTo ? null : row.timestamp,
        filters: row.replyTo ? null : row.filters,
        replies: [],
      };
    }

    // If this is a reply, add it to the parent's replies array
    if (row.replyTo) {
      threads[parentId].replies.push({
        id: row.id,
        message: row.message,
        sender_email: row.sender_email,
        receiver_email: row.receiver_email,
        timestamp: row.timestamp,
      });
    }
  });

  // Remove any threads that only contain null values (orphaned replies)
  const validThreads = Object.values(threads).filter(
    (thread) => thread.message !== null
  );

  // Sort by timestamp, newest first
  return validThreads.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
};

// send message route
router.post("/:route", async (req, res) => {
  const {
    message,
    sender_email,
    receiver_email,
    listingId,
    timestamp,
    replyTo,
    filters,
  } = req.body;
  const messageId = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTables(db);
    const receiverId = await ensureUser(db, receiver_email);
    // Ensure sender exists and get their ID
    const senderId = await ensureUser(db, sender_email);

    // Ensure admin user exists
    const adminId = await ensureUser(db, "milan@homebaba.ca", "Admin");
    // Update last_activity for the sender and increase unread count
    if (sender_email !== "milan@homebaba.ca") {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE ${usersTableName} SET last_activity = CURRENT_TIMESTAMP, admin_unread_count = admin_unread_count + 1 WHERE id = ?`,
          [senderId],
          (err) => {
            console.log(err);
            if (err) reject(err);
            resolve();
          }
        );
      });
    } else {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE ${usersTableName} SET user_unread_count = user_unread_count + 1 WHERE id = ?`,
          [receiverId],
          (err, rows) => {
            console.log(err);
            if (err) reject(err);
            resolve();
          }
        );
      });
    }

    const query = `INSERT INTO ${messagesTableName} 
      (id, message, sender_id, receiver_id, listingId, timestamp, replyTo, filters) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    await db.run(
      query,
      [
        messageId,
        message,
        senderId,
        receiverId || adminId, // admin is always the receiver in this case
        listingId,
        timestamp,
        replyTo || null,
        filters ? JSON.stringify(filters) : null,
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          message: "Note saved successfully",
          messageId: messageId,
        });
      }
    );
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// route to get messages
router.post("/:route/getmessages", async (req, res) => {
  const { route } = req.params;
  const { email, listingId, isAdminDashboard = false, yeta } = req.body;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    //reset unread count
    if (isAdminDashboard) {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE ${usersTableName} SET admin_unread_count = 0 WHERE email = ?`,
          [email],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
    } else {
      await new Promise((resolve, reject) => {
        console.log(`setting 0 for ${email}`);
        db.run(
          `UPDATE ${usersTableName} SET user_unread_count = 0 WHERE email = ?`,
          [email],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });
    }

    await ensureTables(db);

    // Get user ID first
    const userId = await ensureUser(db, email);

    const query = `
      SELECT 
        m.id, m.message, m.listingId, m.timestamp,m.replyTo, m.filters,
        sender.email as sender_email,
        receiver.email as receiver_email
      FROM ${messagesTableName} m
      JOIN ${usersTableName} sender ON m.sender_id = sender.id
      JOIN ${usersTableName} receiver ON m.receiver_id = receiver.id
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
      ${listingId ? "AND m.listingId = ?" : ""}
      ORDER BY m.timestamp ASC`;

    const params = listingId ? [userId, userId, listingId] : [userId, userId];
    db.all(query, params, (err, rows) => {
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

router.post("/:route/user-unread-count", async (req, res) => {
  const { route } = req.params;
  const { receiverEmail } = req.body;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);
  ensureTables(db);
  const userId = await ensureUser(db, receiverEmail);
  `SELECT user_unread_count FROM ${usersTableName} WHERE email=${receiverEmail}`;
  const query = `SELECT user_unread_count FROM ${usersTableName} WHERE email=?`;
  try {
    await db.all(query, [receiverEmail], (err, rows) => {
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
    await ensureTables(db);
    const query = `SELECT m1.*, m2.message as reply_message, m2.timestamp as reply_timestamp, 
            m2.email as reply_email, m2.id as reply_id FROM ${messagesTableName} m1
            LEFT JOIN ${messagesTableName} m2 ON m1.id = m2.replyTo
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
  const { message, receiver_email, listingId, timestamp, replyTo } = req.body;
  const adminEmail = "milan@homebaba.ca";
  const messageId = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTables(db);

    // Ensure both admin and receiver exist and get their IDs
    const senderId = await ensureUser(db, adminEmail, "Admin");
    const receiverId = await ensureUser(db, receiver_email);

    const query = `INSERT INTO ${messagesTableName} 
      (id, message, sender_id, receiver_id, listingId, timestamp, replyTo) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(
      query,
      [
        messageId,
        message,
        senderId,
        receiverId,
        listingId,
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
    await ensureTables(db);
    let query, params;
    if (listingId) {
      // Delete messages for specific email and listingId
      query = `DELETE FROM ${messagesTableName} WHERE (email = ? OR receiver = ?) AND listingId = ?`;
      params = [email, email, listingId];
    } else {
      // Delete all messages for email
      query = `DELETE FROM ${messagesTableName} WHERE email = ? OR receiver = ?`;
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

router.get("/:route/all-users", async (req, res) => {
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTables(db);
    const query = `
      SELECT u.*, 
             (SELECT m.message
              FROM ${messagesTableName} m 
              WHERE m.sender_id = u.id 
              ORDER BY m.timestamp DESC 
              LIMIT 1) AS last_msg
      FROM ${usersTableName} u
      ORDER BY u.last_activity DESC NULLS LAST, u.email ASC`;

    db.all(query, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const usersWithLastMsg = rows.map((row) => row);
      return res.status(200).json(usersWithLastMsg);
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:route/add-user", async (req, res) => {
  const { email, username, phone } = req.body;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);

  try {
    await ensureTables(db);

    // Check if user already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM ${usersTableName} WHERE email = ?`,
        [email],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create new user
    const userId = `user_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO ${usersTableName} (id, username, email, phone) VALUES (?, ?, ?, ?)`,
        [userId, username || email?.split("@")[0] || "", email, phone],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    return res.status(200).json({
      message: "User created successfully",
      userId: userId,
      email: email,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
