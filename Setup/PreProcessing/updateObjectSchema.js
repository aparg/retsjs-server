const fs = require("fs").promises;

const path = require('path');

const createConsoleLog = require('../../Utils/createConsoleLog');
const ensureDirectoryExists = require("../../Utils/ensureDirectoryExists");

// We are writing an object key value pattern into a file. A predefined object schema file exists. Check '../ObjectSchemas/defaultObjectSchema.js' 
//The new schema file is saved at folder: '../ObjectSchemas/'
// We are using regex to make a few modifications such as dynamically setting the object name, the object export name and the file name.
const updateObjectSchema = async (standardNameValues, propertyType, objectSchemaFilePath, objectSchemaDirectoryPath) => {
    try {
        createConsoleLog(__filename, `updating default object schema for ${propertyType} with ${standardNameValues.length} available fields`)
        let schemaContent;
       
        const propertyTypeCamelCase = propertyType.charAt(0).toLowerCase() + propertyType.slice(1);
        const  propertySchema = propertyTypeCamelCase + 'Schema' 

        schemaContent = await fs.readFile(objectSchemaFilePath, "utf-8");

        // Replace all occurrences of 'defaultObjectSchema' with lowercase propertyType
        const regex_defaultObjectSchema = new RegExp('defaultObjectSchema', 'g');

        schemaContent = schemaContent.replace(regex_defaultObjectSchema, propertyTypeCamelCase);

        // Generate the string to insert into schema.js
        const valuesString = standardNameValues.map(value => `${value}: null`).join(',\n');

        // If there are no new fields, exit
        if (valuesString.trim() === "") {
            return;
        }

        // Split schema content into lines
        let schemaLines = schemaContent.split('\n');

        // Find where to insert new values
        const insertionIndex = schemaLines.findIndex(line => line.includes('SearchAddress')) + 1;

        // Insert the values into the schema.js content
        schemaLines.splice(insertionIndex, 0, valuesString);

        // Join schema lines back to a string
        schemaContent = schemaLines.join('\n');

        // Write the updated schema.js content to a new file
        const generatedSchemaFilePath = path.join(objectSchemaDirectoryPath, `${propertySchema}.js`);
        await ensureDirectoryExists(generatedSchemaFilePath);
        await fs.writeFile(generatedSchemaFilePath, schemaContent);
        createConsoleLog(__filename, `updated default object schema and saved to ${generatedSchemaFilePath}`)

        // Return the schema name for future processing.
        return propertySchema

    } catch (error) {
        console.error("Error reading XML file:", error);
    }
};

module.exports = updateObjectSchema;
