const express = require("express");
const router = express.Router();

const userWalletController = require("../controllers/userWalletController");
const JoiMiddleWare = require('../middlewares/joi/joiMiddleware'); 
const userWalletSchema = require("../validations/userWalletValidation");

router.post("/connect-wallet", 
  JoiMiddleWare(userWalletSchema.connectWallet, 'body'),
  userWalletController.connectWallet
);

router.get("/:wallet_address", 
  JoiMiddleWare(userWalletSchema.getUserWalletByWalletAddress, 'params'),
  userWalletController.getUserWalletByWalletAddress
);

module.exports = router;