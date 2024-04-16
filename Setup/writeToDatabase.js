const sqlite3 = require('sqlite3').verbose();
const createConsoleLog = require('../Utils/createConsoleLog');

// writeToDatabase is a function that processes an array of objects and writes them into the specified database table.
// This function is designed for initializing new properties and is used in the setup process.
// It also handles associating photos with a specific property MLS value, provided the images exist.
const writeToDatabase = async (propertyType, properties, databasePath, tableName, updatedImagesObject) => {
    createConsoleLog(__filename, `writing ${propertyType} with ${properties.length} properties to database`);

    const db = new sqlite3.Database(databasePath);

    try {
        let startTime = new Date().getTime();

        for (const property of properties) {
            property.MinListPrice = property.ListPrice;
            property.MaxListPrice = property.ListPrice;

            // Generate a search address by concatenating and sanitizing property address components
            const searchAddress = [
                property.Street,
                property.StreetName,
                property.StreetAbbreviation,
                property.Area,
                property.Province,
                "Canada"
            ].join(" ").toLowerCase().replace(/,/g, ""); // Concatenate and sanitize
            property.SearchAddress = searchAddress;

            // Check if there are updated images for the current property
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

            // Wrap the database operation in a promise
            await new Promise((resolve, reject) => {
                db.run(insertStatement, values, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        createConsoleLog(__filename, `committed to database for ${property.MLS}`);
                        resolve();
                    }
                });
            });
        }

        let endTime = new Date().getTime();
        const durationInSeconds = (endTime - startTime) / 1000;

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

// Export the writeToDatabase function for use in other modules
module.exports = writeToDatabase;
