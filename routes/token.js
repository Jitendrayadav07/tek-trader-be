const express = require("express");
const router = express.Router();

const tokenController = require("../controllers/tokenController");
const JoiMiddleWare = require('../middlewares/joi/joiMiddleware');
const tokenSchema = require("../validations/tokenValidation");

router.get("/recent-tokens",
    JoiMiddleWare(tokenSchema.recentTokens, "query"),
    tokenController.recentTokens);

router.get("/pair-token-details/avalanche/:pairId",
    tokenController.pairTokenData);

router.get("/tokens-list",
    JoiMiddleWare(tokenSchema.getTokenList, "query"),
    tokenController.tokenListTokens);

router.get("/token-data-list",
    JoiMiddleWare(tokenSchema.getAddressData, "query"),
    tokenController.getAllTokenlist);

module.exports = router;