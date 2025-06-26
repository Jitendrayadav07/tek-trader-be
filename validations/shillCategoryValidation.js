const Joi = require('joi') 

const shillCategorySchema = { 
  createShillCategory: Joi.object().keys({ 
    shill_category: Joi.string().required(),
  }),

  getShillCategory: Joi.object().keys({
    id: Joi.string().required() 
  }),

  putShillCategory: Joi.object().keys({
    id: Joi.string().required(),
    shill_category: Joi.string() 
  }),
  
  deleteShillCategory: Joi.object().keys({
    id: Joi.string().required() 
  })
}; 
module.exports = shillCategorySchema;