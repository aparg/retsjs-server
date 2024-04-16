require('dotenv').config(); // Load environment variables from .env file
const fs = require('fs').promises
const path = require('path');
const redis = require('redis');
const axios = require('axios');
const { isLoggedIn, logOut, logIn } = require('./logInAndLogOut')
const createConsoleLog = require('../Utils/createConsoleLog');
const ensureDirectoryExists = require('../Utils/ensureDirectoryExists');

const redisClient = redis.createClient();
redisClient.connect();
redisClient.select(2);

// The Treb3pv server responds with a cookies on successful login and the cookies are to be used for further interaction.
// As such, all api calls are first passed through isLoggedIn function that checks for cookies and logs in if not available.
// The cookies are set to expire after 120 seconds of server inactivity as specified in the Treb3pv response.

const {
    RETS_VERSION,
    USER_AGENT,
    GET_METADATA_URL,
    SEARCH_URL,
    GET_OBJECT_URL,
    USERNAME_FOR_DATA_RETRIEVAL,
    PASSWORD_FOR_DATA_RETRIEVAL,
    USERNAME_FOR_INACTIVE_RETRIEVAL,
    PASSWORD_FOR_INACTIVE_RETRIEVAL,
} = process.env;

const getPropertyFieldsMetadata = async (propertyType) => {
    createConsoleLog(__filename, `Retrieving available fields for property type: ${propertyType}`)
    await isLoggedIn(USERNAME_FOR_DATA_RETRIEVAL, PASSWORD_FOR_DATA_RETRIEVAL, redisClient)
    const sessionId = 'user:' + USERNAME_FOR_DATA_RETRIEVAL;
    const cookies = await redisClient.get(sessionId);
    const parsedCookies = JSON.parse(cookies);

    const headers = {
        'Accept': '*/*',
        'RETS-Version': RETS_VERSION,
        'User-Agent': USER_AGENT,
        'Cookie': parsedCookies.join('; '),
    };

    // A standard api call where the params are pre-defined per RETS specification. 
    // Returns all available data fields for a specific property type.
    try {
        const resourceId = `Property:${propertyType}`;
        const response = await axios.get(GET_METADATA_URL, {
            params: {
                Type: 'METADATA-TABLE',
                ID: resourceId,
                Format: 'STANDARD-XML'
            },
            headers: headers,
        });
        createConsoleLog(__filename, `Retrieved available fields for property type: ${propertyType}`)

        return { message: 'Successfully retrieved residential metadata', data: response.data };
    } catch (error) {
        console.error('Error retrieving residential metadata:', error);
        return { error: 'Failed to retrieve residential metadata' };
    }
}

const getPropertyData = async (propertyType, timeStampSql) => {
    createConsoleLog(__filename, `getting property data for ${propertyType}, updated after ${timeStampSql}`)
    await isLoggedIn(USERNAME_FOR_DATA_RETRIEVAL, PASSWORD_FOR_DATA_RETRIEVAL, redisClient)
    try {
        // Retrieve session cookies from Redis using the session identifier
        const sessionId = 'user:' + USERNAME_FOR_DATA_RETRIEVAL;
        const cookies = await redisClient.get(sessionId);

        // Parse cookies from Redis
        const parsedCookies = JSON.parse(cookies);

        // Set up headers
        const headers = {
            'Accept': '*/*',
            'RETS-Version': RETS_VERSION,
            'User-Agent': USER_AGENT,
            'Cookie': parsedCookies.join('; '), // Set cookies in the headers
        };

        // The get request conducts a look up for a property type that matches the search criteria.
        // The params are mostly hard coded as this are specifically described in  Real Estate Data Interchange Standard: Real Estate Transaction Specification
        const response = await axios.get(SEARCH_URL, {
            params: {
                QueryType: 'DMQL2',
                Format: 'STANDARD-XML',
                Count: 1,
                SearchType: 'Property',
                Class: propertyType,
                Query: `(Timestamp_sql=${timeStampSql}),(Status=|A)`
            },
            headers: headers,
        });

        // In some instances the server responds with a response code of 20201 when there are no listings available for the specified search criteria.
        const xmlResponse = response.data;
        const replyCodeIndex = xmlResponse.indexOf('ReplyCode="');
        if (replyCodeIndex !== -1) {
            const replyCodeStartIndex = replyCodeIndex + 'ReplyCode="'.length;
            const replyCodeEndIndex = xmlResponse.indexOf('"', replyCodeStartIndex);
            const replyCode = xmlResponse.substring(replyCodeStartIndex, replyCodeEndIndex);
            if (replyCode === '20201') {
                // No records found, return false
                return { message: 'No records found', data: false };
            }
        }

        createConsoleLog(__filename, `retrieved data for ${propertyType}`)

        // Send the search results as the response
        return { message: 'success', data: xmlResponse };

    } catch (error) {
        // If there's an error, log it for debugging
        console.error('Error querying residential properties:', error);

    }
}

// get images is a little tricky partly because regex is required to identify the start and end point for binary data.
// Regex is also used to identify the MLS ID of the property and the number of the image sequence.
// The function saves the images with the supplied id and returns an object specifying all property processed and their image names.
const getImages = async (propertyMlsArray, photoDirectoriesName) => {
    createConsoleLog(__filename, 'made api request call for images');
    await isLoggedIn(USERNAME_FOR_DATA_RETRIEVAL, PASSWORD_FOR_DATA_RETRIEVAL, redisClient);

    const formattedPropertyMls = propertyMlsArray.map(mls => `${mls}:*`).join(',');

    try {
        // Retrieve session cookies from Redis using the session identifier
        const sessionId = 'user:' + USERNAME_FOR_DATA_RETRIEVAL;
        const cookies = await redisClient.get(sessionId);

        // Parse cookies from Redis
        const parsedCookies = JSON.parse(cookies);

        // Set up headers
        const headers = {
            'Accept': '*/*',
            'RETS-Version': 'RETS/1.7',
            'User-Agent': 'HOMEBABA/1',
            'Cookie': parsedCookies.join('; '), // Set cookies in the headers
        };

        // Make a request to retrieve objects
        const response = await axios.get(GET_OBJECT_URL, {
            params: {
                Type: 'Photo',
                Resource: 'Property',
                ID: formattedPropertyMls
            },
            headers: headers,
            responseType: 'arraybuffer' // Important to receive binary data
        });

        createConsoleLog(__filename, 'received response from server')

        const responseData = Buffer.from(response.data).toString('binary');

        await redisClient.expire(sessionId, 120); // Update expiration time

        // Extract the boundary from the content-type header
        const contentTypeHeader = response.headers['content-type'];
        const boundaryMatch = contentTypeHeader.match(/boundary=([^\s;]+)/);
        if (boundaryMatch && boundaryMatch[1]) {
            const boundary = boundaryMatch[1];
            const regex = new RegExp(`--${boundary}(?:--)?`, 'g'); // Adjusted regex to include optional trailing "--"
            const parts = responseData.split(regex);

            const imageFormatRegex = /Content-Type: image\/(jpeg|png)/;

            const contentIdRegex = /Content-ID: (\S+)/;
            const objectIdRegex = /Object-ID: (\S+)/

            createConsoleLog(__filename, `received ${parts.length} number of objects in response.`);

            const updatedImagesObject = {};

            // In some instances, the response part doesn't have binary data for images. In such cases, it is skipped.

            for (let i = 0; i < parts.length; i++) {
                const imageTypeMatch = parts[i].match(imageFormatRegex)
                if (imageTypeMatch) {
                    const start = parts[i].indexOf('\r\n\r\n') + 4; // Find the start of the image data
                    const imageData = parts[i].substring(start);
                    const imageFormat = imageTypeMatch[1]
                    const contentIdmatch = parts[i].match(contentIdRegex);
                    const contentId = contentIdmatch[1];
                    const objectIdMatch = parts[i].match(objectIdRegex);
                    const objectId = objectIdMatch[1];
                    const filename = path.join(__dirname, `../Data/${photoDirectoriesName}`, `Photos/${contentId}-${objectId}.${imageFormat}`);
                    await ensureDirectoryExists(filename);
                    await fs.writeFile(filename, imageData, 'binary');
                    // createConsoleLog(__filename, `completed writing for ${contentId}-${objectId}.${imageFormat}`)

                    // Check if the contentId already exists in updatedImagesObject
                    if (updatedImagesObject.hasOwnProperty(contentId)) {
                        // If it exists, push the new image filename to the array
                        updatedImagesObject[contentId].push(`${contentId}-${objectId}.${imageFormat}`);
                    } else {
                        // If it doesn't exist, create a new key-value pair with an array containing the image filename
                        updatedImagesObject[contentId] = [`${contentId}-${objectId}.${imageFormat}`];
                    }
                }
            }

            return updatedImagesObject;
        } else {
            console.error('Boundary not found in content-type header');
            // Handle the case where boundary is not found
            return { error: 'Failed to retrieve images - Boundary not found' };
        }

    } catch (error) {
        // If there's an error, log it for debugging
        console.error('Error retrieving images:', error);

        // Send an error response
        return { error: 'Failed to retrieve images' };
    }
};

// In order to get all active listings we need to sign in with alternate user name and password as defined in the Treb3pv documentation.
// Using the USERNAME_FOR_INACTIVE_RETRIEVAL has access to only one query. The query returns all active listing's MLS values.

const getAllActiveListings = async (propertyType) => {
    createConsoleLog(__filename, `retrieving inactive listings for ${propertyType}`)
    await isLoggedIn(USERNAME_FOR_INACTIVE_RETRIEVAL, PASSWORD_FOR_INACTIVE_RETRIEVAL, redisClient)
    try {
        // Retrieve session cookies from Redis using the session identifier
        const sessionId = 'user:' + USERNAME_FOR_INACTIVE_RETRIEVAL;
        const cookies = await redisClient.get(sessionId);

        // Parse cookies from Redis
        const parsedCookies = JSON.parse(cookies);

        // Set up headers
        const headers = {
            'Accept': '*/*',
            'RETS-Version': RETS_VERSION,
            'User-Agent': USER_AGENT,
            'Cookie': parsedCookies.join('; '), // Set cookies in the headers
        };


        const response = await axios.get(SEARCH_URL, {
            params: {
                QueryType: 'DMQL2',
                Format: 'STANDARD-XML',
                Count: 1,
                SearchType: 'Property',
                Class: propertyType,
                Query: `(Status=|A)`
            },
            headers: headers,
        });

        const xmlResponse = response.data;
        const replyCodeIndex = xmlResponse.indexOf('ReplyCode="');
        if (replyCodeIndex !== -1) {
            const replyCodeStartIndex = replyCodeIndex + 'ReplyCode="'.length;
            const replyCodeEndIndex = xmlResponse.indexOf('"', replyCodeStartIndex);
            const replyCode = xmlResponse.substring(replyCodeStartIndex, replyCodeEndIndex);
            if (replyCode === '20201') {
                // No records found, return false
                return { message: 'No records found', data: false };
            }
        }

        createConsoleLog(__filename, `retrieved inactive listings for ${propertyType}`)


        // Send the search results as the response
        return { message: 'success', data: xmlResponse };


    } catch (error) {
        // If there's an error, log it for debugging
        console.error('Error querying residential properties:', error);

    }
}


module.exports = { getPropertyFieldsMetadata, getPropertyData, getImages, getAllActiveListings }