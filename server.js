const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Keywords to filter out seeds, tools, and non-sellable consumables
const EXCLUDED_KEYWORDS = [
  'seed', 'axe', 'pickaxe', 'rod', 'shovel', 'drill', 
  'worm', 'wiggler', 'grub', 'fertilizer', 'mix', 'root', 
  'bait', 'potion', 'feed', 'box', 'chest'
];

function isExcludedItem(itemName) {
  if (!itemName) return true;
  const lower = itemName.toLowerCase();
  return EXCLUDED_KEYWORDS.some(kw => lower.includes(kw));
}

// Health Check
app.get('/', (req, res) => {
  res.send('🌻 SFL Resource Calculator Backend Active');
});

// Proxy Endpoint 1: Fetches live farm inventory from SFL API
app.get('/api/get-farm', async (req, res) => {
  const { farmId, apiKey } = req.query;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID is required.' });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json'
    };

    if (apiKey && apiKey !== 'undefined' && apiKey !== 'null') {
      headers['x-api-key'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      headers,
      timeout: 8000
    });

    return res.json(response.data);
  } catch (err) {
    console.error(`[SFL API ERROR] Farm #${farmId}:`, err.response?.status, err.message);

    if (err.response?.status === 401) {
      return res.status(401).json({ error: '401 Unauthorized: Valid API Key/Token required for this farm.' });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `Farm #${farmId} does not exist.` });
    }

    return res.status(500).json({ 
      error: `SFL API Error (${err.response?.status || 'Timeout'}): ${err.message}` 
    });
  }
});

// Proxy Endpoint 2: Fetches Live Prices from sfl.world
app.get('/api/get-data', async (req, res) => {
  const fallbackCatalog = {
    "Sunflower": 0.0002, "Potato": 0.0014, "Rhubarb": 0.0024, "Pumpkin": 0.0040, 
    "Zucchini": 0.0040, "Carrot": 0.0080, "Yam": 0.0080, "Cabbage": 0.0150, 
    "Broccoli": 0.0150, "Soybean": 0.0230, "Beetroot": 0.0280, "Pepper": 0.0300, 
    "Cauliflower": 0.0425, "Parsnip": 0.0650, "Eggplant": 0.0800, "Corn": 0.0900, 
    "Onion": 0.1000, "Radish": 0.0950, "Wheat": 0.0700, "Turnip": 0.0800, 
    "Kale": 0.1000, "Artichoke": 0.1200, "Barley": 0.1200, "Apple": 0.0230, 
    "Tomato": 0.0020, "Lemon": 0.0060, "Blueberry": 0.0120, "Orange": 0.0180, 
    "Banana": 0.0250, "Grape": 0.2400, "Rice": 0.3200, "Olive": 0.4000,
    "Duskberry": 1.0000, "Lunara": 0.5000, "Celestine": 0.2000, "Saltwort": 0.0500,
    "Wood": 0.0100, "Stone": 0.0200, "Iron": 0.0800, "Gold": 0.3500, 
    "Crimstone": 1.2000, "Sunstone": 5.0000, "Oil": 0.0500,
    "Egg": 0.0150, "Milk": 0.0300, "Honey": 0.0400, "Feather": 0.0200, "Wool": 0.0500
  };

  try {
    const response = await axios.get('https://sfl.world/api/v1/prices', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
      timeout: 8000
    });

    let livePrices = response.data || {};
    let filteredPrices = {};

    for (let key in livePrices) {
      if (!isExcludedItem(key)) {
        filteredPrices[key] = livePrices[key];
      }
    }

    if (Object.keys(filteredPrices).length > 0) {
      return res.json(filteredPrices);
    }
  } catch (err) {
    console.log('[PRICE API INFO] Serving fallback prices.');
  }

  return res.json(fallbackCatalog);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
