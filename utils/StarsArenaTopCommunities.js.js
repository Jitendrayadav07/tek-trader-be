const axios = require('axios');

async function fetchStarsArenaTopCommunities(page, pageSize) {
  try {
    const response = await axios.get(
      'https://api.starsarena.com/communities/top',
      {
        params: {
          page,
          pageSize
        },
        headers: {
          'Authorization': `Bearer ${process.env.TOKEN}`,
        },
      }
    );
    return response.data.communities; 
  } catch (error) {
    console.error("Error fetching StarsArena top communities:", error);
    throw error;
  }
}

module.exports = fetchStarsArenaTopCommunities
