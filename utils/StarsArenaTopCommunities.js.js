const axios = require('axios');

async function fetchStarsArenaTopCommunities(page, pageSize) {
  try {
    const response = await axios.get(
      `https://api.starsarena.com/communities/top?page=${page}&pageSize=${pageSize}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ARENA_TOKEN}`,
        },
      }
    );
    return response.data.communities; 
  } catch (error) {
    console.error("Error fetching StarsArena top communities:", error.message);
    throw error;
  }
}

const transformTokenData = async (data) => {
  return Promise.all(data.map(async (token, index) => {
    const tokenMetadata = {
      photo_url: token.photoURL,
      description: token.description || " ",
      owner_twitter_handle: token.owner?.twitterHandle,
      owner_twitter_picture: token.owner?.twitterPicture,
      owner_twitter_followers: token.owner?.twitterFollowers,
    };

    const latest_price_eth = Number(token.stats?.price || 0) / 1e18;
    const avax_price = 1; // placeholder, replace with real AVAX/USD rate
    const latest_price_usd = latest_price_eth * avax_price;
    const latest_total_volume_eth = Number(token.stats?.buyVolume || 0) / 1e18;
    const latest_total_volume_usd = latest_total_volume_eth * avax_price;

    // Fetch holder count for this token
    let holderCount = 0;
    try {
      if (token.contractAddress) {
        const holderData = await getTokenHolderCount(token.contractAddress);
        holderCount = holderData.no_of_holders || 0;
      }
    } catch (error) {
      console.error(`Error fetching holder count for token ${token.contractAddress}:`, error.message);
      holderCount = 0;
    }

    return {
      row_id: token.id,
      tokens: token.isLP, // assuming this maps to `tokens.ip_deployed`
      creator_address: token.owner?.address?.toLowerCase(),
      contract_address: process.env.CONTRACT_ADDRESS,
      token_id: index.toString(), // no `internal_id` found, using index
      total_supply_eth: Number(token.stats?.totalSupply || 0) / 1e18,
      token_name: token.name,
      token_symbol: token.ticker,
      a: null,
      b: null,
      curve_scaler: 1,
      lp_deployed: token.isLP,
      lp_percentage: 1,
      sale_percentage: 0,
      pair_address: token.pairAddress?.toLowerCase(),
      token_contract_address: token.contractAddress?.toLowerCase(),
      create_time: Math.floor(new Date(token.createdOn).getTime() / 1000),
      transaction_hash: token.transactionHash,
      migration_time: null,
      migration_transaction_hash: null,
      photo_url: tokenMetadata.photo_url || null,
      description: tokenMetadata.description || " ",
      creator_twitter_handle:
        tokenMetadata.owner_twitter_handle === "burakarenqa"
          ? null
          : tokenMetadata.owner_twitter_handle,
      creator_twitter_pfp_url:
        tokenMetadata.owner_twitter_picture ===
        "https://static.starsarena.com/uploads/387d6390-ae77-1a15-ae42-142afaf024e61732639334845.png"
          ? null
          : tokenMetadata.owner_twitter_picture,
      creator_twitter_followers:
        tokenMetadata.owner_twitter_followers || null,
      latest_trade_absolute_order: 0,
      latest_price_eth: Number(latest_price_eth.toFixed(12)),
      latest_avax_price: Number(avax_price.toFixed(12)),
      latest_price_usd: Number(latest_price_usd.toFixed(12)),
      latest_total_volume_eth: Number(latest_total_volume_eth.toFixed(6)),
      latest_total_volume_usd: Number(latest_total_volume_usd.toFixed(6)),
      latest_transaction_count: 0,
      latest_holder_count: holderCount,
      latest_supply_eth: Number(
        (Number(token.stats?.totalSupply || 0) / 1e18).toFixed(6)
      ),
      tokens_by_creator: null,
      dexscreener_image_url: null,
      dexscreener_header: null,
      dexscreener_open_graph: null,
      dexscreener_website: null,
      dexscreener_social: null,
      dexscreener_last_updated: null,
      marketCap: Number(token.stats?.marketCap || 0) ,
      lastMarketCap: 0,
      marketCapUsd: token.stats?.marketCapUsd || 0 ,
    };
  }));
}

const getTokenHolderCount = async (contractAddress, page = 1, pageSize = 10) => {
  try {
    const response = await axios.get(
      `https://api.starsarena.com/communities/holders?page=${page}&contractAddress=${contractAddress}&pageSize=${pageSize}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ARENA_TOKEN}`,
        },
      }
    );
    
    return {
      no_of_holders: response.data.numberOfResults,
    }
  } catch (error) {
    console.error("Error fetching token holder count:", error.message);
    throw error;
  }
}


module.exports = {fetchStarsArenaTopCommunities, transformTokenData, getTokenHolderCount}
