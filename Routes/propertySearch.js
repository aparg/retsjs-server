const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Function to get database name based on route
function getDatabaseInfo(route) {
    switch (route) {
        case "residential":
            return {
                dbName: "residentialAndCondosDatabase.db",
                tableName: "residentialAndCondoTable",
                databaseDirectoryName: "ResidentialAndCondos"
            };
        case "commercial":
            return {
                dbName: "commercialDatabase.db",
                tableName: "commercialPropertiesTable",
                databaseDirectoryName: "Commercial"

            };
        default:
            throw new Error("Invalid route");
    }
}

router.get("/:route", async (req, res) => {
    const { route } = req.params;
    const { dbName, tableName, databaseDirectoryName } = getDatabaseInfo(route); // Get database name and table name based on route
    const dbPath = path.resolve(__dirname, `../Data/${databaseDirectoryName}/${dbName}`); // Construct full database path
    const db = new sqlite3.Database(dbPath);

    try {
        let { searchTerm } = req.query;
        
        // Extract searchTerm from the query parameters and sanitize
        if (!searchTerm) {
            return res.status(400).json({ error: "Missing searchTerm parameter" });
        }

        searchTerm = searchTerm.replace(/'/g, ""); // Remove single quotes
        searchTerm = searchTerm.toLowerCase(); // Convert to lowercase
        searchTerm = searchTerm.trim(); // Trim whitespace

        const searchTerms = searchTerm.split(" "); // Split search term into individual words
        
        const placeholders = searchTerms.map(() => "LOWER(SearchAddress) LIKE ?").join(" OR "); // Create placeholders for each search term
        
        const query = `
            SELECT MLS, Street, StreetName, StreetAbbreviation, Area, Province, SearchAddress 
            FROM ${tableName} 
            WHERE ${placeholders}`; 

        // Execute the query with the sanitized search terms as parameters
        const params = searchTerms.map(term => `%${term}%`);

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error("Error executing query:", err);
                return res.status(500).json({ error: "Internal Server Error" });
            }

            // Calculate scores for each row based on the number of matched keywords
            rows.forEach(row => {
                const searchAddress = row.SearchAddress.toLowerCase();
                let score = 0;
                searchTerms.forEach(term => {
                    if (searchAddress.includes(term)) {
                        score++;
                    }
                });
                row.score = score;
            });

            // Sort the rows based on the score in descending order
            rows.sort((a, b) => b.score - a.score);

            // Return only the top 10 matches
            const top10Matches = rows.slice(0, 10);

            // Send the top 10 matches as the response
            res.json(top10Matches);
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error at /searchAddress route');
    } finally {
        db.close();
    }
});

module.exports = router;
