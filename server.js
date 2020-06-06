"use strict";

var express = require("express");
var mongo = require("mongodb");
var mongoose = require("mongoose");
var bodyParser = require("body-parser");
var validUrl = require("valid-url");

var cors = require("cors");

var app = express();

// Use NodeJS promises instead of built in ones
// Because the promise library
// in mongoose is now deprecated.
mongoose.Promise = global.Promise;

// Basic Configuration
var port = process.env.PORT || 3000;

/** this project needs a db !! **/
mongoose
  .connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  })
  .then(() => {
    console.log("Connected to Mongo!");
  })
  .catch((err) => {
    console.error("Error connecting to Mongo", err);
  });
// we can further test connection status
// console.log(mongoose.connection.readyState);
// ready states being: 0: disconnected 1: connected 2: connecting 3: disconnecting

app.use(cors());

/** this project needs to parse POST bodies **/
app.use(bodyParser.urlencoded({ extended: false }));

app.use("/public", express.static(process.cwd() + "/public"));

app.get("/", function (req, res) {
  res.sendFile(process.cwd() + "/views/index.html");
});

/** # SCHEMAS and MODELS # */

// Expected output for correct entry: {"original_url":"https://www.freecodecamp.org","short_url":2}
// Set up the urlEntry schema
var Schema = mongoose.Schema;

var urlEntrySchema = new Schema({
  original_url: String,
  short_url: { type: Number, index: true },
});

// index so it's faster to search by short_url
urlEntrySchema.index({ short_url: 1 });
urlEntrySchema.set("autoIndex", false);

var UrlEntry = mongoose.model("UrlEntry", urlEntrySchema);

// Using functional approach

//  it will take in the long URL and
// return false if the URL does not already exists in the database, or the short code if it does:
function isDuplicate(url) {
  return UrlEntry.findOne({ original_url: url }).then((doc) =>
    doc ? doc.short_url : false
  );
}

// Look for the entry with the highest short_url in the database.
// Add 1 to it.
// Save the new entry with the incremented short_url.
// To make it a bit less confusing, we’ll write two functions:

// getShortCode(): Will return a new short_url for us to use.
function getShortCode() {
  return UrlEntry.find()
    .sort({ short_url: -1 })
    .limit(1)
    .select({ _id: 0, short_url: 1 }) //hide id
    .then((docs) => {
      return docs.length === 1 ? docs[0].short_url : 0; // not incrementing here
    });
}

// insertNew(url): will call getShortCode within and insert a new document for the given URL.
function insertNew(url) {
  return getShortCode().then((newCode) => {
    let newUrl = new UrlEntry({ original_url: url, short_url: newCode + 1 }); // to keep the short_url of 1st entry 1
    return newUrl.save();
  });
}

// Will generate full url using req headers
function createFullUrl(req, url) {
  return `${req.protocol}://${req.hostname}:${port()}/${url}`;
}

// Our API endpoints...
/* Creating Short URL */
app.post("/api/shorturl/new", (req, res) => {
  // Provided URL
  const url = req.body.url;
  //console.log(url);

  // Check for validity of URL
  // We can use dns.lookup(url, callback).
  // I am using URI validation functions(https://www.npmjs.com/package/valid-url)

  if (validUrl.isUri(url)) {
    // We can generate some kind of identifier to save your original URL in database.
    // We can use shortid(https://www.npmjs.com/package/shortid) or a SHA-1 hash could be used
    // We will use the  default object ID created by mongodb when saving the element if needed.

    // Since provided URL looks valid,
    //console.log("Looks like an URI");

    // We check for duplicates entry, if the URL already has
    // short_url, we return the existing entry, otherwise, we create a new
    // entry and return it.

    isDuplicate(url).then((exists) => {
      if (exists) {
        res.json({ original_url: url, short_url: exists });
      } else {
        insertNew(url).then((inserted) => {
          res.json({ original_url: url, short_url: inserted.short_url });
        });
      }
    });
  } else {
    //console.log("Not a URI");
    res.json({ error: "invalid URL" });
  }
});
/* Retrieving Short URL */
app.get("/api/shorturl/:shortId", (req, res) => {
  let shortId = parseInt(req.params.shortId);
  if (isNaN(shortId)) {
    res.json({ error: "Invalid URL shortId. It must be a number." });
  } else {
    UrlEntry.findOne({ short_url: shortId }).then((doc) => {
      if (!doc) {
        res.json({ error: "Page not found" });
      } else {
        res.redirect(doc.original_url);
      }
    });
  }
});

// listen for requests :)
app.listen(port, function () {
  console.log("Node.js listening ...");
});

// Reference: https://startjs.net/2016/11/02/create-url-shortener-node-js-mongodb/
