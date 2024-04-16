const path = require('path');
const fs = require('fs').promises;
const redis = require('redis');
const parsePropertyDataXml = require('../XMLParser')
const utcTimeZoneFormatter = require('../Utils/utcTimeZoneFormatter');

const { getPropertyData, getImages } = require('../Treb3pv')

const { checkIfPropertyExists, createPropertyFunction, updatePropertyWithImagesFunction, updatePropertyFunction, executeSqlQuery } = require('./databaseActions')

const returnPathForPropertyUpdates = require('./propertyDetails');
const createConsoleLog = require('../Utils/createConsoleLog');
const ensureDirectoryExists = require('../Utils/ensureDirectoryExists');

const redisClientToClearDb = redis.createClient();
redisClientToClearDb.connect();

const setImages = async (propertyMls, databaseDirectoryName) => {
    const batchSize = 20;
    const totalProperties = propertyMls.length;
    let propertiesProcessed = 0;
    let updatedImagesObject = {};

    const numBatches = Math.ceil(totalProperties / batchSize);
    createConsoleLog(__filename, `created ${numBatches} number of image requests`);

    while (propertiesProcessed < totalProperties) {
        const batch = propertyMls.slice(propertiesProcessed, propertiesProcessed + batchSize);
        const imagesResponse = await getImages(batch, databaseDirectoryName);

        // Update the updatedImagesObject with the response from getImages
        Object.assign(updatedImagesObject, imagesResponse);

        // Update the count of processed properties
        propertiesProcessed += batch.length;
        createConsoleLog(__filename, `processed ${propertiesProcessed} out  of ${totalProperties} requests`)
    }

    createConsoleLog(__filename, `Image update completed`)

    return updatedImagesObject;
}

const getPropertyUpdates = async (updatePropertyType, updateFromTime) => {

    // For updates, we need to identify the database path and table name to be referenced. This is done via a switch case function: setUpPropertiesPath.
    // More information at './propertyDetails'.
    const { databaseName, databasePath, tableName, databaseDirectoryName, schemaName } = returnPathForPropertyUpdates(updatePropertyType);

    // We pass the look up time to looks for updates in the specific time frame.
    // Logic is described in detail in '../Setup'.
    const timeStampSql = utcTimeZoneFormatter(updateFromTime);
    const propertyDataApi = await getPropertyData(updatePropertyType, timeStampSql);

    const propertyUpdatePath = path.join(__dirname, `../Data/${databaseDirectoryName}/${updatePropertyType}Updates.xml`)

    if (!propertyDataApi.data) {
        createConsoleLog(__filename, `no new updates in the specfied time frame.`);
        return;
    }

    await ensureDirectoryExists(propertyUpdatePath);
    await fs.writeFile(propertyUpdatePath, propertyDataApi.data)

    const initialXmlObject = require(`../Setup/ObjectSchemas/${schemaName}`)

    const { propertyData, propertyMls } = await parsePropertyDataXml(propertyDataApi.data, initialXmlObject(), updatePropertyType);

    // After parsing the property data, we have to consider the scenario for when properties are new, updated, have images, or images has been updated.
    // The algorith below makes comparison of the data from parsePropertyDataXml function and classifies properties on the type of operation to perform.
    // We have created an array clauseCollection that contains the specific sql query according to property type. 

    const clauseCollection = [];

    const imagesToBeDownloaded = [];
    const propertiesToBeCreated = new Set();

    const propertiesToBeUpdatedWithImages = new Set();
    const propertiesToBeUpdated = new Set();

    // We also make use of checkIfPropertyExists function present at './databaseActions'. 
    // We classify properties based on this detection. Existing properties are further checked for image updates and processed accordingly.  
    for (const property of propertyData) {
        const propertyExists = await checkIfPropertyExists(property.MLS, databasePath, tableName)
        if (propertyExists) {
            const lastPixUpdateDate = propertyExists.PixUpdtedDt;
            if (property.PixUpdtedDt !== lastPixUpdateDate) {
                imagesToBeDownloaded.push(property.MLS);
                propertiesToBeUpdatedWithImages.add(property.MLS)
                createConsoleLog(__filename, `picture updated for existing property ${property.MLS}`)
            } else {
                propertiesToBeUpdated.add(property.MLS)
                createConsoleLog(__filename, `property exists but no pix update ${property.MLS}`)
            }
        } else {
            imagesToBeDownloaded.push(property.MLS)
            propertiesToBeCreated.add(property.MLS)
            createConsoleLog(__filename, `new property ${property.MLS}`)
        }
    }

    // Download images from the server. Image update logic explained in '../Setup'.
    const downloadImagesAndTheirNames = await setImages(imagesToBeDownloaded, databaseDirectoryName);

    // Depending on the action to be taken, individual properties are processed through their update type.
    for (const property of propertyData) {
        if (propertiesToBeCreated.has(property.MLS)) {
            createPropertyFunction(property, downloadImagesAndTheirNames[property.MLS] || [], tableName, clauseCollection);
        } else if (propertiesToBeUpdatedWithImages.has(property.MLS)) {
            await updatePropertyWithImagesFunction(property, downloadImagesAndTheirNames[property.MLS], databasePath, tableName, clauseCollection);
        } else if (propertiesToBeUpdated.has(property.MLS)) {
            await updatePropertyFunction(property, databasePath, tableName, clauseCollection);
        }
    }

    // Finally, the clauses for specific property specified in the array is executed.
    await executeSqlQuery(clauseCollection, databasePath)

    return;
}

const updatePropertyTypeMain = async (updatePropertyType, updateFromTime) => {

    // updatePropertyType is a simple function that is meant to sequentially process an array of property types.
    createConsoleLog(__filename, `initialized ${updatePropertyType.length} property types updated in ${updateFromTime} hours`);

    const allStartTime = new Date().getTime();

    for (const propertyType of updatePropertyType) {
        let singlePropertyStartTimer = new Date().getTime();
        createConsoleLog(__filename, `Started setup for ${propertyType}`);
        await getPropertyUpdates(propertyType, updateFromTime);

        // Clear redis after each update
        redisClientToClearDb.flushDb();

        let singlePropertyEndTimer = new Date().getTime();
        let timeDifferenceForEach = (singlePropertyEndTimer - singlePropertyStartTimer) / 1000;
        createConsoleLog(__filename, `Update completed for ${propertyType} in ${timeDifferenceForEach} seconds`);
    }


    const allEndTime = new Date().getTime();
    const timeDifferenceInSeconds = (allEndTime - allStartTime) / 1000;
    createConsoleLog(__filename, `Update completed for ${updatePropertyType.length} property types in ${timeDifferenceInSeconds} seconds`);
    process.exit();
}

module.exports = { updatePropertyTypeMain }
