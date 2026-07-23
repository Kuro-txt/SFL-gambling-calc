// --- GLOBAL APP STATE & SUPABASE CONFIGURATION ---
const SUPABASE_URL = "https://gtvglgeoznnrsdcfazpc.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dmdsZ2Vvem5ucnNkY2ZhenBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MTA4NzIsImV4cCI6MjEwMDI4Njg3Mn0.oKTNu5vXA2hJ4p9D-unvkeiF7tEyu1_PFVgnEigmKoo";
const BACKEND_URL = "https://sfl-calculator-backend.onrender.com";

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase initialized successfully!");
} else {
  console.error("❌ Supabase CDN failed to load.");
}

let currentUser = null;
let allPrices = {};
let basket = [];
let selectedItemKey = null;
let farmInventoryData = {};
let editingSnapshotDate = null;
let syncCooldownTimer = null;
let syncCount = 0;

const FLOWER_ICON = `<img src="./assets/flower.webp" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/sfl.png';" class="w-4 h-4 sfl-icon" alt="Flower Token">`;
const COIN_ICON = `<img src="./assets/coins.webp" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/coins.webp';" class="w-4 h-4 sfl-icon" alt="Coins">`;

const EXCLUDED_KEYWORDS = [
  'seed', 'axe', 'pickaxe', 'rod', 'shovel', 'drill', 
  'worm', 'wiggler', 'grub', 'fertilizer', 'mix', 
  'bait', 'potion', 'feed', 'box', 'chest'
];

function isExcludedItem(itemName) {
  if (!itemName) return true;
  const lower = itemName.toLowerCase();
  return EXCLUDED_KEYWORDS.some(kw => lower.includes(kw));
}

function isSnapshotEligible(itemName) {
  let clean = itemName.replace(/^\[.*?\]\s*/, '').trim();
  return !isExcludedItem(clean);
}

const BETTY_SHOP_PRICES = {
  "sunflower": 0.02, "potato": 0.14, "rhubarb": 0.24, "pumpkin": 0.4,
  "zucchini": 0.4, "carrot": 0.8, "yam": 0.8, "cabbage": 1.5,
  "broccoli": 1.5, "soybean": 2.3, "beetroot": 2.8, "pepper": 3,
  "cauliflower": 4.25, "parsnip": 6.5, "eggplant": 8, "corn": 9,
  "onion": 10, "radish": 9.5, "wheat": 7, "turnip": 8, "kale": 10,
  "artichoke": 12, "barley": 12, "saltwort": 50, "tomato": 2,
  "lemon": 6, "blueberry": 12, "orange": 18, "apple": 25,
  "banana": 25, "celestine": 200, "lunara": 500, "duskberry": 1000,
  "grape": 240, "rice": 320, "olive": 400
};

function getBettyUnitPrice(itemName) {
  let clean = itemName.replace(/^\[.*?\]\s*/, '').toLowerCase().trim();
  return BETTY_SHOP_PRICES[clean] !== undefined ? BETTY_SHOP_PRICES[clean] : null;
}

function formatFourDecimals(val) {
  let num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '0.0000';
  return num.toFixed(4);
}

function roundUpToOneDecimal(val) {
  let num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num < 0.01) return 0;
  return Math.ceil(num * 10) / 10;
}

function roundUpToThreeDecimals(val) {
  let num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num < 0.0001) return 0;
  return Math.ceil(num * 1000) / 1000;
}

function roundUpToTwoDecimals(val) {
  let num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num < 0.01) return 0;
  return Math.ceil(num * 100) / 100;
}
