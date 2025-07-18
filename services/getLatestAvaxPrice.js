const db = require("../config/db.config");

async function getLastestAvaxPrice() {
    const latestPriceRes = await db.sequelize.query(
        `SELECT price FROM avax_price_live ORDER BY fetched_at DESC LIMIT 1`,
        { type: db.Sequelize.QueryTypes.SELECT }
      );
  
    return latestPriceRes
}

module.exports = {getLastestAvaxPrice}