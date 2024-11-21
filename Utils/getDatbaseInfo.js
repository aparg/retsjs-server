// Function to get database name based on route
const getDatabaseInfo = (route) => {
  switch (route) {
    case "residential":
      return {
        dbName: "residentialAndCondosDatabase.db",
        tableName: "residentialAndCondoTable",
        databaseDirectoryName: "ResidentialAndCondos",
      };
    case "commercial":
      return {
        dbName: "commercialDatabase.db",
        tableName: "commercialPropertiesTable",
        databaseDirectoryName: "Commercial",
      };
    default:
      throw new Error("Invalid route");
  }
};

module.exports = getDatabaseInfo;
