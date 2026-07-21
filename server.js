const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing (CORS) for all domains
app.use(cors());
app.use(express.json());

// In-memory list of registered farm IDs for auto-sync
let registeredFarms = new Set();

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🌻 SFL Calculator Backend Server is Active!');
});

// Proxy Endpoint: Bypasses browser CORS rules by fetching live farm inventory on server-side
app.get('/api/get-farm', async (req, res) => {
  const { farmId } = req.query;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID is required.' });
  }

  try {
    const response = await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      headers: {
        'User-Agent': 'SFL-Calculator-App/1.0'
      }
    });

    return res.json(response.data);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.error(`[PROXY 404] Farm #${farmId} not found on Sunflower Land API.`);
      return res.status(404).json({ error: `Farm #${farmId} not found.` });
    }
    console.error(`[PROXY ERROR] Farm #${farmId}:`, err.message);
    return res.status(500).json({ error: 'Failed to fetch farm data from Sunflower Land API.' });
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
    message: `Farm #${farmId} successfully registered for daily 00:00 UTC sync!` 
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

// Daily Cron Job running at 00:00 UTC ("0 0 * * *")
cron.schedule('0 0 * * *', async () => {
  console.log(`⏰ [00:00 UTC] Executing daily sync for ${registeredFarms.size} farms...`);

  for (const farmId of registeredFarms) {
    try {
      console.log(`⏳ Auto-syncing Farm #${farmId}...`);
      await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`);
      console.log(`✅ [SYNC SUCCESS] Farm #${farmId} synced successfully.`);
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
