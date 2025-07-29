//models/ShillBoard.js'

module.exports = (sequelize , DataTypes) => {
    const shillBoard = sequelize.define('shill_boards', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      contract_address: {
        type: DataTypes.STRING,
      },
      start_time: {
        type: DataTypes.DATE,
      },
      end_time: {
        type: DataTypes.DATE,
      },
      shill_category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'shill_categories',
          key: 'id'
        }
      }
    },{
      freezeTableName: true,
      timestamps: true,
      underscored: true
    });
    return shillBoard;
}
