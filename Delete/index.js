const { getAllActiveListings } = require('../Treb3pv');
const { getAllMLSValues, deleteRowsByMLS } = require('../Update/databaseActions');
const path = require('path');
const redis = require('redis');

const fs = require('fs').promises;

const parsePropertyDataXml = require('../XMLParser');
const { deleteMatchingFiles } = require('./deleteImage');

const returnPathForPropertyUpdates = require('../Update/propertyDetails');
const createConsoleLog = require('../Utils/createConsoleLog');
const ensureDirectoryExists = require('../Utils/ensureDirectoryExists');

const redisClientToClearDb = redis.createClient();
redisClientToClearDb.connect();

const findMissingMLS = (currentDatabaseSet, allPropertyMlsSet) => {
    var missingElementsSet = new Set();

    currentDatabaseSet.forEach((element) => {
        if (!allPropertyMlsSet.has(element)) {
            missingElementsSet.add(element);
            createConsoleLog(__filename, `${element} not present in active list`)
        }
    });
    return missingElementsSet;
}

const deletePropertyTypeMain = async (propertyTypeArray) => {
    for (propertyType of propertyTypeArray) {

        createConsoleLog(__filename, `initialized delete look up for ${propertyType}`)
        const { databaseName, databasePath, tableName, databaseDirectoryName, schemaName } = returnPathForPropertyUpdates(propertyType);

        const getActiveListings = await getAllActiveListings(propertyType)

        const fileSavePath = path.join(__dirname, `../Data/${databaseDirectoryName}/allActive${propertyType}.xml`)

        await ensureDirectoryExists(fileSavePath);
        await fs.writeFile(fileSavePath, getActiveListings.data)

        const initialXmlObject = require(`../Setup/ObjectSchemas/deleteObjectSchema`)

        const { propertyData, propertyMls } = await parsePropertyDataXml(getActiveListings.data, initialXmlObject(), propertyType)

        createConsoleLog(__filename, `${propertyType} has ${propertyMls.length} number of active listings`)

        const currentDatabaseSet = await getAllMLSValues(databasePath, tableName, propertyType)

        // Convert propertyMls array to Set
        const allPropertyMlsSet = new Set(propertyMls);

        createConsoleLog(__filename, `${propertyType} has ${allPropertyMlsSet.size} number of total active listings`)
        createConsoleLog(__filename, `${propertyType} has ${currentDatabaseSet.size} number of database listings`)

        const missingMLS = findMissingMLS(currentDatabaseSet, allPropertyMlsSet);

        const missingMLSArray = Array.from(missingMLS);
        createConsoleLog(__filename, `${propertyType} has ${missingMLSArray} in database but are now inactive`)

        await deleteRowsByMLS(missingMLSArray, databasePath, tableName)

        const photoDirectory = path.join(__dirname, `../Data/${databaseDirectoryName}/Photos/`)


        // We need to clear cache before removing images
        redisClientToClearDb.flushDb();
        
        for (const mlsIndex of missingMLSArray) {
            await deleteMatchingFiles(photoDirectory, mlsIndex);
        }
    }
    process.exit();
}

module.exports = { deletePropertyTypeMain }