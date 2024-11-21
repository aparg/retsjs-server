const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const tableName = "notesTable";
const getDatabaseInfo = require("../Utils/getDatbaseInfo");

//Post route that takes in message and ip address and saves it to the database
router.post("/:route", async (req, res) => {
  const receiver = "admin";
  const { message } = req.body;
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);

  const ipAddress =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
  console.log(ipAddress);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);
  //create table if it doesn't exist
  const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (message TEXT, ipAddress TEXT, receiver TEXT)`;
  await db.run(createTableQuery);
  const query = `INSERT INTO ${tableName} (message, ipAddress, receiver) VALUES (?, ?, ?)`;
  await db.run(query, [message, ipAddress, receiver], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
  });
  res.status(200).json({ message: "Note saved successfully" });
});

//Get route that retrieves all notes from the database
router.get("/:route", (req, res) => {
  const { route } = req.params;
  const { dbName, databaseDirectoryName } = getDatabaseInfo(route);
  const dbPath = path.resolve(
    __dirname,
    `../Data/${databaseDirectoryName}/${dbName}`
  );
  const db = new sqlite3.Database(dbPath);
  //get ip address and return all notes from that ip address
  const { ipAddress } = req.query;
  const query = `SELECT * FROM ${tableName} WHERE ipAddress = ?`;
  db.all(query, [ipAddress], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(200).json(rows);
  });
});

module.exports = router;
