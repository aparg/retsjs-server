const createConsoleLog = require('./createConsoleLog')

// A simple function that generates a UTC formatted time stamp. For consistency all times are set exactly to the hour.
const utcTimeZoneFormatter = (minusHours) => {
    var currentTime = new Date();
    var utcYear = currentTime.getUTCFullYear();
    var utcMonth = currentTime.getUTCMonth();
    var utcDay = currentTime.getUTCDate();
    var utcHour = currentTime.getUTCHours(); // Get UTC hour without modification

    // Subtract hours directly
    utcHour -= minusHours;

    // Handle negative hours
    while (utcHour < 0) {
        // Adjust day and hour accordingly
        utcDay -= 1;
        utcHour += 24; // Adding 24 hours to handle negative value
    }

    // Reset minutes and seconds to zero
    var utcMinute = 0;
    var utcSecond = 0;

    // Create a new Date object and manipulate it
    var oneHourEarlier = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHour, utcMinute, utcSecond));

    // Format the timestamp as required (YYYY-MM-DDTHH:MM:SS+HH:MM)
    var formattedTimestamp = oneHourEarlier.toISOString().slice(0, -5) + "+";

    createConsoleLog(__filename, `Setting look up time to ${formattedTimestamp} to look for data updated in the last ${minusHours} hours`);

    return formattedTimestamp;
}


module.exports = utcTimeZoneFormatter;
