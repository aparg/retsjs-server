const sax = require("sax");
const createConsoleLog = require('../../Utils/createConsoleLog')

// The function uses the sax package to extract information in the xml response as an object.
const systemNameParser = async (xmlContent) => {
    createConsoleLog(__filename, 'Extracting system names with parser.')
    
    let startTime = new Date().getTime();
    
    try {
        const parser = sax.createStream(true, { trim: true, normalize: true });

        let insideStandardName = false;
        let standardNameValues = [];
        let propertyType;
        let counter = 0;

        // This is where we identify all the standard names in the xml documents.
        // On inspection of the metadata retrieved from making an api call to '../Treb3pv', function: getPropertyFieldsMetadata,
        // we can see that there are four naming conventions for the fields:
        // StandardName,LongName, DBName, and SystemName. StandardName has been selected because of its ease to read.
        // Uses PascalCase naming convention. If other fields were to be used. We can change the node.name value. 
        parser.on("opentag", (node) => {
            if (node.name === "StandardName") {
                insideStandardName = true;
            }
        });

        // We know for a fact that all response will always contain two fields, MLS and TimestampSql. This can be considered a foundation for the whole application.
        // MLS is unique to property while TimestampSql returns the last update time. 
        //We ignore them into our response because it is already assumed every response will always contain this two values.
        parser.on("text", (text) => {
            if (insideStandardName && text !== 'MLS' && text !== 'TimestampSql') {
                // Despite largely following PascalCase conventions, I noticed rare instance of split fields. As such, an additional check is done to ensure consistent naming. 
                const words = text.trim().split(/\s+/);

                // Check if there are more than one word
                if (words.length > 1) {
                    // Join words together
                    const concatenatedText = words.join('');
                    // Add concatenated text to the set
                    standardNameValues.push(concatenatedText);
                } else {
                    // If only one word, add it directly to the set
                    standardNameValues.push(text.trim());
                }
            }
        });


        parser.on("closetag", (nodeName) => {
            if (nodeName === "StandardName") {
                insideStandardName = false;
                counter++
            }
        });

        parser.on("end", () => {
            let endTime = new Date().getTime();
            const durationInSeconds = (endTime - startTime) / 1000; // Convert milliseconds to seconds
            createConsoleLog(__filename, `Standard names parser: ${counter} fields in ${durationInSeconds.toFixed(2)} seconds`)
        });

        parser.on("error", (err) => {
            console.error(`Error parsing XML in Standard names parser:, ${err}`);
        });

        parser.write(xmlContent);
        parser.end();

        return standardNameValues;

    } catch (error) {
        throw new Error("Error reading XML file: " + error.message);
    }
};

module.exports = systemNameParser;
