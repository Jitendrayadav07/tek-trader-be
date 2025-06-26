// index.js
const express = require("express");
const router = express.Router();

// Import route handlers
const shillCategoryRoutes = require("./shillCategoryRoutes");
const shillBoardRoutes = require("./shillBoardRoutes");
const tokenRoutes = require("./token");

router.use("/shill_category",shillCategoryRoutes);
router.use("/shill_board",shillBoardRoutes);
router.use("/tokens",tokenRoutes);


module.exports = router;