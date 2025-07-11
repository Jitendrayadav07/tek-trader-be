// utils/starsArenaApi.js
const axios = require('axios');

const fetchStarsArenaCommunities = async (search) => {
  try {
    const response = await axios.get(
      `https://api.starsarena.com/communities/search?searchString=${encodeURIComponent(search)}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TOKEN}`
        }
      }
    );
    return response.data.communities;
  } catch (error) {
    console.error("StarsArena API error:", error);
    throw error;
  }
};

module.exports = fetchStarsArenaCommunities;

