const express = require("express");
const router = express.Router();

const getLatLong = require('get-lat-long-queue');

router.post("/", async (req, res) => {
    try {
        const { id, locationToSearch } = req.body;

        // Generate a unique key for this request based on its parameters
        const cacheKey = `${locationToSearch}`;

        // Check if the result exists in Redis cache
        const cachedResult = await req.getLatLongRedisClient.get(cacheKey);

        if (cachedResult) {
            // If result exists in cache, return it
            const result = JSON.parse(cachedResult);
            return res.status(200).send({ result });
        } else {
            // If result doesn't exist in cache, make the API call
            let result;
            try {
                result = await getLatLong(
                    latLangRedisClient = req.getLatLongRedisClient,
                    latLongQueueKey = 'latLongQueueKey',
                    latLongLockKey = 'latLongLockKey',
                    latLongLocalLockKey = 'latLongLocalLockKey',
                    latLongProcessingKey = 'latLongProcessingKey',
                    expirationTime = 5000,
                    { id, locationToSearch },
                    displayLogs = true,
                );

                // Check if the result is empty
                if (!result) {
                    // If result is empty, store empty value in Redis cache
                    await req.getLatLongRedisClient.set(cacheKey, JSON.stringify({}));
                    return res.status(200).send("Location not found");
                }

            } catch (error) {
                console.error("Error from API call:", error);
                // Store empty result in Redis cache
                await req.getLatLongRedisClient.set(cacheKey, JSON.stringify({}));
                return res.status(200).send("Location not found");
            }

            // Store the result in Redis cache
            await req.getLatLongRedisClient.set(cacheKey, JSON.stringify(result));
            return res.status(200).send({ result });
        }
    } catch (e) {
        console.error(e);
        res.status(500).send('Error at /getLatLong route');
    }
});

module.exports = router;
