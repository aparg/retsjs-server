const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const tableName = "notesTable";
const getDatabaseInfo = require("../Utils/getDatbaseInfo");

//Post route that takes in message and ip address and saves it to the database
router.post("/:route", async (req, res) => {
  const receiver = "admin";
  const { message, email, listingId } = req.body;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);
  //create table if it doesn't exist
  const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (message TEXT, email TEXT, listingId TEXT, receiver TEXT)`;
  await db.run(createTableQuery);
  const query = `INSERT INTO ${tableName} (message,email, listingId, receiver) VALUES (?, ?, ?,?)`;
  await db.run(query, [message, email, listingId, receiver], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    } else {
      return res.status(200).json({ message: "Note saved successfully" });
    }
  });
});

// Changed from GET to POST for better security with email handling
router.post("/:route/getmessages", (req, res) => {
  const { route } = req.params;
  const { email, listingId } = req.body; // Changed from req.query to req.body
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);
  console.log(email, listingId);
  const query = `SELECT message, email, listingId FROM ${tableName} WHERE (email=? OR receiver = ?) AND listingId = ?`;
  db.all(query, [email, email, listingId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(200).json(rows);
  });
});

router.get("/:route/all-notes", (req, res) => {
  // CORS check
  const allowedOrigins = ["https://lowrise.ca/", "http://localhost:4000"]; // Adjust these domains
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

  const query = `SELECT * FROM ${tableName}`;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(200).json(rows);
  });
});

router.post("/:route/admin-message", (req, res) => {
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

  const query = `INSERT INTO ${tableName} (message, email, listingId, receiver) VALUES (?, ?, ?, ?)`;
  db.run(query, [message, email, listingId, receiver], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res
      .status(200)
      .json({ message: "Admin message saved successfully" });
  });
});

module.exports = router;
