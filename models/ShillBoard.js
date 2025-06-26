//models/ShillBoard.js'

module.exports = (sequelize , DataTypes) => {
    const shillBoard = sequelize.define('shill_boards', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      shill_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'shill_categories',
          key: 'id'
        }
      },
      txn_hash: {
        type: DataTypes.STRING,
      },
      contract_address: {
        type: DataTypes.STRING,
      },
      image_url: {
        type: DataTypes.STRING,
      },
      sender_address: {
        type: DataTypes.STRING,
      },
      upvote : {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      downvote : {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      description : {
        type: DataTypes.STRING,
      },
      end_date_time : {
        type: DataTypes.DATE,
      },
    },{
      freezeTableName: true,
      timestamps: true,
      underscored: true
    });
    return shillBoard;
}
