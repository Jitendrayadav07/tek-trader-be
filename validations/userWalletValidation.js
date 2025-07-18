const Joi = require('joi');

const userWalletSchema = {
    connectWallet: Joi.object().keys({
        user_name: Joi.string().required(),
        wallet_address: Joi.string().required()
    }), 
    getUserWalletByWalletAddress: Joi.object().keys({
        wallet_address: Joi.string().required()
    })
};

module.exports = userWalletSchema