const axios = require('axios');

class DexScreenerService {
  static async fetchMarketData(pairAddress) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${pairAddress}`;
      const response = await axios.get(url);
      const pairInfo = response.data?.pair;

      if (pairInfo) {
        return {
          priceUsd: pairInfo.priceUsd || null,
          volume: pairInfo.volume || null,
          priceChange: pairInfo.priceChange || null,
          liquidity: pairInfo.liquidity || null,
          fdv: pairInfo.fdv || null,
          marketCap: pairInfo.marketCap || null
        };
      }
    } catch (err) {
      console.error(`Dex API error for pair ${pairAddress}:`, err.message);
    }

    // Return defaults if error
    return {
      priceUsd: null,
      volume: null,
      priceChange: null,
      liquidity: null,
      fdv: null,
      marketCap: null
    };
  }
}

module.exports = DexScreenerService;
