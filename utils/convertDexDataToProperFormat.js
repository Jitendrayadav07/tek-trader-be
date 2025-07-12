
function convertDexDataToCustomFormat(dataArray) {
    return dataArray.map(item => {
      return {
        name: item.baseToken.name || "",
        contract_address: item.baseToken.address || "",
        lp_deployed: true,
        system_created: new Date().toISOString(), // or customize if needed
        symbol: item.baseToken.symbol || "",
        pair_address: item.pairAddress || "",
        photo_url: item.info?.imageUrl || "",
        priceUsd: parseFloat(item.priceUsd),
        volume: item.volume?.h24?.toString() || "0",
        marketcap: item.marketCap?.toString() || "0"
      };
    });
  }

  module.exports = convertDexDataToCustomFormat