const axios = require('axios');

async function fetchStarsArenaHolderCommunities(contract_address, page, pageSize) {
    try {
      const response = await axios.get(
        `https://api.starsarena.com/communities/holders`,
        {
          params: {
            contractAddress: contract_address,
            page,
            pageSize
          },
          headers: {
            'Authorization': `Bearer ${process.env.TOKEN}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching StarsArena top communities:", error.response?.data || error.message);
      throw error;
    }
}
  
module.exports = fetchStarsArenaHolderCommunities
