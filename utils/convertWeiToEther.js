const { formatEther } = require('ethers');

const convertWeiToEther = (amount_in_wei) => {
    const etherValue = formatEther(amount_in_wei);
    return etherValue;
}

module.exports = { convertWeiToEther };