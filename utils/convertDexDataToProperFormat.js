function convertDexDataToCustomFormat(dataArray) {
  const uniqueMap = new Map();

  for (const item of dataArray) {
    const contractAddress = item.baseToken.address?.toLowerCase(); // normalize casing
    if (!contractAddress || uniqueMap.has(contractAddress)) continue;

    uniqueMap.set(contractAddress, {
      name: item.baseToken.name || "",
      contract_address: contractAddress,
      lp_deployed: true,
      system_created: new Date().toISOString(),
      symbol: item.baseToken.symbol || "",
      pair_address: item.pairAddress || "",
      photo_url: item.info?.imageUrl || "",
      priceUsd: parseFloat(item.priceUsd),
      volume: item.volume?.h24?.toString() || "0",
      marketcap: item.marketCap?.toString() || "0"
    });
  }

  return Array.from(uniqueMap.values());
}

module.exports = convertDexDataToCustomFormat;
