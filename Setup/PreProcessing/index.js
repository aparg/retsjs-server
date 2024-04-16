const path = require('path');
const createConsoleLog = require('../../Utils/createConsoleLog')

const defaultDatabaseObjectFile = 'defaultObjectSchema.js';
const objectSchemaDirectoryPath = path.join(__dirname, '../ObjectSchemas');
const objectSchemaFilePath = path.join(objectSchemaDirectoryPath, defaultDatabaseObjectFile)

const defaultDatabaseSchemaFile = 'defaultDatabaseSchema.js';
const databaseSchemaDirectoryPath = path.join(__dirname, '../DatabaseSchemas');
const databaseSchemaFilePath = path.join(databaseSchemaDirectoryPath, defaultDatabaseSchemaFile)

const parseSystemNames = require('./systemNameParser');

const updateObjectSchema = require('./updateObjectSchema');

const updateDatabaseSchema = require('./updateDatabaseSchema');

const preProcessSetup = async (preprocessMetaData) => {

    // createConsoleLog(__filename, `Started pre processing for. ${propertyType}`);

    // The function parses a xml document type and returns the standard names to be used for the property type.
    // Since we are combining residential and condo properties, we are using a set to combine all fields.
    // More information at: systemNameParser'./systemNameParser.js')

    const standardNameValuesCombined = [];

    for (let i = 0; i < preprocessMetaData.length; i++) {
        // createConsoleLog(__filename, `Retrieveing standardNames for. ${preprocessMetaData[i]}`);
        const standardNameValuesForProperty = await parseSystemNames(preprocessMetaData[i]);
        standardNameValuesCombined.push(standardNameValuesForProperty);
    }

    // Flatten the array of arrays
    const flattenedArray = standardNameValuesCombined.flat();

    // Convert it into a set to eliminate duplicates
    const uniqueSet = new Set(flattenedArray);

    // If you need it as an array again, convert the set back to an array
    const standardNameValues = Array.from(uniqueSet);

    // With the information of all the fields to be parsed into the database, we create two new files specifying the object fields and the database schema.
    // We will use the object schema to make assumption about the response. After set up, if the response sends other fields then first specified,
    // we will need to run the set up again. This is meant to ack as a check so that the front end doesn't unexpectedly break. Mechanisms in place to identify when that happens.
    // The updateObjectSchema function returns the name of the created object schema. This is used for further setup.
    const createPropertySchema = await updateObjectSchema(standardNameValues, `${preprocessMetaData.length > 1 ? 'ResidentialAndCondoProperty' : 'CommercialProperty'}`
        , objectSchemaFilePath, objectSchemaDirectoryPath)

    // We also pre define the database schema. More information at './updateDatabaseSchema'. Function name: updateDatabaseSchema.
    // On completion, updateDatabaseSchema generates a new file that is executed to initialize the database for specific property type.
    const databaseDetails = await updateDatabaseSchema(standardNameValues, `${preprocessMetaData.length > 1 ? 'ResidentialAndCondoProperty' : 'CommercialProperty'}`,
        databaseSchemaFilePath, databaseSchemaDirectoryPath);

    // The updateDatabaseSchema returns the database and table name specific to property type.
    const { databaseName, tableName, databaseDirectoryName } = databaseDetails;

    // We initialize the generated file.
    const initializeDatabase = require(`../DatabaseSchemas/${tableName}`)
    await initializeDatabase()

    createConsoleLog(__filename, `Pre processing completed with database named ${databaseName} and table ${tableName}`)

    return { propertySchemaName: createPropertySchema, databaseName, tableName, databaseDirectoryName }

}


module.exports = preProcessSetup;


