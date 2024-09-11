const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { argv } = require("process");

const statistics = async (req, res, next) => {
  const { $metrics, $select, $span } = req.query;
  const tableName = req.tableName;
  let conditions = [];
  const metrics = parseMetricsParameters($metrics);
  const selectFields = parseSelectParameters($select);
  const responseObj = { type: { avg: "", median: "", standardDeviation: "" } };
  const dbPath = getDatabasePath(req.dbName);
  const db = new sqlite3.Database(dbPath);
  addSelectConditions(conditions, selectFields);

  if (metrics.includes("avg"))
    await parseAvg(req, res, db, responseObj, tableName, conditions);
  if (metrics.includes("median"))
    await parseMedian(req, res, db, responseObj, tableName, conditions);
  if (metrics.includes("sd"))
    await parseStandardDeviation(
      req,
      res,
      db,
      responseObj,
      tableName,
      conditions
    );

  res.json({ results: responseObj });
};
const parseSelectParameters = (select) => (select ? select.split(",") : []);
const parseMetricsParameters = (metric) => (metric ? metric.split(",") : []);

const saveInRedis = async (req, rows, databaseQuery) => {
  try {
    await req.redisClient.set(databaseQuery, JSON.stringify(rows));
  } catch (err) {
    console.error(err);
    console.log("Error saving stats in redis cache");
  }
};

const addSelectConditions = (conditions, selectFields) => {
  selectFields.forEach((field) => {
    const [fieldName, value] = field.split("=");
    const condition = getConditionString(fieldName, value);
    conditions.push(condition);
  });
};

const getConditionString = (fieldName, value) => {
  if (value === "true" || value === "false") {
    return `${fieldName} = ${value}`;
  }

  const stringValue = value?.replace(/^'|'$/g, "");
  return `${fieldName} = '${stringValue}'`;
};

// Function to get database path based on dbType
function getDatabasePath(dbName) {
  let dbFileName = "";
  switch (dbName) {
    case "commercialDatabase":
      dbFileName = "../Data/Commercial/commercialDatabase.db";
      break;
    case "residentialAndCondosDatabase":
      dbFileName =
        "../Data/ResidentialAndCondos/residentialAndCondosDatabase.db";
      break;
    // Add more cases as needed
    default:
      throw new Error("Invalid dbType");
  }

  return path.resolve(__dirname, dbFileName);
}

const parseAvg = async (req, res, db, responseObj, tableName, conditions) => {
  const { $spanMonths } = req.query;
  const avgSQL = "AVG(ListPrice)";
  const databaseQuery = `SELECT ${avgSQL} FROM ${tableName} WHERE  ${
    conditions.length > 0 ? `${conditions.join("AND")} AND` : ""
  } strftime('%Y-%m-%d', TimestampSql) >= DATE('now', '-${
    $spanMonths || 3
  } months')`;
  const cacheResults = await req.redisClient.get(databaseQuery);
  if (cacheResults) {
    const results = JSON.parse(cacheResults);
    responseObj.type.avg = "cached";
    responseObj.avg = results;
  } else {
    try {
      await PromisifiedQuery(
        req,
        db,
        databaseQuery,
        responseObj,
        "avg",
        avgSQL
      );
    } catch (err) {
      console.error("Error:", err);
    }
  }
};

const parseStandardDeviation = async (
  req,
  res,
  db,
  responseObj,
  tableName,
  conditions
) => {
  const { $spanMonths } = req.query;
  const databaseQuery = `SELECT SQRT(
      AVG(ListPrice * ListPrice) - (AVG(ListPrice) * AVG(ListPrice))
  ) AS StandardDeviation
  FROM ${req.tableName}
  WHERE TimestampSql >= DATE('now', '-' || COALESCE(${$spanMonths}, 3) || ' months')
    ${conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : ""}`;
  const cacheResults = await req.redisClient.get(databaseQuery);
  if (cacheResults) {
    const results = JSON.parse(cacheResults);
    responseObj.type.standardDeviation = "cached";
    responseObj.standardDeviation = results;
  } else {
    try {
      await PromisifiedQuery(
        req,
        db,
        databaseQuery,
        responseObj,
        "standardDeviation",
        "StandardDeviation"
      );
    } catch (err) {
      console.error("Error:", err);
    }
  }
};

const parseMedian = async (
  req,
  res,
  db,
  responseObj,
  tableName,
  conditions
) => {
  const { $spanMonths } = req.query;
  const databaseQuery = `WITH FilteredData AS (
    SELECT ListPrice
    FROM ${req.tableName}
    WHERE TimestampSql >= DATE('now', '-${$spanMonths || 3} months')
    ${conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : ""}
  ),
  RowNumbered AS (
      SELECT ListPrice,
            ROW_NUMBER() OVER (ORDER BY ListPrice) AS row_num,
            COUNT(*) OVER () AS total_count
      FROM FilteredData
  )
  SELECT AVG(ListPrice) AS MedianListPrice
  FROM RowNumbered
  WHERE row_num IN ((total_count + 1)/2, (total_count + 2)/2); 
  `;
  const cacheResults = await req.redisClient.get(databaseQuery);
  if (cacheResults) {
    const results = JSON.parse(cacheResults);
    responseObj.type.median = "cached";
    responseObj.median = results;
  } else {
    try {
      await PromisifiedQuery(
        req,
        db,
        databaseQuery,
        responseObj,
        "median",
        "MedianListPrice"
      );
    } catch (err) {
      console.error("Error:", err);
    }
  }
};

const PromisifiedQuery = (
  req,
  db,
  databaseQuery,
  responseObj,
  responseObjProperty,
  colName
) => {
  return new Promise((resolve, reject) => {
    try {
      db.all(databaseQuery, async (err, rows) => {
        if (err) {
          console.error("Error executing query:", err);
          reject();
        } else {
          try {
            responseObj.type[responseObjProperty] = "new";
            responseObj[responseObjProperty] = rows[0][colName];
            await saveInRedis(req, rows[0][colName], databaseQuery);
            resolve();
          } catch (err) {
            console.log("Query result not valid for" + responseObjProperty);
            reject();
          }
        }
      });
    } catch (err) {
      console.log("Couldn't execute query");
      console.log(err);
      reject();
    }
  });
};
module.exports = statistics;
