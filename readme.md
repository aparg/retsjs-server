# Retsjs

## Description
A node js express application that makes api requests to servers following Real Estate Transaction Specification protocols.
It makes queries about property listing updates, parses the xml response, retrieves binary data to save as images and finally collates all the information in a sqlite3 database.
Express server accepts frontend request with dynamic queries.

## Getting Started

### External Dependencies

* Redis

### Installing

* Initialize dependencies with `npm i`
* Create a new config.env file and input correct server log in protocols. Available fields can be referenced at sample.env
* Initialize the database with updated properties in the last 24 hours with `npm run setup`

### Executing program

* How to run the program
```
npm start
```

## Software Logic

* The `npm run setup` command conducts a major operation:
- It first retrieves all the fields available for a specific property type.
- It uses this information to initialize a sqlite3 database with prepefined fields. For the purpose of this application, residential properties and condo properties are merged as a single property but can be identified with the Key : 'PropertyType'.
- It then queries the RETS server for updates since the specified cut off time.
- Images are retrieved for the listing by parsing the binary data as jpeg files identified by their MLS number.

* Get request is made to the link ```localhost:3000/residential/Properties/```.
* Commercial properties can be accessed at ```localhost:3000/commercial/Properties/```
* Location search can be accessed at ```localhost:3000/propertySearch/commercial/```
* Photos can be accessed at ```localhost:3000/residentialPhotos/```
* Queries are cached via redis for faster delivery.
* Available queries include:
- "$limit" to limit number of responses. Default value of 10. 
- "$skip" to skip responses, used in conjunction for pagination.
- "$select" to return exact match. example: ```localhost:3000/residential/Properties/?$select=Municipality='Toronto',Link=true```
- $range to return range matches. The request needs to prefixed with "max" and "min" keyboard to specify range. Returns value equal or greather than max and equal or lesser than min. 
- "$selectOr" to include partial matches.
example:```localhost:3000/residential/Properties/?$range=minBedrooms=1,maxBedrooms=3```