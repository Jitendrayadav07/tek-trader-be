const Joi = require('joi') 

const shillBoardSchema = { 
   createShillBoard: Joi.object().keys({ 
    txn_hash: Joi.any().required(),
    contract_address: Joi.any().required(),
    shill_category_id: Joi.any().required(),
    image_url: Joi.any().required(),
    sender_address: Joi.any().required(),
    description: Joi.any().required(),
    end_date_time: Joi.date().required()
  }),

  getShillBoard: Joi.object().keys({
    id: Joi.string().required() 
  }),
  
  deleteShillBoard: Joi.object().keys({
    id: Joi.string().required() 
  })
}; 
module.exports = shillBoardSchema;