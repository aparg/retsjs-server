const sqlite3 = require('sqlite3').verbose();

function getRowCount() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('./Data/ResidentialAndCondos/residentialAndCondosDatabase.db', sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
            } else {
                // Query to get the count of rows in the table
                const query = "SELECT COUNT(*) as count FROM residentialAndCondoTable";

                db.get(query, (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row.count);
                    }
                });

                // Close the database connection
                db.close((err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });
            }
        });
    });
}


(async() => {
getRowCount()
    .then(count => {
        console.log("Number of rows:", count);
    })
    .catch(err => {
        console.error("Error:", err);
    });    
})()
