const sqlite3 = require('sqlite3').verbose();
const util = require('util');

const createConsoleLog = require('../Utils/createConsoleLog')

// writeToDatabase is a simple function that processes an array of objects and writes them into the specified database.
// This function is meant to initialize a new property and as such is used in the set up process.
// The function also passes the photo related to a specific property MLS value given that image exists.
const writeToDatabase = async (propertyType, properties, databasePath, tableName, updatedImagesObject) => {
    createConsoleLog(__filename, `writing ${propertyType} with ${properties.length} properties to database`)

    const db = new sqlite3.Database(databasePath);
    const dbRunAsync = util.promisify(db.run).bind(db);

    try {
        let startTime = new Date().getTime();

        for (const property of properties) {
            property.MinListPrice = property.ListPrice;
            property.MaxListPrice = property.ListPrice;

            const searchAddress = [
                property.Street,
                property.StreetName,
                property.StreetAbbreviation,
                property.Area,
                property.Province,
                "Canada"
            ].join(" ").toLowerCase().replace(/,/g, ""); // Concatenate and sanitize

            property.SearchAddress = searchAddress;

            if (updatedImagesObject.hasOwnProperty(property.MLS)) {
                // Sort photoLink array based on the last numerical value with the smallest first
                const sortedPhotoLink = updatedImagesObject[property.MLS].sort((a, b) => {
                    const numA = parseInt(a.match(/\d+/g).pop());
                    const numB = parseInt(b.match(/\d+/g).pop());
                    return numA - numB;
                });
                property.PhotoCount = sortedPhotoLink.length;
                property.PhotoLink = JSON.stringify(sortedPhotoLink);
            }

            const keys = Object.keys(property);
            const values = Object.values(property);

            const placeholders = keys.map(() => '?').join(', ');
            const insertStatement = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;

            // Insert the property into the database
            try {
                await dbRunAsync(insertStatement, values);
                createConsoleLog(__filename, `commited to database for ${property.MLS}`)
            } catch (error) {
                console.error('Error inserting property into the database:', error, property.MLS);
            }

        }
        let endTime = new Date().getTime();
        const durationInSeconds = (endTime - startTime) / 1000; // Convert milliseconds to seconds

        createConsoleLog(__filename, `Total time for initial read/write operation ${durationInSeconds}`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Close the database connection when done
        db.close();
        createConsoleLog(__filename, `Database connection closed`);

        return true;
    }
};

module.exports = writeToDatabase;

