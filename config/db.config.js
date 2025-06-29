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


db.ArenaTrade = require("../models/ArenaTrade")(sequelize, Sequelize);
db.ArenaTradeCoins = require("../models/ArenaTradeCoins")(sequelize, Sequelize);
db.ShillBoard = require("../models/ShillBoard")(sequelize, Sequelize);
db.ShillCategory = require("../models/ShillCategory")(sequelize, Sequelize);
db.TokenMetadata = require("../models/TokenMetadata")(sequelize, Sequelize);
db.ArenaPriceLive = require("../models/ArenaPriceLive")(sequelize, Sequelize);
db.ArenaTradeTemp = require("../models/ArenaTradeTemp")(sequelize, Sequelize);

// Association
// Tokens and Trades have one-to-many relationship
db.ArenaTradeCoins.hasMany(db.ArenaTrade, {
    foreignKey: "token_id",   // token_id is in trades
    sourceKey: "internal_id", // internal_id is in tokens
    as: "trades"
  });
  
  db.ArenaTrade.belongsTo(db.ArenaTradeCoins, {
    foreignKey: "token_id",   // token_id is in trades
    targetKey: "internal_id", // internal_id is in tokens
    as: "token"
  });


module.exports = db;