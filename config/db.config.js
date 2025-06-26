// config/db.config.js
const { Sequelize } = require("sequelize");
require("dotenv").config();

//Localhost Databse Connection
const sequelize = new Sequelize(
    process.env.TEK_DB,
    process.env.TEK_USERNAME,
    process.env.TEK_PASSWORD,
    {
      host: process.env.TEK_HOST,
      dialect: "postgres",
      port: 5432,
    }
);

// Test the database connection
sequelize
  .authenticate()
  .then(() => {
    console.log("Database connection has been established successfully.");
  })
.catch((err) => {
    console.error("Unable to connect to the database:", err);
});


const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;


db.ShillCategory = require("../models/ShillCategory")(sequelize, Sequelize);
db.ShillBoard = require("../models/ShillBoard")(sequelize, Sequelize);

module.exports = db;