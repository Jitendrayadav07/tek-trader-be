// models/ArenaTrade.js
module.exports = (sequelize, DataTypes) => {
    const ArenaTrade = sequelize.define('arena_trades', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      transferred_avax: {
        type: DataTypes.DECIMAL
      },
      avax_price: {
        type: DataTypes.DECIMAL
      },
      price_eth: {
        type: DataTypes.DECIMAL
      },
      price_usd: {
        type: DataTypes.DECIMAL
      },
      price_after_usd: {
        type: DataTypes.DECIMAL
      },
      price_after_eth: {
        type: DataTypes.DECIMAL
      },
      block_number: {
        type: DataTypes.INTEGER
      },
      timestamp: {
        type: DataTypes.DATE
      },
      token_id: {
        type: DataTypes.DECIMAL
      },
      action: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      tx_hash: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      from_address: {
        type: DataTypes.TEXT
      },
      referrer: {
        type: DataTypes.TEXT
      },
      status: {
        type: DataTypes.TEXT
      },
      amount: {
        type: DataTypes.TEXT
      }
    }, {
      freezeTableName: true,
      timestamps: false,
      underscored: true
    });
  
    return ArenaTrade;
  };
  