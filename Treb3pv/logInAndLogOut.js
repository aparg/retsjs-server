const axios = require('axios');

const createConsoleLog = require('../Utils/createConsoleLog')

const {
    RETS_VERSION,
    USER_AGENT,
    LOGIN_URL,
    LOGOUT_URL,
} = process.env;

const isLoggedIn = async (username, password, redisClient) => {
    createConsoleLog(__filename, `Checking if logged in for username ${username}`)
    const sessionId = 'user:' + username;
    const cookiesJson = await redisClient.get(sessionId);

    if (cookiesJson) {
        // If the session token exists, update its expiration time
        await redisClient.expire(sessionId, 120); // Update expiration time
        createConsoleLog(__filename, 'Cookies exist. Refreshed cookies expiry Time.')
        return true;
    } else {
        createConsoleLog(__filename, 'User not logged in or cookies expired.')
        await logIn(username, password, redisClient);
        return false;
    }
}

const logIn = async (username, password, redisClient) => {
    createConsoleLog(__filename, `Trying to log in user ${username}`)

    try {
        const headers = {
            'Accept': '*/*',
            'RETS-Version': RETS_VERSION,
            'User-Agent': USER_AGENT,
        };


        const instance = axios.create({
            baseURL: LOGIN_URL,
            headers,
        });

        const response = await instance.get('', {
            auth: {
                username,
                password
            },
        });

        const { status, data } = response;


        if (status === 200) {
            // Extract session cookies from the response
            const cookies = response.headers['set-cookie'];

            // Generate a unique identifier for the user session
            const sessionId = 'user:' + username;

            // Store cookies in Redis with the session identifier
            await redisClient.set(sessionId, JSON.stringify(cookies));
            await redisClient.expire(sessionId, 120)

            createConsoleLog(__filename, `Successfully logged in ${username}`)

            return true;
        } else if (status === 401) {
            return { error: ` Unauthorized - Invalid credentials`, data };
        } else {
            return { error: `Unexpected response from RETS server. Status Code: ${status}`, data };
        }
    } catch (error) {
        return { error: `Failed to connect to RETS server` };
    }
}


async function logOut(username, redisClient) {
    createConsoleLog(__filename, 'Log out to treb3pv called')

    const sessionId = 'user:' + username;
    const cookies = await redisClient.get(sessionId);

    if (cookies) {
        const parsedCookies = JSON.parse(cookies);
        const instance = axios.create({
            baseURL: LOGOUT_URL,
            headers: {
                'Accept': '*/*',
                'RETS-Version': RETS_VERSION,
                'User-Agent': USER_AGENT,
                'Cookie': parsedCookies.join('; '),
            },
        });

        try {
            const response = await instance.get('');
            await redisClient.del(sessionId);
            return response.data;
        } catch (error) {
            console.error('Error during logout:', error);
            return { error: 'Failed to logout from RETS server' };
        }
    } else {
        return { error: 'Session expired or not found' };
    }
}

module.exports = { isLoggedIn, logOut, logIn }