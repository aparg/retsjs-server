const createConsoleLog = require('../Utils/createConsoleLog')

// A simple switch case function. Database path and details are defined on the basis of set up schema.
// Will require updating if file structure is changed.
const returnPathForPropertyUpdates = (propertyType) => {
    
    createConsoleLog(__filename, `identifying pre defined database and table name for ${propertyType} `)
    let databaseName, databasePath, tableName, databaseDirectoryName, schemaName;

    switch (propertyType) {
        case "CommercialProperty":
            databaseName = 'commercialDatabase.db'
            databasePath = '../Data/Commercial/commercialDatabase.db';
            tableName = 'commercialPropertiesTable';
            databaseDirectoryName = 'Commercial';
            schemaName = 'commercialPropertySchema'
            break;
        case "CondoProperty":
            databaseName = 'residentialAndCondosDatabase.db'
            databasePath = '../Data/ResidentialAndCondos/residentialAndCondosDatabase.db';
            tableName = 'residentialAndCondoTable';
            databaseDirectoryName = 'ResidentialAndCondos'
            schemaName = 'residentialAndCondoPropertySchema'
            break;
        case "ResidentialProperty":
            databaseName = 'residentialAndCondosDatabase.db'
            databasePath = '../Data/ResidentialAndCondos/residentialAndCondosDatabase.db';
            tableName = 'residentialAndCondoTable';
            databaseDirectoryName = 'ResidentialAndCondos'
            schemaName = 'residentialAndCondoPropertySchema'
            break;
        default:
            throw new Error("Unknown property type: " + propertyType);
    }

    return { databaseName, databasePath, tableName, databaseDirectoryName, schemaName };
};

module.exports = returnPathForPropertyUpdates;