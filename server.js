const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// In-memory set of farm IDs registered for daily auto sync
let registeredFarms = new Set();

// Health Check
app.get('/', (req, res) => {
  res.send('🌻 SFL Calculator Backend Server is Active!');
});

// Proxy Endpoint 1: Fetches live farm inventory from Sunflower Land API with browser headers
app.get('/api/get-farm', async (req, res) => {
  const { farmId } = req.query;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID is required.' });
  }

  try {
    const response = await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000 // 8 second timeout
    });

    return res.json(response.data);
  } catch (err) {
    console.error(`[SFL API ERROR] Farm #${farmId}:`, err.response?.status, err.response?.data || err.message);

    if (err.response?.status === 404) {
      return res.status(404).json({ error: `Farm #${farmId} does not exist on Sunflower Land.` });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Sunflower Land API rate limit reached. Please wait a minute.' });
    }

    return res.status(500).json({ 
      error: `SFL API Error (${err.response?.status || 'Timeout'}): ${err.message}` 
    });
  }
});

// Proxy Endpoint 2: Fallback endpoint for item price data
app.get('/api/get-data', async (req, res) => {
  try {
    const defaultPrices = {
      "Sunflower": 0.02, "Potato": 0.14, "Pumpkin": 0.4, "Carrot": 0.8,
      "Cabbage": 1.5, "Beetroot": 2.8, "Cauliflower": 4.25, "Parsnip": 6.5,
      "Eggplant": 8.0, "Corn": 9.0, "Radish": 9.5, "Wheat": 7.0, "Kale": 10.0
    };
    return res.json(defaultPrices);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch price data.' });
  }
});

// API Endpoint: Register Farm for 00:00 UTC Auto-Sync
app.post('/api/register-auto-sync', (req, res) => {
  const { farmId } = req.body;

  if (!farmId) {
    return res.status(400).json({ success: false, error: 'Farm ID is required.' });
  }

  registeredFarms.add(String(farmId));
  console.log(`[REGISTER] Farm #${farmId} registered for 00:00 UTC Cloud Auto Sync.`);

  return res.json({ 
    success: true, 
    message: `Farm #${farmId} registered for daily 00:00 UTC sync!` 
  });
});

// API Endpoint: Unregister Farm
app.post('/api/unregister-auto-sync', (req, res) => {
  const { farmId } = req.body;
  if (farmId) {
    registeredFarms.delete(String(farmId));
    console.log(`[UNREGISTER] Farm #${farmId} disabled Auto Sync.`);
  }
  return res.json({ success: true });
});

// Cron Job: 00:00 UTC Daily Auto-Sync
cron.schedule('0 0 * * *', async () => {
  console.log(`⏰ [00:00 UTC] Running daily sync for ${registeredFarms.size} farms...`);

  for (const farmId of registeredFarms) {
    try {
      console.log(`⏳ Auto-syncing Farm #${farmId}...`);
      await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(`✅ [SYNC SUCCESS] Farm #${farmId} synced.`);
    } catch (err) {
      console.error(`❌ [SYNC ERROR] Farm #${farmId}: ${err.message}`);
    }
  }
}, {
  timezone: "UTC"
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 SFL Backend Server listening on port ${PORT}`);
});
