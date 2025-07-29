module.exports = (sequelize, DataTypes) => {
  const Votes = sequelize.define('votes', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    shill_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'shill_boards',
        key: 'id',
      },
    },
    up_vote: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    down_vote: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    contract_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wallet_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    freezeTableName: true,
    timestamps: true,
    underscored: true,
  });
  return Votes;
} 