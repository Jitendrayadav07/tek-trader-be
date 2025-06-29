const { convertWeiToEther } = require('./convertWeiToEther');
const { parseEther } = require('ethers');
const db = require('../config/db.config');


const calculatePriceEtherForSubsequentTransactions = async (token_id, current_amount, avax_price_at_time_of_transaction, transferredAvax, initialBuyData) => {
    try {
        // Use the initial buy data passed as parameter instead of querying
        if (!initialBuyData) {
            return null;
        }

        const _initialSupply = +convertWeiToEther(initialBuyData.amount);
        const _initialPriceAfterEth = initialBuyData.price_after_eth;

        const absolute_value = calculateAbsoluteValue(_initialPriceAfterEth, _initialSupply)

        
    
        const getSumOfValues = await getSumOfTotalBuyAndSell(db.sequelize, token_id)
        const total_buy = +convertWeiToEther(getSumOfValues[0].total_buy);
        const total_sell = +convertWeiToEther(getSumOfValues[0].total_sell);

        const ether_value = convertWeiToEther(current_amount);
        
        // console.log("total buy", transferredAvax,parseEther(ether_value.toString()).toString())
        
        const price_eth =  transferredAvax  / parseEther(ether_value.toString()).toString(); 
        const price_usd = price_eth * avax_price_at_time_of_transaction

        const price_after_eth = calculateFurtherTransactions(absolute_value,(total_buy - total_sell + +convertWeiToEther(current_amount)))
        const price_after_usd = price_after_eth * avax_price_at_time_of_transaction;
        // let calc_price_eth = calculateFurtherTransactions(absolute_value, total_buy + +convertedInitalSupply - total_sell)
    
        return {price_eth, price_usd, price_after_eth, price_after_usd}
    }catch(err) {
        console.log(err)
    }

}


const getSumOfTotalBuyAndSell = async (sequelize, token_id) => {
    let getVolume = `SELECT
        SUM(
            CASE 
            WHEN action IN ('buy', 'initial buy') THEN amount::NUMERIC 
            ELSE 0::NUMERIC 
            END
        ) AS total_buy,
        SUM(
            CASE 
            WHEN action = 'sell' THEN amount::NUMERIC 
            ELSE 0::NUMERIC 
            END
        ) AS total_sell
        FROM public.arena_trades
        WHERE token_id = ${token_id}
        AND status = 'success'`;
    
    return await sequelize.query(getVolume, { type: sequelize.QueryTypes.SELECT })
}

const calculateInitialTransaction = (price_eth) => {
    const price_after_eth = price_eth * 3e18;
    return price_after_eth
}

const calculateAbsoluteValue = (price_after_eth, _supplyInitial) => {
    let absolute = price_after_eth / (_supplyInitial ** 2)
    return absolute
}

function calculateFurtherTransactions(absolute_value, sum_of_total_supply) {
    let res = absolute_value * (sum_of_total_supply ** 2)
    return res;
}



module.exports = {  calculatePriceEtherForSubsequentTransactions };