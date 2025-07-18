module.exports = (sequelize, DataTypes) => {
  const UserWallet = sequelize.define('user_wallets', {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    user_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wallet_address: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  }, {
    freezeTableName: true,
    timestamps: true,
    underscored: true,
  });

  return UserWallet;
};