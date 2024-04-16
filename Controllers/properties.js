const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const Properties = async (req, res) => {
  let results;
  const databaseQuery = req.databaseQuery;
  const dbPath = getDatabasePath(req.dbName); // Get database path based on dbType
  try {
    const cacheResults = await req.redisClient.get(databaseQuery);

    if (cacheResults) {
      results = JSON.parse(cacheResults);
      return res.json({ type: "cached", results });
    } else {
      SaveInRedis(req, res, databaseQuery, dbPath); // Pass dbPath to SaveInRedis function
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Internal Server Error");
  }
};

const SaveInRedis = async (req, res, databaseQuery, dbPath) => {
  const db = new sqlite3.Database(dbPath);
  try {
    db.all(databaseQuery, async (err, rows) => {
      if (err) {
        console.error("Error executing query:", err);
        res.status(500).send("Internal Server Error");
      } else {
        await req.redisClient.set(databaseQuery, JSON.stringify(rows));
        res.json({ type: "new", results: rows });
      }
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    db.close();
  }
};

// Function to get database path based on dbType
function getDatabasePath(dbName) {
  let dbFileName = "";
  switch (dbName) {
    case "commercialDatabase":
      dbFileName = "../Data/Commercial/commercialDatabase.db";
      break;
    case "residentialAndCondosDatabase":
      dbFileName = "../Data/ResidentialAndCondos/residentialAndCondosDatabase.db";
      break;
    // Add more cases as needed
    default:
      throw new Error("Invalid dbType");
  }

  return path.resolve(__dirname, dbFileName);
}

module.exports = Properties;
