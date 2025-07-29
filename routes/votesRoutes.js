const express = require("express");
const router = express.Router();

const votesController = require("../controllers/votesController");

router.post("/", votesController.createVote);
router.get("/", votesController.getVotes);

module.exports = router; 