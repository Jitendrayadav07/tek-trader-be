const { ethers } = require('ethers');
const Response = require("../classes/Response");
const db = require("../config/db.config");

const createVote = async (req, res) => {
    try {
        const { shill_id, up_vote, down_vote, contract_address, wallet_address } = req.body;

        const isValid = ethers.isAddress(wallet_address);
        if (!isValid) {
            return res.status(400).send(Response.sendResponse(false, null, "Invalid wallet address", 400));
        }
        // Validation for up_vote and down_vote
        if (!([0, 1].includes(up_vote)) || !([0, 1].includes(down_vote))) {
            return res.status(400).send(Response.sendResponse(false, null, "up_vote and down_vote must be 0 or 1", 400));
        }
        if ((up_vote === 1 && down_vote === 1) || (up_vote === 0 && down_vote === 0)) {
            return res.status(400).send(Response.sendResponse(false, null, "Either up_vote or down_vote must be 1, but not both or neither", 400));
        }
        // Check if a vote already exists for this wallet_address and shill_id
        let vote = await db.Votes.findOne({ where: { shill_id, wallet_address } });
        if (vote) {
            // Update the vote (allow switching between upvote and downvote)
            await vote.update({ up_vote, down_vote });
            return res.status(200).send(Response.sendResponse(true, vote, "Vote updated", 200));
        }
        const response = await db.Votes.create({ shill_id, up_vote, down_vote, contract_address, wallet_address });
        return res.status(201).send(Response.sendResponse(true, response, null, 201));
    } catch (err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
    }
};

const getVotes = async (req, res) => {
    try {
        const response = await db.Votes.findAll();
        return res.status(200).send(Response.sendResponse(true, response, null, 200));
    } catch (err) {
        return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
    }
};


module.exports = {
    createVote,
    getVotes
}; 