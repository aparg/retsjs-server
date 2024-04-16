const fs = require("fs").promises;

const path = require('path');

const createConsoleLog = require('../../Utils/createConsoleLog');
const ensureDirectoryExists = require("../../Utils/ensureDirectoryExists");

// returnDatabasePathAndTable uses switch case to generate a set of predefined values. This includes naming conventions and path.
// Changing paths and names will result in set up process being altered. Designed to be flexible for future modifications.
const returnDatabasePathAndTable = (propertyType) => {
    createConsoleLog(__filename, `identifying pre defined database and table name for ${propertyType} `)

    let databaseName, databasePath, tableName, databaseDirectoryName;

    switch (propertyType) {
        case "CommercialProperty":
            databaseName = 'commercialDatabase.db'
            databasePath = '../../Data/Commercial/commercialDatabase.db';
            tableName = 'commercialPropertiesTable';
            databaseDirectoryName = 'Commercial'
            break;
        case "ResidentialAndCondoProperty":
            databaseName = 'residentialAndCondosDatabase.db'
            databasePath = '../../Data/ResidentialAndCondos/residentialAndCondosDatabase.db';
            tableName = 'residentialAndCondoTable';
            databaseDirectoryName = 'ResidentialAndCondos'
            break;
        default:
            throw new Error("Unknown property type: " + propertyType);
    }

    const newDatabasePath = `const databasePath = path.resolve(__dirname, '${databasePath}');`;
    createConsoleLog(__filename, `Assigned database name = ${databaseName}, table name: ${tableName} for ${propertyType} `)

    return { databaseName, newDatabasePath, tableName, databaseDirectoryName };
};

// The purpose of updateDatabaseSchema is to create a javascript module that can be used to initialize a sqlite3 database and table.
// We also overwrite some values in the predefined schema such that it updates to the specific table and database name.
const updateDatabaseSchema = async (standardNameValues, propertyType, databaseSchemaFilePath, databaseSchemaDirectoryPath) => {
    createConsoleLog(__filename, `updating default database table schema for ${propertyType} `)
    try {
        let schemaContent;

        // Determine database path and table name based on property type
        const { databaseName, newDatabasePath, tableName, databaseDirectoryName } = returnDatabasePathAndTable(propertyType);

        schemaContent = await fs.readFile(databaseSchemaFilePath, "utf-8");
        // let schemaLines = schemaContent.split('\n');

        // Replace all occurrences of the databasePath line with the new one
        const regex_databasePath = /const databasePath = path\.resolve\(__dirname, '\/placeholder\/path\/to\/db'\);/;

        const regex_tableName = /CREATE TABLE IF NOT EXISTS placeholder_table_name_to_be_replaced \(/;
        const replacement_tableName = ` CREATE TABLE IF NOT EXISTS ${tableName} (`;

        // Write the updated schema.js content and write to new file. Also update database path and table name.
        // This is quite important since it makes sure the database path is correctly resolved to establish connection.
        schemaContent = schemaContent.replace(regex_databasePath, newDatabasePath)
        schemaContent = schemaContent.replace(regex_tableName, replacement_tableName)
        createConsoleLog(__filename, `Used regex to update ${databaseSchemaFilePath}`)

        // Generate the string to insert into schema.js
        const valuesString = standardNameValues.join(',\n');

        // Split schema content into lines
        let schemaLines = schemaContent.split('\n');

        // Find where to insert new values
        const insertionIndex = schemaLines.findIndex(line => line.includes('SearchAddress')) + 1;

        // Insert the values into the schema.js content
        schemaLines.splice(insertionIndex, 0, valuesString);

        // Join schema lines back to a string
        schemaContent = schemaLines.join('\n');

        // Write the updated schema.js content back to a new file with table name as name.
        const generatedSchemaFilePath = path.join(databaseSchemaDirectoryPath, `${tableName}.js`);
        await ensureDirectoryExists(generatedSchemaFilePath);
        await fs.writeFile(generatedSchemaFilePath, schemaContent);
        createConsoleLog(__filename, `Schema updated successfully and saved to ${generatedSchemaFilePath}.`)

        return { databaseName, tableName, databaseDirectoryName };

    } catch (error) {
        console.error("Error reading XML file:", error);
    }
};

module.exports = updateDatabaseSchema;
