const path = require("path");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");

require("dotenv").config({ path: path.resolve(__dirname, '.env') })
const uri = process.env.MONGO_CONNECTION_STRING;

const databaseAndCollection = { db: "CMSC335DB", collection: "nelsonClickerData" };
const { MongoClient, ServerApiVersion } = require('mongodb');

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/public'));
app.use(express.json())

// starting server stuff
const portNumber = 3000;
const server = app.listen(portNumber, () => {
    console.log(`Web server started and running at http://localhost:${portNumber}\nCTRL + 'c' to stop the server`);
});

app.get("/", async (request, response) => {
    const joke = await fetchJoke();
    response.render("login", { error:'', joke });
});

app.get("/login", (request, response) => {
    response.render("login", { error: '' });
});

app.get("/new", (request, response) => {
    response.render("register", { error: '' });
});

app.post("/login", async (request, response) => {
    const client = new MongoClient(uri);
    await client.connect();

    let { name, password } = request.body;
    let filter = { username: name };
    let result = await client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .findOne(filter);
    if (!result) {
        const joke = await fetchJoke();
        /*re open login page but pass in error variable this time*/
        response.render("login", { joke: joke, error: 'User not found. Would you like to create an account?' });
    } else {
        valid = await bcrypt.compare(password, result.password);

        if (!valid) {
            /*invalid password*/
            const joke = await fetchJoke();
            response.render("login", { error: 'Invalid password', joke });
        } else {
            response.redirect(`/play?username=${name}`);
        }
    }
});

app.post("/new", async (request, response) => {
    const client = new MongoClient(uri);
    await client.connect();

    let { name, password } = request.body;
    let filter = { username: name };
    let result = await client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .findOne(filter);
    if (result) {
        /*Username already taken*/
        response.render("register", { error: 'Username taken, if this is you, please login.' });
    } else {
        hashedPassword = await bcrypt.hash(password, 10);
        let toInsert = { username: name, password: hashedPassword, clicks: 0 };
        await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(toInsert);
        response.redirect(`/play?username=${name}`);
    }
});

/*Route both login and create account to this*/
app.get("/play", async (request, response) => {
    const client = new MongoClient(uri);
    await client.connect();

    const { username } = request.query; // Extract username from query parameters
    const filter = { username: username };

    try {
        const result = await client.db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .findOne(filter);

        if (!result) {
            response.status(404).send("User not found");
        } else {
            // Pass clicks to the game template
            const variables = {
                userClicks: result.clicks || 0 // Default to 0 if no clicks are recorded
            };
            response.render("game", variables);
        }
    } catch (err) {
        console.error("Error fetching user data:", err);
        response.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

app.get("/leaderboard", async (request, response) => {
    const client = new MongoClient(uri);
    await client.connect();
    const cursor = client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .find({})
        .sort({ clicks: -1 }) /*sort by decreasing clicks*/
        .limit(5);  /*get top 5 entries*/
    const result = await cursor.toArray();

    let tabledata = result.reduce((res, user) => {
        return res + `<tr><td>${user.username}</td><td>${user.clicks}</td></tr>`;
    }, "");

    const variables = {
        leaderboard: `<table border ="1"> 
    <tr> 
        <th>Username</th>
        <th>Clicks</th>
    </tr>
    ${tabledata}
    </table>`
    }

    response.render("leaderboard", variables);
});

app.post("/update", async (request, response) => {
    const client = new MongoClient(uri);
    await client.connect();

    let { username, clicks } = request.body;
    let filter = { username: username };
    let update = { $set: { clicks: clicks } };
    let options = { returnDocument: "after" };
    console.log(request.body);
    console.log("biug nuts" + username + " " + clicks);
    try {
        const result = await client.db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .findOneAndUpdate(filter, update, options);

        if (!result) {
            response.status(404).send("User not found");
        } else {
            console.log(`Successfully updated user: ${username} with new clicks: ${clicks}`);
            console.log(result);
            response.status(200).json(result.value);
        }
    } catch (err) {
        console.error("Error saving user data:", err);
        response.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
})

async function fetchJoke() {
    try {
        const response = await fetch('https://official-joke-api.appspot.com/random_joke');
        const joke = await response.json();
        return `${joke.setup} - ${joke.punchline}`;
    } catch (error) {
        console.error("Error fetching joke:", error);
        return "Couldn't fetch a joke. Please try again later.";
    }
}