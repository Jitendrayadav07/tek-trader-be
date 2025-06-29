const Joi = require('joi'); 

const tokenSchema = { 
    recentTokens: Joi.object().keys({
        limit: Joi.number().integer().min(1).max(100).default(10).required(),
        offset: Joi.number().integer().min(0).default(0).required(),
    }),

    myHoldingTokensSchema : Joi.object().keys({
        wallet_address: Joi.string().required(),
        pair_address: Joi.string().required(),
    }),

    getTokenList: Joi.object().keys({
        count: Joi.number(),
        offset: Joi.number(),
        search: Joi.any(),
        sortBy: Joi.any().valid("id"),
        orderBy: Joi.any().valid("asc", "desc"),
    }),

    getAddressData : Joi.object().keys({
        limit: Joi.number().default(10),
        offset: Joi.number().default(0),
        order: Joi.any(),
    }),

    transactionContractAddressSchema : Joi.object().keys({
        limit: Joi.number().required(),
        offset: Joi.number().required(),
    }),

    arenaStartSchema: Joi.object().keys({
        contract_address: Joi.string().required(),
    }),

    holdersTokensSchema : Joi.object().keys({
        limit: Joi.number().required(),
        offset: Joi.number().required(),
    }),
      
}; 
module.exports = tokenSchema