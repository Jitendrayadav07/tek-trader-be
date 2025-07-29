// index.js
const express = require("express");
const router = express.Router();

// Import route handlers
const shillCategoryRoutes = require("./shillCategoryRoutes");
const shillBoardRoutes = require("./shillBoardRoutes");
const tokenRoutes = require("./token");
const userWalletRoutes = require("./userWalletRoutes")
const votesRoutes = require("./votesRoutes");

router.use("/shill-category",shillCategoryRoutes);
router.use("/shill-board",shillBoardRoutes);
router.use("/tokens",tokenRoutes);
router.use("/user-wallet",userWalletRoutes)
router.use("/votes",votesRoutes);


module.exports = router;