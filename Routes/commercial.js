const express = require('express');
const router = express.Router();
const propertiesController = require('../Controllers');
const propertiesMiddleware = require('../Middleware');

// Custom middleware function to add additional parameter
function handleOptionalParametersWithDbType(req, res, next) {
    // Add your logic here to determine the database type
    const dbName = 'commercialDatabase'; 
    const tableName = 'commercialPropertiesTable';
    
    // Attach dbType to the request object
    req.dbName = dbName;
    req.tableName = tableName;
    
    // Call the original middleware function with the modified request object
    propertiesMiddleware.handleOptionalParameters(req, res, next);
}

// Routing property to respective controller with custom middleware
router.get('/Properties/', handleOptionalParametersWithDbType, propertiesController.controllers.Properties);

module.exports = router;
