const { ethers } = require("ethers");

async function isContractAddress(address) {
    const provider = ethers.isAddress(address)
    return provider
}


module.exports = {
    isContractAddress,
};
