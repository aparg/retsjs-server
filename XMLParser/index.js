const sax = require("sax");

// We are using Sax library to parse response received from rets server into a javascript object.
// With Sax, we have access to "opentag", "text" and "close" properties. We can retrieve their content by accessing the parser.on function.
// The function parses xml content and returns an array of individual property object.

const createConsoleLog = require('../Utils/createConsoleLog')


// I have noticed a particular bug in the data for Condo Properties. The data sometimes contains reference to "BuildingAmenities1" field.
// However, according to the fields available through the getPropertyFieldsMetadata(). The standard name for the field is "BuildingAmenties1", notice the discrepancy in spelling.
// This bug is inconsistent and as such, is being tackled here:

const fixBuildingAmenitiesKeys = (currentProperty) => {
  // Note: The function is called if the property type is equal to "Condo Property" after all the relayed data for a particular listing is read.
  for (let i = 1; i <= 6; i++) {
    const correctKey = `BuildingAmenties${i}`;
    const incorrectKey = `BuildingAmenities${i}`;

    if (currentProperty.hasOwnProperty(incorrectKey)) {
      createConsoleLog(__filename, `descrepancy in object key for BuildingAmenities${i}`)
      currentProperty[correctKey] = currentProperty[incorrectKey];
      delete currentProperty[incorrectKey];
    }
  }
  return currentProperty;
}

const parsePropertyDataXml = async (xmlContent, initialXmlObject, propertyType) => {
  try {
    createConsoleLog(__filename, `started parsing xml data for ${propertyType}`)
    const parser = sax.createStream(true, { trim: true, normalize: true });
    let currentElement = "";
    let insidePropertyType = false;
    let insideListing = false;
    let propertyObject = [];
    let currentProperty = {};
    let propertyMls = []
    let counter = 0;
    let startTime = new Date().getTime();
    let endTime;

    parser.on("opentag", (node) => {
      currentElement = node.name;
      if (currentElement === propertyType) {
        currentProperty = { ...initialXmlObject };
        insidePropertyType = true;
      } else if (insidePropertyType && currentElement === "Listing") {
        insideListing = true;
      }
    });

    parser.on("text", (text) => {
      // Accumulate the text content if inside a Listing
      if (insideListing) {
        // Testing for null values
        if (text === "null") text = null;

        // Testing for boolean
        if (text === "Y") {
          text = 1;
        } else if (text === "N") {
          text = 0;
        }

        currentProperty[currentElement] = text;
      }
    });

    parser.on("closetag", (nodeName) => {
      if (nodeName === propertyType) {
        insidePropertyType = false;
        currentProperty.PropertyType = propertyType;

        if (propertyType === 'CondoProperty') {
          // fixBuildingAmenitiesKeys to tackle the 
          fixBuildingAmenitiesKeys(currentProperty)
        }
        
        propertyObject.push(currentProperty);
        propertyMls.push(currentProperty.MLS)
        counter++;
      } else if (insidePropertyType && nodeName === "Listing") {
        insideListing = false;
      }
    });

    parser.on("end", () => {
      endTime = new Date().getTime();
      const durationInSeconds = (endTime - startTime) / 1000; // Convert milliseconds to seconds

      createConsoleLog(__filename, `XML Parser: ${counter} properties in ${durationInSeconds.toFixed(2)} seconds`)
    });

    parser.on("error", (err) => {
      console.error("Error parsing XML:", err);
    });

    parser.write(xmlContent);
    parser.end();

    return { propertyData: propertyObject, propertyMls };
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

module.exports = parsePropertyDataXml;
