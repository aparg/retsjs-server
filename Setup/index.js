const path = require('path');
const fs = require('fs').promises

const mainDataDirectory = path.join(__dirname, '..', 'Data');

const { getPropertyFieldsMetadata, getPropertyData, getImages } = require('../Treb3pv')
const { logOut } = require('../Treb3pv/logInAndLogOut')

const parsePropertyDataXml = require('../XMLParser');
const preProcessSetup = require('./PreProcessing/');
const writeToDatabase = require('./writeToDatabase');

const utcTimeZoneFormatter = require('../Utils/utcTimeZoneFormatter');

const createConsoleLog = require('../Utils/createConsoleLog');
const ensureDirectoryExists = require('../Utils/ensureDirectoryExists');

const writeToDatabaseFunction = async (setUpPropertyType, timeStampSql, propertySchemaName, databaseDirectoryName, databaseName, tableName) => {
    for (const propertySetup of setUpPropertyType) {
        const propertyDataApi = await getPropertyData(propertySetup, timeStampSql);

        if (!propertyDataApi.data) {
            createConsoleLog(__filename, `Please select an older time cut off. No updates in current period.`);
            return;
        }

        const databaseDirectoryPath = path.join(mainDataDirectory, databaseDirectoryName, databaseName);

        const initialXmlObject = require(`./ObjectSchemas/${propertySchemaName}`);

        // We use parsePropertyDataXml function to retrieve property details and their corresponding MLS numbers. We save the property data for future reference.
        // More information at '../XMLParser'.
        const { propertyData, propertyMls } = await parsePropertyDataXml(propertyDataApi.data, initialXmlObject(), propertySetup);

        const initialDataDirectoryPath = path.join(mainDataDirectory, databaseDirectoryName, `initial${propertySetup}.xml`);

        await ensureDirectoryExists(initialDataDirectoryPath);
        await fs.writeFile(initialDataDirectoryPath, propertyDataApi.data);

        // We need to now retrieve images. We pass an array of MLS values to retrieve data from and the directory to save them at.
        // More information at setImages function. .
        const updatedImagesObject = await setImages(propertyMls, databaseDirectoryName)

        // Finally all the information is passed to be saved to the database. This includes the property type, data specific to the previous query. Database name and table name.
        // And details regarding images. More information at: ./writeToDatabase'.
        await writeToDatabase(setUpPropertyType, propertyData, databaseDirectoryPath, tableName, updatedImagesObject);
    }

}

const setUpProperties = async (setUpPropertyType, initialStartTime) => {

    // While setting up, the first step is pre processing the metadata i.e. identifying the fields to be be parsed into the database.
    // We retrieve this information relative to a specific property type by making an api call to the rets metadata retrieval end point.
    // More information at '../Treb3pv'. Function name: getPropertyFieldsMetadata.

    // We have a situation in this particular application where residential and condo databases are to be merged. As such we are passing 'setUpPropertyType' as an array.
    // And then combining all fields such that queries do not unnecessary fail in the frontend.

    const preprocessMetaData = []

    for (const individualProperty of setUpPropertyType) {
        const preprocessMetaDataCombined = await getPropertyFieldsMetadata(individualProperty);
        // We write this information into the `../PropertyTypeMetadata/` folder for future reference. 
        const metaDataPath = path.join(__dirname, `./PropertyTypeMetadata/${individualProperty}.xml`)
        await ensureDirectoryExists(metaDataPath)
        await fs.writeFile(metaDataPath, preprocessMetaDataCombined.data)
        preprocessMetaData.push(preprocessMetaDataCombined.data)
    }

    // We pass it into pre processing.
    // More information at: './PreProcessing'. Function name: preProcessSetup.
    const preprocessResults = await preProcessSetup(preprocessMetaData)

    // On completion of pre processing, a new object schema specific to property type and new database with the predefined object schema is initialized.
    const { propertySchemaName, databaseName, tableName, databaseDirectoryName } = preprocessResults;

    // Wit the database set up, we need to populate it with latest updates.
    // The rets api requires time stamp to be passsed in UTC formatting. As such a helper function has been created.
    // More information at ../Utils/utcTimeZoneFormatter'.

    const timeStampSql = utcTimeZoneFormatter(initialStartTime);

    // We then make api call to the function getPropertyData. We need to specify the property type to be looked up updated after the specified time frame.
    // More information at: '../Treb3pv'. Function name: getPropertyData.
    // The propertyData returns an object with xml response passed as .data. We use the data to write info to database.
    // Since ondo and residential property need to be passed into the same database, writeToDatabaseFunction is helper function that just loops through the property types to be merged.

    await writeToDatabaseFunction(setUpPropertyType, timeStampSql, propertySchemaName, databaseDirectoryName, databaseName, tableName)

    return;
}

const setImages = async (propertyMls, databaseDirectoryName) => {
    // The Treb3pv server responds with binary data of all photos relative to a listing in binary data. This means the response is huge.
    // As such, properties are batched into 10 and image data processed. 
    const batchSize = 20;
    const totalProperties = propertyMls.length;
    let propertiesProcessed = 0;
    let updatedImagesObject = {};

    const numBatches = Math.ceil(totalProperties / batchSize);
    createConsoleLog(__filename, `created ${numBatches} number of image requests`);

    while (propertiesProcessed < totalProperties) {
        const batch = propertyMls.slice(propertiesProcessed, propertiesProcessed + batchSize);

        // getImages function does a specialized task of parsing the binary data into images with pre-defined naming conventions.
        // More information at: '../Treb3pv'. Function name: getImages
        const imagesResponse = await getImages(batch, databaseDirectoryName);

        // Update the updatedImagesObject with the response from getImages
        Object.assign(updatedImagesObject, imagesResponse);

        // Update the count of processed properties
        propertiesProcessed += batch.length;
        createConsoleLog(__filename, `processed ${propertiesProcessed} out  of ${totalProperties} properties`)
    }

    createConsoleLog(__filename, `Image update completed`)

    return updatedImagesObject;
}

const initializeAllProperties = async (propertyType, initialStartTime) => {

    // initializeAllProperties is a simple function that is meant to sequentially process an array of property types.
    createConsoleLog(__filename, `initialized ${propertyType.length} property types going back ${initialStartTime} hours`);

    const allStartTime = new Date().getTime();

    for (const property of propertyType) {
        let singlePropertyStartTimer = new Date().getTime();
        createConsoleLog(__filename, `Started setup for ${property}`);
        await setUpProperties(property, initialStartTime);
        let singlePropertyEndTimer = new Date().getTime();
        let timeDifferenceForEach = (singlePropertyEndTimer - singlePropertyStartTimer) / 1000;
        createConsoleLog(__filename, `Setup completed for ${property}  ${timeDifferenceForEach} seconds`);
    }

    const allEndTime = new Date().getTime();
    const timeDifferenceInSeconds = (allEndTime - allStartTime) / 1000;
    createConsoleLog(__filename, `Setup completed for ${propertyType.length} propertyType in ${timeDifferenceInSeconds} seconds`);
    process.exit();
};


module.exports = {
    initializeAllProperties
};








