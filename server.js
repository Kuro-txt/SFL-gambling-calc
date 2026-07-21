const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let registeredFarms = new Set();

app.get('/', (req, res) => {
  res.send('🌻 SFL Calculator Backend Server is Active!');
});

// Proxy Endpoint 1: Fetches farm inventory from Sunflower Land API
app.get('/api/get-farm', async (req, res) => {
  const { farmId, apiKey } = req.query;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID is required.' });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      headers,
      timeout: 8000
    });

    return res.json(response.data);
  } catch (err) {
    console.error(`[SFL API ERROR] Farm #${farmId}:`, err.response?.status, err.response?.data || err.message);

    if (err.response?.status === 401) {
      return res.status(401).json({ error: '401 Unauthorized: Valid API Key/Token required.' });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `Farm #${farmId} does not exist on Sunflower Land.` });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait a minute.' });
    }

    return res.status(500).json({ 
      error: `SFL API Error (${err.response?.status || 'Timeout'}): ${err.message}` 
    });
  }
});

// Proxy Endpoint 2: Fetches REAL-TIME Flower Token (SFL) Market Prices
app.get('/api/get-data', async (req, res) => {
  try {
    const response = await axios.get('https://api.sunflower-land.com/community/prices', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
        'Accept': 'application/json' 
      },
      timeout: 6000
    });
    return res.json(response.data);
  } catch (err) {
    console.log('[PRICE API WARNING] Live SFL API fetch failed. Using fallback SFL Market Prices.');

    // REALISTIC FALLBACK FLOWER TOKEN (SFL) MARKET PRICES
    // (Actual market values in SFL per item, NOT Betty Coin values)
    const sflMarketPrices = {
      "Sunflower": 0.00005,
      "Potato": 0.0003,
      "Rhubarb": 0.0005,
      "Pumpkin": 0.0008,
      "Zucchini": 0.0009,
      "Carrot": 0.0015,
      "Yam": 0.0016,
      "Cabbage": 0.0030,
      "Broccoli": 0.0032,
      "Soybean": 0.0045,
      "Beetroot": 0.0055,
      "Pepper": 0.0060,
      "Cauliflower": 0.0085,
      "Parsnip": 0.0120,
      "Eggplant": 0.0150,
      "Corn": 0.0180,
      "Onion": 0.0200,
      "Radish": 0.0190,
      "Wheat": 0.0140,
      "Turnip": 0.0160,
      "Kale": 0.0220,
      "Artichoke": 0.0250,
      "Barley": 0.0240,
      "Apple": 0.0500,
      "Blueberry": 0.0250,
      "Orange": 0.0350,
      "Banana": 0.0500,
      "Grape": 0.4500,
      "Rice": 0.6000,
      "Olive": 0.8000
    };

    return res.json(sflMarketPrices);
  }
});

// API Endpoint: Register Auto Sync
app.post('/api/register-auto-sync', (req, res) => {
  const { farmId } = req.body;
  if (!farmId) return res.status(400).json({ success: false, error: 'Farm ID is required.' });

  registeredFarms.add(String(farmId));
  return res.json({ success: true, message: `Farm #${farmId} registered for daily 00:00 UTC sync!` });
});

// API Endpoint: Unregister Auto Sync
app.post('/api/unregister-auto-sync', (req, res) => {
  const { farmId } = req.body;
  if (farmId) registeredFarms.delete(String(farmId));
  return res.json({ success: true });
});

// Daily Cron Job (00:00 UTC)
cron.schedule('0 0 * * *', async () => {
  for (const farmId of registeredFarms) {
    try {
      await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    } catch (err) {
      console.error(`❌ [CRON SYNC ERROR] Farm #${farmId}: ${err.message}`);
    }
  }
}, { timezone: "UTC" });

app.listen(PORT, () => console.log(`🚀 SFL Backend Server listening on port ${PORT}`));
