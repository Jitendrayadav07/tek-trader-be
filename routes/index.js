// index.js
const express = require("express");
const router = express.Router();

// Import route handlers
const shillCategoryRoutes = require("./shillCategoryRoutes");
const shillBoardRoutes = require("./shillBoardRoutes");

router.use("/shill_category",shillCategoryRoutes);
router.use("/shill_board",shillBoardRoutes);

module.exports = router;