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

// router.get("/tokens-list",
//     JoiMiddleWare(tokenSchema.getTokenList, "query"),
//     tokenController.tokenListTokens);

router.get("/tokens-list-new",
    // JoiMiddleWare(tokenSchema.getTokenList, "query"),
    tokenController.tokenListTokensMerged);

router.get("/arena-trade/get-change-percentage",
    tokenController.getTradeChangePercentage);

router.get("/my-holding-tokens",
    JoiMiddleWare(tokenSchema.myHoldingTokensSchema, "query"),
    tokenController.myHoldingTokens);

router.get("/tokens-holders/:pair_address",
    JoiMiddleWare(tokenSchema.holdersTokensSchema, "query"),
    tokenController.holdersTokens);

router.get("/communities/top",
    JoiMiddleWare(tokenSchema.getTopTokenList, "query"),
    tokenController.communitiesTopController);

router.get("/arena",
    JoiMiddleWare(tokenSchema.listOfTokenSchema, "query"),
    tokenController.communitiesListOfTokenController);

router.get("/token-trade-analysis/:pair_address",
    tokenController.tokenTradeAnalysisData);

router.get("/get-internal-id/:pair_address",
    tokenController.getInternalIdByPairAddressData);

router.get("/token-ohlc/:pair_address",
    tokenController.tokenOhlcData);

router.get("/transaction-history/:pair_address",
    JoiMiddleWare(tokenSchema.transactionContractAddressSchema, "query"),
    tokenController.transactionBuySellHistory);

router.get("/all-token-balance",
    JoiMiddleWare(tokenSchema.preBondedTokensSchema, "query"),
    tokenController.getAllTokenBalance);

router.get("/wallet-holdings",
    JoiMiddleWare(tokenSchema.walletHoldingsSchema, "query"),
    tokenController.walletHoldings);

router.get("/liquidity-status/:pair_address",
    JoiMiddleWare(tokenSchema.liquidityStatus, "params"),
    tokenController.liquidityStatus);


router.get("/get-current-token-price",
    // JoiMiddleWare(tokenSchema.liquidityStatus, "params"),
    tokenController.getCurrentTokenPrice);


module.exports = router;