const express = require("express");
const router = express.Router();
const propertiesController = require("../Controllers");
const propertiesMiddleware = require("../Middleware");

const dbName = "residentialAndCondosDatabase";
const tableName = "residentialAndCondoTable";

// Attach dbType to the request object
function assignDbName(req) {
  req.dbName = dbName;
  req.tableName = tableName;
  return req;
}
// Custom middleware function to add additional parameter
function handleOptionalParametersWithDbType(req, res, next) {
  // Call the original middleware function with the modified request object
  assignDbName(req);
  propertiesMiddleware.handleOptionalParameters(req, res, next);
}

function handleStatisticCalculationWithDbType(req, res, next) {
  // propertiesMiddleware(assignDbName(req), res, next);
  assignDbName(req);
  next();
}

// Routing property to respective controller with custom middleware
router.get(
  "/Properties/",
  handleOptionalParametersWithDbType,
  propertiesController.controllers.Properties
);
router.get(
  "/stats/",
  handleStatisticCalculationWithDbType,
  propertiesController.controllers.Statistics
);
module.exports = router;
