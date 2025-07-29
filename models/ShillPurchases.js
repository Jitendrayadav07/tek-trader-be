module.exports = (sequelize, DataTypes) => {
  const ShillPurchases = sequelize.define('shill_purchases', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    wallet_address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL,
      allowNull: false,
    },
    shill_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'shill_boards',
        key: 'id',
      },
    },
    contract_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tx_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    freezeTableName: true,
    timestamps: true,
    underscored: true,
  });
  return ShillPurchases;
} 