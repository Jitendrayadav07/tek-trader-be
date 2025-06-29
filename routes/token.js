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

router.get("/pair-token-details-new/avalanche/:pairId",
    tokenController.pairTokenDataNew);

router.get("/tokens-list",
    JoiMiddleWare(tokenSchema.getTokenList, "query"),
    tokenController.tokenListTokens);

router.get("/my-holding-tokens",
    JoiMiddleWare(tokenSchema.myHoldingTokensSchema, "query"),
    tokenController.myHoldingTokens);

router.get("/tokens-holders/:pair_address",
    JoiMiddleWare(tokenSchema.holdersTokensSchema, "query"),
    tokenController.holdersTokens);

router.get("/arena-stars",
    JoiMiddleWare(tokenSchema.arenaStartSchema, "query"),
    tokenController.arenaStartController);

router.get("/communities/top",
    tokenController.communitiesTopController);

router.get("/token-trade-analysis/:pair_address",
    tokenController.tokenTradeAnalysisData);

router.get("/get-internal-id/:pair_address",
    tokenController.getInternalIdByPairAddressData);

router.get("/token-ohlc/:pair_address",
    tokenController.tokenOhlcData);

router.get("/transaction-history/:pair_address",
    JoiMiddleWare(tokenSchema.transactionContractAddressSchema, "query"),
    tokenController.transactionBuySellHistory);

module.exports = router;