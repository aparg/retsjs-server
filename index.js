const express = require("express");
const cors = require("cors");

const path = require("path");

const redis = require("redis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

//importing residential, commercial and condos routes
const residentialRoutes = require("./Routes/residential");

const commercialRoutes = require("./Routes/commercial");

//importing getLatLong routes
const getLatLongRoutes = require("./Routes/getLatLong");

//Importing property search routes
const propertySearchRoutes = require("./Routes/propertySearch")

// Create Redis client
const redisClient = redis.createClient();
redisClient.on("error", (error) => console.error(`Redis Error: ${error}`));
redisClient.connect();

// Create Redis client for get-lat-long routes with a different database
const getLatLongRedisClient = redis.createClient(); 
getLatLongRedisClient.on("error", (error) => console.error(`GetLatLong Redis Error: ${error}`));
getLatLongRedisClient.connect();
getLatLongRedisClient.select(1);

// Pass the Redis client to the routes
app.use((req, res, next) => {
  req.redisClient = redisClient;
  req.getLatLongRedisClient = getLatLongRedisClient;
  next();
});

//make residential images available
app.use(
  "/residentialPhotos",
  express.static(path.join(__dirname, "./Data/ResidentialAndCondos/Photos/"))
);

//make commercial images available
app.use(
  "/commercialPhotos",
  express.static(path.join(__dirname, "./Data/Commercial/Photos/"))
);

//Seperating routes into residential, commercial and condos
app.use("/residential", residentialRoutes);

app.use("/commercial", commercialRoutes);

//Integrating get-lat-long-queue
app.use("/get-lat-long", cors(), getLatLongRoutes);

//Integreate search
app.use("/propertySearch", propertySearchRoutes)

app.listen(PORT, () => {
  console.log(`${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`);
});
