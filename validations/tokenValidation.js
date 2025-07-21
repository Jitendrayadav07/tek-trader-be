const Joi = require('joi');

const tokenSchema = {
    recentTokens: Joi.object().keys({
        limit: Joi.number().integer().min(1).max(100).default(10).required(),
        offset: Joi.number().integer().min(0).default(0).required(),
        search: Joi.string().optional().allow(''),
    }),

    myHoldingTokensSchema: Joi.object().keys({
        wallet_address: Joi.string().required(),
        pair_address: Joi.string().required(),
    }),

    getTokenList: Joi.object().keys({
        pageSize: Joi.number(),
        page: Joi.number(),
        sortBy: Joi.any().valid("id"),
        orderBy: Joi.any().valid("asc", "desc"),
        wallet_address: Joi.string(),
        search: Joi.any(),
    }),

    getTopTokenList: Joi.object().keys({
        pageSize: Joi.number(),
        page: Joi.number(),
    }),

    getAddressData: Joi.object().keys({
        limit: Joi.number().default(10),
        offset: Joi.number().default(0),
        order: Joi.any(),
    }),

    transactionContractAddressSchema: Joi.object().keys({
        limit: Joi.number().required(),
        offset: Joi.number().required(),
    }),

    arenaStartSchema: Joi.object().keys({
        contract_address: Joi.string().required(),
    }),

    holdersTokensSchema: Joi.object().keys({
        limit: Joi.number().required(),
        offset: Joi.number().required(),
    }),

    preBondedTokensSchema: Joi.object().keys({
        wallet_address: Joi.string().required(),
        contract_address: Joi.string().required(),
    }),
    walletHoldingsSchema: Joi.object().keys({
        wallet_address: Joi.string().required(),
        is_success: Joi.boolean(),
    }),

    listOfTokenSchema :  Joi.object().keys({
        search: Joi.string(),
    }),

    liquidityStatus: Joi.object().keys({
        pair_address: Joi.string().required(),
    }),
};
module.exports = tokenSchema