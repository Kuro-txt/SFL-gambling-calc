//// --- LIVE PRICES, FARM SYNC, COMBOBOX & BASKET LOGIC ---

// Global Application State Initialization
window.basket = window.basket || [];
window.allPrices = window.allPrices || {};
window.farmInventoryData = window.farmInventoryData || {};
window.selectedItemKey = window.selectedItemKey || null;
window.syncCount = window.syncCount || 0;
window.syncCooldownTimer = window.syncCooldownTimer || null;

// Rounding & Formatting Helper Functions
function roundUpToOneDecimal(val) {
  return Math.ceil((parseFloat(val) || 0) * 10) / 10;
}

function roundUpToTwoDecimals(val) {
  return Math.ceil((parseFloat(val) || 0) * 100) / 100;
}

function roundUpToThreeDecimals(val) {
  return Math.ceil((parseFloat(val) || 0) * 1000) / 1000;
}

function formatFourDecimals(val) {
  return (parseFloat(val) || 0).toFixed(4);
}

// Fallback Betty NPC Unit Price Lookup
function getBettyUnitPrice(cleanName) {
  const bettyCatalog = {
    "sunflower": 0.02, "potato": 0.14, "pumpkin": 0.40, "carrot": 0.80,
    "cabbage": 1.50, "beetroot": 2.80, "cauliflower": 4.25, "parsnip": 6.50,
    "eggplant": 8.00, "corn": 9.00, "onion": 10.00, "radish": 9.50,
    "wheat": 7.00, "turnip": 8.00, "kale": 10.00, "artichoke": 12.00, "barley": 12.00
  };
  let key = (cleanName || '').toLowerCase().trim();
  return bettyCatalog[key] !== undefined ? bettyCatalog[key] : null;
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTaxRate = localStorage.getItem('sfl_tax_rate');
  const savedCoinRatio = localStorage.getItem('sfl_coin_ratio');

  const taxEl = document.getElementById('tax-select');
  const coinEl = document.getElementById('coin-ratio');

  if (savedTaxRate !== null && taxEl) taxEl.value = savedTaxRate;
  if (savedCoinRatio !== null && coinEl) coinEl.value = savedCoinRatio;

  loadPrices();
});

document.getElementById('tax-select')?.addEventListener('change', (e) => {
  localStorage.setItem('sfl_tax_rate', e.target.value);
  updateBasketTable();
});

document.getElementById('coin-ratio')?.addEventListener('input', (e) => {
  localStorage.setItem('sfl_coin_ratio', e.target.value);
  updateBasketTable();
  if (typeof renderWishlist === 'function') renderWishlist();
});

function loadPrices() {
  const backend = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
  fetch(`${backend}/api/get-data`)
    .then(res => res.json())
    .then(rawData => {
      allPrices = extractPrices(rawData);
    })
    .catch(() => console.warn("Using default fallback prices."));
}

function extractPrices(data) {
  let pricesMap = {};
  if (!data || typeof data !== 'object') return pricesMap;

  function searchObj(obj, prefix = '') {
    for (let key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      let val = obj[key];
      
      if (typeof isExcludedItem === 'function' && isExcludedItem(key)) continue;

      if (typeof val === 'number') {
        pricesMap[prefix + key] = val;
      } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
        pricesMap[prefix + key] = parseFloat(val);
      } else if (val && typeof val === 'object') {
        let p = val.price ?? val.sfl ?? val.sflPrice ?? val.flowerPrice ?? val.unitPrice;
        if (p !== undefined && p !== null) {
          pricesMap[prefix + key] = parseFloat(p) || 0;
        } else {
          let newPrefix = key.length <= 4 ? `[${key.toUpperCase()}] ` : '';
          searchObj(val, newPrefix);
        }
      }
    }
  }

  searchObj(data);
  return pricesMap;
}

function getItemStock(displayName) {
  let cleanSelected = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let invKey in farmInventoryData) {
    let cleanInvKey = invKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanInvKey === cleanSelected) {
      let val = farmInventoryData[invKey];
      let rawVal = typeof val === 'number' ? val : parseFloat(val?.amount || val || 0);
      return roundUpToOneDecimal(rawVal);
    }
  }
  return 0;
}

function startSyncCooldown() {
  const syncBtn = document.getElementById('import-farm-btn');
  if (!syncBtn) return;
  let timeLeft = 20;
  syncBtn.disabled = true;

  syncCooldownTimer = setInterval(() => {
    timeLeft--;
    if (timeLeft > 0) {
      syncBtn.textContent = `⏳ Please wait ${timeLeft}s...`;
    } else {
      clearInterval(syncCooldownTimer);
      syncBtn.disabled = false;
      syncBtn.textContent = '🔄 Sync Farm Quantities Now';
    }
  }, 1000);
}

document.getElementById('import-farm-btn')?.addEventListener('click', async () => {
  const farmIdEl = document.getElementById('farm-id');
  const apiKeyEl = document.getElementById('api-key');
  const status = document.getElementById('sync-status');

  const farmId = farmIdEl ? farmIdEl.value.trim() : '';
  const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';

  if (!farmId) {
    if (status) status.textContent = '❌ Please enter a Farm ID.';
    return;
  }

  if (status) status.textContent = '⏳ Fetching farm data...';
  
  syncCount++;
  if (syncCount >= 2) {
    startSyncCooldown();
  }

  try {
    const backend = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
    const url = `${backend}/api/get-farm?farmId=${encodeURIComponent(farmId)}&apiKey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP Error ${response.status}`);
    }

    const farmObj = data.farm?.farm || data.farm?.data || data.farm || data;
    farmInventoryData = farmObj?.inventory || {};

    let totalItemsCount = Object.keys(farmInventoryData).length;

    if (totalItemsCount > 0) {
      if (status) status.textContent = `✅ Synced ${totalItemsCount} item types from Farm #${farmId}!`;
      updateBasketTable();
    } else {
      if (status) status.textContent = `⚠️ Connected, but no inventory found on farm.`;
    }
  } catch (err) {
    if (status) status.textContent = err.message;
  }
});

const input = document.getElementById('combobox-input');
const menu = document.getElementById('combobox-menu');

if (input && menu) {
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    menu.innerHTML = '';

    const matches = Object.keys(allPrices)
      .filter(key => {
        if (typeof isExcludedItem === 'function' && isExcludedItem(key)) return false;
        let cleanKey = key.replace(/^\[.*?\]\s*/, '');
        return cleanKey.toLowerCase().includes(query) || key.toLowerCase().includes(query);
      })
      .sort((a, b) => a.replace(/^\[.*?\]\s*/, '').localeCompare(b.replace(/^\[.*?\]\s*/, '')));

    const flowerSymbol = typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : '🌸';

    if (matches.length === 0) {
      menu.innerHTML = '<li class="p-2 text-sfl-woodLight italic">No matching items found</li>';
    } else {
      matches.forEach(item => {
        let displayName = item.replace(/^\[.*?\]\s*/, '');
        let stock = getItemStock(displayName);
        let rawPrice = allPrices[item];
        let formattedPrice = formatFourDecimals(rawPrice);

        let stockBadge = stock > 0 
          ? `<span class="text-[11px] font-bold text-sfl-green bg-green-100 border border-sfl-green/30 px-1.5 py-0.5 rounded ml-1.5">Qty: ${stock.toFixed(1)}</span>`
          : `<span class="text-[11px] text-sfl-woodLight/60 ml-1.5">(0)</span>`;

        const li = document.createElement('li');
        li.className = 'p-2.5 hover:bg-amber-100 cursor-pointer transition flex justify-between items-center';
        li.innerHTML = `
          <div class="flex items-center">
            <span class="font-bold text-sfl-dirt">${displayName}</span>
            ${stockBadge}
          </div>
          <span class="text-sfl-green font-mono text-xs font-bold flex items-center gap-1">${formattedPrice} ${flowerSymbol}</span>
        `;
        li.addEventListener('click', () => selectItem(item, displayName));
        menu.appendChild(li);
      });
    }

    menu.classList.remove('hidden');
  });

  input.addEventListener('focus', () => input.dispatchEvent(new Event('input')));

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}

function selectItem(itemKey, displayName) {
  selectedItemKey = itemKey;
  let cleanName = displayName || itemKey.replace(/^\[.*?\]\s*/, '');

  if (input) input.value = cleanName;
  if (menu) menu.classList.add('hidden');

  const badgeEl = document.getElementById('selected-item-badge');
  const nameEl = document.getElementById('selected-item-name');
  const priceEl = document.getElementById('selected-item-price');
  const flowerSymbol = typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : '🌸';

  if (badgeEl) badgeEl.classList.remove('hidden');
  if (nameEl) nameEl.textContent = cleanName;
  if (priceEl) priceEl.innerHTML = `${formatFourDecimals(allPrices[itemKey])} ${flowerSymbol}`;

  let foundStock = getItemStock(cleanName);
  const qtyInput = document.getElementById('quantity');
  const hintEl = document.getElementById('inventory-hint');
  const stockCountEl = document.getElementById('stock-count');

  if (foundStock > 0) {
    if (qtyInput) qtyInput.value = foundStock.toFixed(1);
    if (hintEl) hintEl.classList.remove('hidden');
    if (stockCountEl) stockCountEl.textContent = foundStock.toFixed(1);
  } else {
    if (qtyInput) qtyInput.value = 1;
    if (hintEl) hintEl.classList.add('hidden');
  }
}

// ADD TO BASKET (Merges quantities if item already in basket)
document.getElementById('add-btn')?.addEventListener('click', () => {
  const rawQty = parseFloat(document.getElementById('quantity')?.value) || 0;
  const qty = roundUpToOneDecimal(rawQty);

  if (!selectedItemKey || qty <= 0) return;

  const unitPrice = allPrices[selectedItemKey] || 0;

  // Check if item is already in basket
  const existingIdx = basket.findIndex(entry => entry.item === selectedItemKey);

  if (existingIdx > -1) {
    basket[existingIdx].qty = roundUpToOneDecimal(basket[existingIdx].qty + qty);
    basket[existingIdx].subtotal = basket[existingIdx].qty * unitPrice;
  } else {
    const subtotal = unitPrice * qty;
    basket.push({ item: selectedItemKey, qty, unitPrice, subtotal });
  }

  updateBasketTable();

  if (input) input.value = '';
  selectedItemKey = null;
  
  const qtyEl = document.getElementById('quantity');
  if (qtyEl) qtyEl.value = 1;
  
  document.getElementById('selected-item-badge')?.classList.add('hidden');
  document.getElementById('inventory-hint')?.classList.add('hidden');
});

document.getElementById('clear-basket')?.addEventListener('click', () => {
  basket = [];
  updateBasketTable();
});

function updateBasketQuantity(index, newQtyVal) {
  let rawQty = parseFloat(newQtyVal) || 0;
  let newQty = roundUpToOneDecimal(rawQty);

  if (newQty <= 0) {
    removeItem(index);
    return;
  }

  basket[index].qty = newQty;
  basket[index].subtotal = basket[index].unitPrice * newQty;
  updateBasketTable();
}

function updateBasketTable() {
  const tbody = document.getElementById('basket-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let grandGrossTotal = 0;
  let totalBettyCoins = 0;
  let totalGrossRatioCoins = 0;

  const taxEl = document.getElementById('tax-select');
  const coinEl = document.getElementById('coin-ratio');

  const taxRate = taxEl ? (parseFloat(taxEl.value) || 0) : 0;
  const coinMultiplier = coinEl ? (parseFloat(coinEl.value) || 1000) : 1000;

  const flowerSymbol = typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : '🌸';
  const coinSymbol = typeof COIN_ICON !== 'undefined' ? COIN_ICON : '🪙';

  if (basket.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-sfl-woodLight italic">Your farm basket is empty!</td></tr>';
  } else {
    basket.forEach((entry, index) => {
      grandGrossTotal += entry.subtotal;

      let cleanName = entry.item.replace(/^\[.*?\]\s*/, '');
      let stock = getItemStock(cleanName);
      let bettyUnitPrice = getBettyUnitPrice(cleanName);

      let stockDisplay = stock > 0 
        ? `<span class="text-[10px] text-sfl-green font-semibold ml-1">(Stock: ${stock.toFixed(1)})</span>`
        : `<span class="text-[10px] text-sfl-woodLight/60 ml-1">(Stock: 0)</span>`;

      let bettyCoinsDisplay = `<span class="text-sfl-woodLight/70 font-normal italic text-[10px]">Unavailable</span>`;
      if (bettyUnitPrice !== null) {
        let itemBettyCoins = entry.qty * bettyUnitPrice;
        totalBettyCoins += itemBettyCoins;
        bettyCoinsDisplay = `<span class="inline-flex items-center gap-1">${roundUpToTwoDecimals(itemBettyCoins).toFixed(2)} ${coinSymbol}</span>`;
      }

      let itemNetFlowers = entry.subtotal * (1 - taxRate);
      let itemNetRatioCoins = itemNetFlowers * coinMultiplier;
      
      totalGrossRatioCoins += (entry.subtotal * coinMultiplier);

      let ratioCoinsDisplay = entry.unitPrice > 0 
        ? `<span class="inline-flex items-center gap-1">${roundUpToTwoDecimals(itemNetRatioCoins).toFixed(2)} ${coinSymbol}</span>` 
        : `<span class="text-sfl-woodLight/70 font-normal italic text-[10px]">-</span>`;

      let tr = document.createElement('tr');
      tr.className = "hover:bg-amber-50/50 transition";
      
      let subtotalDisplay = entry.unitPrice > 0 
        ? `<span class="inline-flex items-center gap-1">${roundUpToThreeDecimals(entry.subtotal).toFixed(3)} ${flowerSymbol}</span>` 
        : `<span class="text-sfl-woodLight font-normal">Untradeable</span>`;

      tr.innerHTML = `
        <td class="px-2 py-2.5 font-bold text-sfl-dirt">
          <span>${cleanName}</span>
          ${stockDisplay}
        </td>
        <td class="px-1 py-2 font-mono">
          <input type="number" value="${entry.qty.toFixed(1)}" min="0.1" step="0.1"
            onchange="updateBasketQuantity(${index}, this.value)"
            class="w-14 sfl-input rounded px-1 py-0.5 text-xs font-bold text-sfl-dirt text-center focus:outline-none focus:ring-1 focus:ring-sfl-gold">
        </td>
        <td class="px-2 py-2.5 text-sfl-green font-bold">${subtotalDisplay}</td>
        <td class="px-2 py-2.5 text-sfl-gold font-bold">${bettyCoinsDisplay}</td>
        <td class="px-2 py-2.5 text-amber-600 font-bold">${ratioCoinsDisplay}</td>
        <td class="px-1 py-2.5 text-right">
          <button onclick="removeItem(${index})" class="text-sfl-accent hover:text-red-700 font-bold px-1 cursor-pointer">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const taxAmount = grandGrossTotal * taxRate;
  const netFlowers = grandGrossTotal - taxAmount;
  const totalNetRatioCoins = totalGrossRatioCoins * (1 - taxRate);

  const grossEl = document.getElementById('gross-flowers');
  const taxDeductEl = document.getElementById('tax-deduction');
  const totalFlowersEl = document.getElementById('total-flowers');
  const bettyCoinsEl = document.getElementById('total-betty-coins');
  const ratioCoinsEl = document.getElementById('total-ratio-coins');
  const itemCountEl = document.getElementById('item-count');

  if (grossEl) grossEl.textContent = `${roundUpToThreeDecimals(grandGrossTotal).toFixed(3)} Flowers`;
  if (taxDeductEl) taxDeductEl.textContent = `${roundUpToThreeDecimals(taxAmount).toFixed(3)} Flowers`;
  if (totalFlowersEl) totalFlowersEl.textContent = `${roundUpToThreeDecimals(netFlowers).toFixed(3)}`;
  if (bettyCoinsEl) bettyCoinsEl.textContent = `${roundUpToTwoDecimals(totalBettyCoins).toFixed(2)}`;
  if (ratioCoinsEl) ratioCoinsEl.textContent = `${roundUpToTwoDecimals(totalNetRatioCoins).toFixed(2)}`;
  if (itemCountEl) itemCountEl.textContent = `${basket.length} Item${basket.length === 1 ? '' : 's'}`;
}

function removeItem(index) {
  basket.splice(index, 1);
  updateBasketTable();
}

// --- CRYPTO DONATION CLIPBOARD COPY ---
document.getElementById('donate-btn')?.addEventListener('click', async () => {
  const donationAddress = "0xE32d234D63998F5078de9A7E2303233699276642";
  const donateBtn = document.getElementById('donate-btn');

  try {
    await navigator.clipboard.writeText(donationAddress);
    
    // Visual text feedback
    const originalText = donateBtn.textContent;
    donateBtn.textContent = "Copied!";
    donateBtn.classList.add('text-green-600');

    setTimeout(() => {
      donateBtn.textContent = originalText;
      donateBtn.classList.remove('text-green-600');
    }, 2000);

  } catch (err) {
    prompt("Copy your donation address below:", donationAddress);
  }
});
