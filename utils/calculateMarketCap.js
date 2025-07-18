/**
 * Calculates the market capitalization for a token.
 * @param {number|string|bigint} supplyEth - The total supply in ETH (or token base units, as a number, string, or bigint).
 * @param {number|string} priceUsd - The price per token in USD.
 * @returns {number} The market capitalization in USD.
 */
function calculateMarketCap(supplyEth, priceUsd) {
  // Convert supply to number if needed
  let supply = typeof supplyEth === 'bigint' ? Number(supplyEth) : parseFloat(supplyEth);
  let price = parseFloat(priceUsd);
  if (isNaN(supply) || isNaN(price)) return 0;
  return supply * price;
}

function getSupplyEth(initialBuyAmount, totalBuyAmount, totalSellAmount) {
  const latest_supply_wei = initialBuyAmount + totalBuyAmount - totalSellAmount;
  const latest_supply_eth = Number(latest_supply_wei) / 1e18;
  return latest_supply_eth
}

function sumAmountByAction(trades, action) {
  return trades
    .filter((t) => t.action === action)
    .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);
}

module.exports = {calculateMarketCap, sumAmountByAction, getSupplyEth}; 