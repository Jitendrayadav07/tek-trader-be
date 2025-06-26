// models/ArenaTokenCoin.js
module.exports = (sequelize, DataTypes) => {
    const ArenaTokenCoin = sequelize.define('arena-trade-coins', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      curve_scaler: {
        type: DataTypes.DECIMAL
      },
      a: {
        type: DataTypes.SMALLINT
      },
      b: {
        type: DataTypes.SMALLINT
      },
      lp_deployed: {
        type: DataTypes.BOOLEAN
      },
      lp_percentage: {
        type: DataTypes.SMALLINT
      },
      sale_percentage: {
        type: DataTypes.SMALLINT
      },
      creator_fee_basis_points: {
        type: DataTypes.SMALLINT
      },
      internal_id: {
        type: DataTypes.DECIMAL
      },
      supply: {
        type: DataTypes.DECIMAL
      },
      system_created: {
        type: DataTypes.DATE
      },
      name: {
        type: DataTypes.TEXT
      },
      symbol: {
        type: DataTypes.TEXT
      },
      contract_address: {
        type: DataTypes.TEXT
      },
      status: {
        type: DataTypes.TEXT
      },
      creator_address: {
        type: DataTypes.TEXT
      },
      create_token_tx_id: {
        type: DataTypes.TEXT
      },
      pair_address: {
        type: DataTypes.TEXT
      }
    }, {
      freezeTableName: true,
      timestamps: false, // system_created is manually handled
      underscored: true
    });
  
    return ArenaTokenCoin;
  };
  