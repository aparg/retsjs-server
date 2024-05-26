const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const util = require("util");
const createConsoleLog = require("../Utils/createConsoleLog");

// checkIfPropertyExists function checks for MLS value match in a specified sqlite3 database.
const checkIfPropertyExists = async (MLS, databasePath, tableName) => {
  const dbPath = path.resolve(__dirname, databasePath);
  const db = new sqlite3.Database(dbPath);

  const dbGetAsync = util.promisify(db.get).bind(db);
  try {
    const row = await dbGetAsync(
      `SELECT * FROM ${tableName} WHERE MLS = ?`,
      MLS
    );
    if (row) {
      return row;
    } else {
      return false;
    }
  } catch (err) {
    console.error("Error querying database:", err);
    throw err;
  } finally {
    db.close();
  }
};

// Helper function to sort image file name based on their sequence.
const generateSortedPhotoLink = (unsortedArray) => {
  if (unsortedArray === undefined) {
    return [];
  }

  // Sort the array otherwise
  return unsortedArray.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/g).pop());
    const numB = parseInt(b.match(/\d+/g).pop());
    return numA - numB;
  });
};

// Helper function to assign search address for easier address queries.
const assignSearchAddress = (property) => {
  const searchAddress = [
    property.Street,
    property.StreetName,
    property.StreetAbbreviation,
    property.Area,
    property.Province,
    "Canada",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/,/g, ""); // Concatenate and sanitize

  property.SearchAddress = searchAddress;
};

// Function that checks the listing price value for the specified property with a MLS id value and tracks changes.
const updateListingPrice = async (
  property,
  databasePath,
  clauseCollection,
  tableName
) => {
  let oldPropertyValue = await checkIfPropertyExists(
    property.MLS,
    databasePath,
    tableName
  );
  await updatePriceTracker(
    property,
    databasePath,
    clauseCollection,
    property.ListPrice
  );
  if (oldPropertyValue.ListPrice !== property.ListPrice) {
    createConsoleLog(
      __filename,
      `list price changed from ${oldPropertyValue.ListPrice} to ${property.ListPrice} for ${property.MLS}.`
    );

    createConsoleLog(
      __filename,
      `MaxListPrice of this property was ${oldPropertyValue.MaxListPrice} and MinListPrice was ${oldPropertyValue.MinListPrice}`
    );

    // Update PriceTracker array with current ListPrice and TimestampSql
    const newPriceEntry = [`${property.ListPrice}`, `${property.TimestampSql}`];
    createConsoleLog(
      __filename,
      `The new pricetracker array is ${newPriceEntry}`
    );
    if (typeof property.PriceTracker !== "object" || !property.PriceTracker) {
      property.PriceTracker = JSON.stringify([]);
    }
    const priceTrackerValue = JSON.parse(property.PriceTracker);
    priceTrackerValue.push(JSON.stringify(newPriceEntry));
    property.PriceTracker = JSON.stringify(priceTrackerValue);
    // Check if ListPrice is lower or equal to MinListPrice
    if (
      parseFloat(property.ListPrice) <=
        parseFloat(oldPropertyValue.MinListPrice) ||
      !oldPropertyValue.MinListPrice
    ) {
      createConsoleLog(
        __filename,
        `list price decreased:Assigning ListPrice ${property.ListPrice} to MinListPrice.`
      );
      property.MinListPrice = property.ListPrice;
    } else {
      property.MinListPrice = oldPropertyValue.MinListPrice;
    }
    // Check if ListPrice is equal or higher than MaxListPrice
    if (
      parseFloat(property.ListPrice) >=
        parseFloat(oldPropertyValue.MaxListPrice) ||
      !oldPropertyValue.MaxListPrice
    ) {
      createConsoleLog(
        __filename,
        `list price increased:Assigning ListPrice ${property.ListPrice} to MaxListPrice.`
      );
      property.MaxListPrice = property.ListPrice;
    } else {
      property.MaxListPrice = oldPropertyValue.MaxListPrice;
    }
  } else {
    property.MinListPrice = oldPropertyValue.MinListPrice;
    property.MaxListPrice = oldPropertyValue.MaxListPrice;
  }
  return;
};

const updatePriceTracker = async (
  property,
  databasePath,
  clauseCollection,
  price
) => {
  const tableName = "PriceTracker";
  const dbPath = path.resolve(__dirname, databasePath);
  const db = new sqlite3.Database(dbPath);
  const dbGetAsync = util.promisify(db.get).bind(db);
  await dbGetAsync(`CREATE TABLE IF NOT EXISTS ${tableName}(
    MLS TEXT PRIMARY KEY,
    ChangeTrack JSON
  )`);
  const row = await dbGetAsync(
    `SELECT ChangeTrack from ${tableName} WHERE MLS=${property.MLS}`
  );
  createConsoleLog(
    __filename,
    `row value: returned row value for pricetracker array is ${row}`
  );
  if (row) {
    //the row required to update is extracted
    let priceTrackerArray = JSON.parse(row.PriceTracker);
    // if the row has no value, we have to assign an empty array to it
    if (!priceTrackerArray) priceTrackerArray = [];
    //check if the last object pushed has the same price, if so we dont need to update the array else, we will update the array
    //Also if the array is empty, we need to update the array with a new object with the latest price
    if (
      priceTrackerArray?.at(-1)?.price !== price ||
      priceTrackerArray.length === 0
    ) {
      //create an object with date and price
      const trackingValue = {
        date: property.TimestampSql,
        price,
      };
      createConsoleLog(
        __filename,
        `pushing ${trackingValue} to pricetracker array`
      );
      //push it to the array
      priceTrackerArray.push(trackingValue);
      //object for creating a query
      const dbValues = {
        ChangeTrack: JSON.stringify(priceTrackerArray),
      };
      const values = Object.values(dbValues);
      const updatePriceTrackerQuery = `INSERT INTO ${tableName} VALUES(${dbValues.map(
        () => "?"
      )}), WHERE MLS="?"`;
      clauseCollection.push({
        sql: updatePriceTrackerQuery,
        params: [...values, property.MLS],
      });
    }
  } else {
    const updatePriceTrackerQuery = `INSERT INTO ${tableName}(MLS, ChangeTrack) VALUES(?,?)`;
    const trackingValue = {
      date: property.TimestampSql,
    };

    clauseCollection.push({
      sql: updatePriceTrackerQuery,
      params: [property.MLS, trackingValue],
    });
    createConsoleLog(
      __filename,
      `new mls added in pracetracker db with mls ${property.MLS}`
    );
  }
  return;
};

// Generates sql query for creating a new listing.
const createPropertyFunction = (
  property,
  databasePath,
  imageNamesArray,
  tableName,
  clauseCollection
) => {
  createConsoleLog(
    __filename,
    `Assigned ${property.ListPrice} to MinListPrice and MaxListPrice for ${property.MLS}`
  );
  property.MinListPrice = property.ListPrice;
  property.MaxListPrice = property.ListPrice;

  assignSearchAddress(property);

  if (imageNamesArray.length > 0) {
    const sortedPhotoLink = generateSortedPhotoLink(imageNamesArray);
    property.PhotoCount = sortedPhotoLink.length;
    property.PhotoLink = JSON.stringify(sortedPhotoLink);
  }
  const keys = Object.keys(property);
  const placeholders = keys.map(() => "?").join(", ");
  const insertStatement = `INSERT INTO ${tableName} (${keys.join(
    ", "
  )}) VALUES (${placeholders})`;

  updatePriceTracker(
    property,
    databasePath,
    clauseCollection,
    property.ListPrice
  );

  clauseCollection.push({
    sql: insertStatement,
    params: Object.values(property),
  });

  createConsoleLog(
    __filename,
    `executed create property function for ${property.MLS}.`
  );

  return true;
};

// Generates sql query when an existing property has images updated.
const updatePropertyWithImagesFunction = async (
  property,
  imageNamesArray,
  databasePath,
  tableName,
  clauseCollection
) => {
  await updateListingPrice(property, databasePath, clauseCollection, tableName);
  createConsoleLog(
    __filename,
    `MinListPrice for new property is ${property.MinListPrice} and MaxListPrice is ${property.MaxListPrice}`
  );
  const sortedPhotoLink = generateSortedPhotoLink(imageNamesArray);
  property.PhotoLink = JSON.stringify(sortedPhotoLink);
  const keys = Object.keys(property);
  const setClause = keys.map((key) => `${key} = ?`).join(", ");
  const values = Object.values(property);

  const updateStatement = `UPDATE ${tableName} SET ${setClause} WHERE MLS = ?`;
  clauseCollection.push({
    sql: updateStatement,
    params: [...values, property.MLS],
  });

  createConsoleLog(
    __filename,
    `executed update property function with images for ${property.MLS}.`
  );

  return true;
};

// Generates sql query when an existing property has updates but images remain the same.
const updatePropertyFunction = async (
  property,
  databasePath,
  tableName,
  clauseCollection
) => {
  await updateListingPrice(property, databasePath, clauseCollection, tableName);
  // Filter out keys you don't want to update
  const keysToUpdate = Object.keys(property).filter(
    (key) => key !== "PhotoCount" && key !== "PhotoLink"
  );
  // Construct set clause without keys 'PhotoCount' and 'PhotoLink'
  const setClause = keysToUpdate.map((key) => `${key} = ?`).join(", ");

  const values = keysToUpdate.map((key) => property[key]);

  const updateStatement = `UPDATE ${tableName} SET ${setClause} WHERE MLS = ?`;

  clauseCollection.push({
    sql: updateStatement,
    params: [...values, property.MLS],
  });

  createConsoleLog(
    __filename,
    `executed update property function without images for ${property.MLS}.`
  );

  return true;
};

// Executes an array of sql queries. Rolls back in case of an error, preserving data sanctity.
const executeSqlQuery = async (clauseCollection, databasePath) => {
  const dbPath = path.resolve(__dirname, databasePath);
  const db = new sqlite3.Database(dbPath);
  let transaction;
  let startTime = new Date().getTime();
  try {
    // Begin a transaction
    transaction = await new Promise((resolve, reject) => {
      db.run("BEGIN TRANSACTION", function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });

    // Execute each SQL statement in the clauseCollection array
    for (const query of clauseCollection) {
      // console.log("SQL QUERIES PERFORMED FOR UPDATE");
      // console.log(query.sql, query.params);
      await new Promise((resolve, reject) => {
        db.run(query.sql, query.params, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this);
          }
        });
      });
    }

    // Commit the transaction
    await new Promise((resolve, reject) => {
      db.run("COMMIT", function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  } catch (error) {
    console.error("Error:", error);

    // Roll back the transaction in case of an error
    if (transaction) {
      createConsoleLog(__filename, "rolled back");
      await new Promise((resolve, reject) => {
        db.run("ROLLBACK", function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this);
          }
        });
      });
    }
  } finally {
    // Close the database connection when done
    db.close();
    let endTime = new Date().getTime();
    const durationInSeconds = (endTime - startTime) / 1000;
    createConsoleLog(__filename, `Total time for update ${durationInSeconds}`);
  }
};

// getAllMLSValues returns all the MLS values present in the specified database.
const getAllMLSValues = async (databasePath, tableName) => {
  const dbPath = path.resolve(__dirname, databasePath);
  const db = new sqlite3.Database(dbPath);

  const dbAllAsync = util.promisify(db.all).bind(db);

  try {
    const rows = await dbAllAsync(
      `SELECT MLS FROM ${tableName} WHERE PropertyType = ?`,
      [propertyType]
    );
    const mlsSet = new Set();
    rows.forEach((row) => {
      mlsSet.add(row.MLS);
    });
    return mlsSet;
  } catch (err) {
    console.error("Error querying database:", err);
    throw err;
  } finally {
    db.close();
  }
};

// deleteRowsByMLS deletes all the rows where the MLS value is equal to the element supplied in the array.
const deleteRowsByMLS = async (MLSValuesSet, databasePath, tableName) => {
  const dbPath = path.resolve(__dirname, databasePath);
  const db = new sqlite3.Database(dbPath);

  const dbRunAsync = util.promisify(db.run).bind(db);

  // Begin the transaction
  await dbRunAsync("BEGIN");

  try {
    // Iterate over the MLS values in the set and delete rows for each value
    for (const MLSValue of MLSValuesSet) {
      await dbRunAsync(`DELETE FROM ${tableName} WHERE MLS = ?`, MLSValue);
    }

    // Commit the transaction
    await dbRunAsync("COMMIT");

    createConsoleLog(__filename, "Deleted rows successfully.");
  } catch (err) {
    // Rollback the transaction if an error occurs
    await dbRunAsync("ROLLBACK");
    console.error("Error deleting rows from database:", err);
    throw err;
  } finally {
    // Close the database connection
    db.close();
  }
};

module.exports = {
  checkIfPropertyExists,
  getAllMLSValues,
  deleteRowsByMLS,
  createPropertyFunction,
  updatePropertyWithImagesFunction,
  updatePropertyFunction,
  executeSqlQuery,
};
