function formatCommunityData(communities = []) {
    return communities.map(community => ({
      name: community.name,
      contract_address: community.contractAddress,
      lp_deployed: community.isLP,
      system_created: community.createdOn,
      symbol: community.ticker,
      pair_address: community.pairAddress,
      internal_id: community.stats?.communityId,
      photo_url: community.photoURL,
      priceUsd: (community.stats?.marketCapUsd / community.stats?.totalSupply) * 1e18 || 0,
      volume: (community.stats?.buyVolume || 0) + (community.stats?.sellVolume || 0),
      marketCap: community.stats?.marketCapUsd || 0
    })).sort((a, b) => b.marketCap - a.marketCap);
  }
  
module.exports = formatCommunityData;