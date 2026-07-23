const express = require('express');
const axios = require('axios');
const router = express.Router();

// GET /api/nfts
router.get('/nfts', async (req, res) => {
  try {
    const response = await axios.get('https://sfl.world/api/v1/nfts', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://sfl.world/'
      },
      timeout: 12000
    });

    const rawData = response.data;
    let itemsArray = [];

    if (Array.isArray(rawData)) {
      itemsArray = rawData;
    } else if (rawData && typeof rawData === 'object') {
      itemsArray = rawData.data || rawData.nfts || rawData.items || Object.values(rawData);
    }

    const cleanedList = itemsArray.map(item => {
      const name = item.name || item.title || 'Unknown NFT';
      const price = parseFloat(item.floor ?? item.price ?? item.lastSalePrice ?? 0) || 0;
      const boost = item.boost_text || item.boost || (item.have_boost ? "Boost Active" : "No Boost");

      return {
        name: String(name).trim(),
        price: price,
        boost: String(boost).trim()
      };
    }).filter(item => item.name !== 'Unknown NFT');

    return res.json(cleanedList);
  } catch (err) {
    console.error('[NFT API ERROR]:', err.message);
    return res.status(500).json({ 
      error: `Failed to fetch NFTs: ${err.message}` 
    });
  }
});

module.exports = router;
