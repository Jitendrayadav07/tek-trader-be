// models/AvaxPriceLive.js
module.exports = (sequelize, DataTypes) => {
    const AvaxPriceLive = sequelize.define('avax_price_live', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      price: {
        type: DataTypes.DECIMAL,
        allowNull: false
      },
      fetched_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    }, {
        freezeTableName: true,
        timestamps: false,
        underscored: true
    });
  
    return AvaxPriceLive;
};
  