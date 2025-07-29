//models/ShillCategory.js
module.exports = (sequelize , DataTypes) => {
    const shillCategory = sequelize.define('shill_categories', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      shill_category:{
          type: DataTypes.STRING
      }
    },{
      freezeTableName: true,
      timestamps: true,
      underscored: true
    });
    return shillCategory;
}
