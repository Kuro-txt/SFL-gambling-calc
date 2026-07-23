const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Admin Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

// Excluded Keywords Filter
const EXCLUDED_KEYWORDS = [
  'seed', 'axe', 'pickaxe', 'rod', 'shovel', 'drill', 
  'worm', 'wiggler', 'grub', 'fertilizer', 'mix', 
  'bait', 'potion', 'feed', 'box', 'chest',
  'updated', 'created', 'id'
];

function isExcludedItem(itemName) {
  if (!itemName) return true;
  const lower = itemName.toLowerCase();
  return EXCLUDED_KEYWORDS.some(kw => lower.includes(kw));
}

// Unified Key Normalizer (Strips [Crop], [Resource], etc.)
function normalizeKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey)
    .replace(/^\[.*?\]\s*/, '')
    .toLowerCase()
    .trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };

    const cleanUserKey = (apiKey && apiKey !== 'undefined' && apiKey !== 'null') ? apiKey.trim() : null;
    const effectiveApiKey = cleanUserKey || process.env.SFL_API_KEY;

    if (effectiveApiKey) {
      headers['x-api-key'] = effectiveApiKey;
      headers['Authorization'] = `Bearer ${effectiveApiKey}`;
    }

    const response = await axios.get(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      headers,
      timeout: 8000
    });

    return res.json(response.data);
  } catch (err) {
    console.error(`[SFL API ERROR] Farm #${farmId}:`, err.response?.status, err.message);

    if (err.response?.status === 429) {
      return res.status(429).json({ 
        error: '⚠️ Server API rate limit reached! Please wait a few minutes, or paste your personal SFL API Key.' 
      });
    }

    if (err.response?.status === 401) {
      return res.status(401).json({ error: '❌ 401 Unauthorized: Invalid API Key or Token provided.' });
    }

    if (err.response?.status === 404) {
      return res.status(404).json({ error: `❌ Farm #${farmId} does not exist.` });
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

// Proxy Endpoint 3: Live NFT Catalog (Safe depth-capped extraction)
app.get('/api/nfts', async (req, res) => {
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
    let itemsList = [];

    function extractItems(node, depth = 0) {
      if (!node || depth > 8) return;
      if (Array.isArray(node)) {
        node.forEach(child => extractItems(child, depth + 1));
      } else if (typeof node === 'object') {
        if (node.name || node.title) {
          const name = node.name || node.title;
          const price = parseFloat(node.floor ?? node.price ?? node.lastSalePrice ?? 0) || 0;
          const boost = node.boost_text || node.boost || (node.have_boost ? "Boost Active" : "No Boost");

          itemsList.push({
            name: String(name).trim(),
            price: price,
            boost: String(boost).trim()
          });
        } else {
          Object.values(node).forEach(child => extractItems(child, depth + 1));
        }
      }
    }

    extractItems(rawData);

    const uniqueMap = new Map();
    itemsList.forEach(item => {
      if (!uniqueMap.has(item.name.toLowerCase())) {
        uniqueMap.set(item.name.toLowerCase(), item);
      }
    });

    return res.json(Array.from(uniqueMap.values()));
  } catch (err) {
    console.error('[NFT API ERROR]:', err.message);
    return res.status(500).json({ error: `Failed to fetch NFTs from sfl.world: ${err.message}` });
  }
});

// CRON ENDPOINT: Daily Snapshot Trigger (Protected with key check)
app.get('/api/trigger-daily-baseline', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.query.key !== cronSecret) {
    return res.status(403).json({ error: 'Unauthorized cron trigger.' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client not initialized on server.' });
  }

  try {
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, farm_id')
      .not('farm_id', 'is', null);

    if (profileErr) throw profileErr;
    if (!profiles || profiles.length === 0) {
      return res.json({ message: 'No registered profiles found to snapshot.' });
    }

    const todayDate = new Date().toISOString().split('T')[0];
    let successCount = 0;
    let errors = [];

    for (const profile of profiles) {
      if (!profile.farm_id) continue;

      let response = null;
      let attempts = 0;
      const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
      
      if (process.env.SFL_API_KEY) {
        headers['x-api-key'] = process.env.SFL_API_KEY;
        headers['Authorization'] = `Bearer ${process.env.SFL_API_KEY}`;
      }

      // Retry mechanism for rate limits (429)
      while (attempts < 2) {
        try {
          response = await axios.get(`https://api.sunflower-land.com/community/farms/${profile.farm_id}`, {
            headers,
            timeout: 10000
          });
          break; // Success! Exit retry loop
        } catch (fetchErr) {
          attempts++;
          if (fetchErr.response?.status === 429 && attempts < 2) {
            console.warn(`[CRON 429] Rate limited on Farm #${profile.farm_id}. Retrying in 8s...`);
            await sleep(8000); // Back off for 8 seconds
          } else {
            throw fetchErr;
          }
        }
      }

      try {
        const data = response.data;
        const rawInventory = 
          data?.inventory || 
          data?.farm?.inventory || 
          data?.state?.inventory || 
          data?.data?.inventory || 
          {};

        let cleanBaseline = {};
        for (let key in rawInventory) {
          if (!isExcludedItem(key)) {
            let itemVal = rawInventory[key];
            let val = typeof itemVal === 'number' ? itemVal : parseFloat(itemVal?.amount || itemVal || 0);
            
            if (val > 0) {
              const cleanKey = normalizeKey(key);
              cleanBaseline[cleanKey] = Math.ceil(val * 10) / 10;
            }
          }
        }

        const { error: insertErr } = await supabaseAdmin
          .from('preharvest_baselines')
          .upsert({
            user_id: profile.id,
            farm_id: profile.farm_id,
            snapshot_date: todayDate,
            stock: cleanBaseline
          }, { onConflict: 'user_id,snapshot_date' });

        if (insertErr) throw insertErr;
        successCount++;
      } catch (err) {
        console.error(`Baseline snapshot failed for Farm #${profile.farm_id}:`, err.message);
        errors.push({ farm_id: profile.farm_id, error: err.message });
      }

      // 🛑 Stagger requests by 4.5 seconds to prevent rate limits
      await sleep(4500);
    }

    return res.json({
      message: `00:00 UTC Snapshot Complete! Saved ${successCount}/${profiles.length} baselines.`,
      errors
    });
  } catch (err) {
    console.error('[CRON BASELINE ERROR]:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
