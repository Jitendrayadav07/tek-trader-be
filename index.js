const http = require("http");
const express = require("express");
const formData = require("express-form-data");
const os = require("os");
const cors = require("cors");

// Import routes
const routes = require("./routes");

const app = express();
const server = http.createServer(app); 

app.use(cors());


// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// simple route
const options = {
  uploadDir: os.tmpdir(),
  autoClean: true
};

app.use(formData.parse(options));
app.use(formData.format());
app.use(formData.union());

// Sync models with the database
const sequelizeDB = require("./config/db.config");
sequelizeDB.sequelize.sync(sequelizeDB);


// Use routes
app.use("/api", routes);

// ======================
// ✅ SOCKET.IO Setup
// ======================
const initSocket = require("./socket");
initSocket(server); 


// set port, listen for requests
const PORT = 43000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});