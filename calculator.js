//// --- LIVE PRICES, FARM SYNC, COMBOBOX & BASKET LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const savedTaxRate = localStorage.getItem('sfl_tax_rate');
  const savedCoinRatio = localStorage.getItem('sfl_coin_ratio');

  if (savedTaxRate !== null) document.getElementById('tax-select').value = savedTaxRate;
  if (savedCoinRatio !== null) document.getElementById('coin-ratio').value = savedCoinRatio;

  loadPrices();
});

document.getElementById('tax-select').addEventListener('change', (e) => {
  localStorage.setItem('sfl_tax_rate', e.target.value);
  updateBasketTable();
});

document.getElementById('coin-ratio').addEventListener('input', (e) => {
  localStorage.setItem('sfl_coin_ratio', e.target.value);
  updateBasketTable();
  if (typeof renderWishlist === 'function') renderWishlist();
});

function loadPrices() {
  fetch(`${BACKEND_URL}/api/get-data`)
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
      
      if (isExcludedItem(key)) continue;

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
      let rawVal = typeof val === 'number' ? val : parseFloat(val.amount || val || 0);
      return roundUpToOneDecimal(rawVal);
    }
  }
  return 0;
}

function startSyncCooldown() {
  const syncBtn = document.getElementById('import-farm-btn');
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

document.getElementById('import-farm-btn').addEventListener('click', async () => {
  const farmId = document.getElementById('farm-id').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const status = document.getElementById('sync-status');

  if (!farmId) {
    status.textContent = '❌ Please enter a Farm ID.';
    return;
  }

  status.textContent = '⏳ Fetching farm data...';
  
  syncCount++;
  if (syncCount >= 2) {
    startSyncCooldown();
  }

  try {
    const url = `${BACKEND_URL}/api/get-farm?farmId=${encodeURIComponent(farmId)}&apiKey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP Error ${response.status}`);
    }

    const farmObj = data.farm?.farm || data.farm?.data || data.farm || data;
    farmInventoryData = farmObj?.inventory || {};

    let totalItemsCount = Object.keys(farmInventoryData).length;

    if (totalItemsCount > 0) {
      status.textContent = `✅ Synced ${totalItemsCount} item types from Farm #${farmId}!`;
      updateBasketTable();
    } else {
      status.textContent = `⚠️ Connected, but no inventory found on farm.`;
    }
  } catch (err) {
    status.textContent = err.message;
  }
});

const input = document.getElementById('combobox-input');
const menu = document.getElementById('combobox-menu');

input.addEventListener('input', () => {
  const query = input.value.toLowerCase().trim();
  menu.innerHTML = '';

  const matches = Object.keys(allPrices)
    .filter(key => {
      if (isExcludedItem(key)) return false;
      let cleanKey = key.replace(/^\[.*?\]\s*/, '');
      return cleanKey.toLowerCase().includes(query) || key.toLowerCase().includes(query);
    })
    .sort((a, b) => a.replace(/^\[.*?\]\s*/, '').localeCompare(b.replace(/^\[.*?\]\s*/, '')));

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
        <span class="text-sfl-green font-mono text-xs font-bold flex items-center gap-1">${formattedPrice} ${FLOWER_ICON}</span>
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

function selectItem(itemKey, displayName) {
  selectedItemKey = itemKey;
  let cleanName = displayName || itemKey.replace(/^\[.*?\]\s*/, '');

  input.value = cleanName;
  menu.classList.add('hidden');

  document.getElementById('selected-item-badge').classList.remove('hidden');
  document.getElementById('selected-item-name').textContent = cleanName;
  document.getElementById('selected-item-price').innerHTML = `${formatFourDecimals(allPrices[itemKey])} ${FLOWER_ICON}`;

  let foundStock = getItemStock(cleanName);

  if (foundStock > 0) {
    document.getElementById('quantity').value = foundStock.toFixed(1);
    document.getElementById('inventory-hint').classList.remove('hidden');
    document.getElementById('stock-count').textContent = foundStock.toFixed(1);
  } else {
    document.getElementById('quantity').value = 1;
    document.getElementById('inventory-hint').classList.add('hidden');
  }
}

document.getElementById('add-btn').addEventListener('click', () => {
  const rawQty = parseFloat(document.getElementById('quantity').value) || 0;
  const qty = roundUpToOneDecimal(rawQty);

  if (!selectedItemKey || qty <= 0) return;

  const unitPrice = allPrices[selectedItemKey] || 0;
  const subtotal = unitPrice * qty;

  basket.push({ item: selectedItemKey, qty, unitPrice, subtotal });
  updateBasketTable();

  input.value = '';
  selectedItemKey = null;
  document.getElementById('quantity').value = 1;
  document.getElementById('selected-item-badge').classList.add('hidden');
  document.getElementById('inventory-hint').classList.add('hidden');
});

document.getElementById('clear-basket').addEventListener('click', () => {
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
  tbody.innerHTML = '';

  let grandGrossTotal = 0;
  let totalBettyCoins = 0;
  let totalGrossRatioCoins = 0;

  const taxRate = parseFloat(document.getElementById('tax-select').value) || 0;
  const coinMultiplier = parseFloat(document.getElementById('coin-ratio').value) || 1000;

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
        bettyCoinsDisplay = `<span class="inline-flex items-center gap-1">${roundUpToTwoDecimals(itemBettyCoins).toFixed(2)} ${COIN_ICON}</span>`;
      }

      let itemNetFlowers = entry.subtotal * (1 - taxRate);
      let itemNetRatioCoins = itemNetFlowers * coinMultiplier;
      
      totalGrossRatioCoins += (entry.subtotal * coinMultiplier);

      let ratioCoinsDisplay = entry.unitPrice > 0 
        ? `<span class="inline-flex items-center gap-1">${roundUpToTwoDecimals(itemNetRatioCoins).toFixed(2)} ${COIN_ICON}</span>` 
        : `<span class="text-sfl-woodLight/70 font-normal italic text-[10px]">-</span>`;

      let tr = document.createElement('tr');
      tr.className = "hover:bg-amber-50/50 transition";
      
      let subtotalDisplay = entry.unitPrice > 0 
        ? `<span class="inline-flex items-center gap-1">${roundUpToThreeDecimals(entry.subtotal).toFixed(3)} ${FLOWER_ICON}</span>` 
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
          <button onclick="removeItem(${index})" class="text-sfl-accent hover:text-red-700 font-bold px-1">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const taxAmount = grandGrossTotal * taxRate;
  const netFlowers = grandGrossTotal - taxAmount;
  const totalNetRatioCoins = totalGrossRatioCoins * (1 - taxRate);

  document.getElementById('gross-flowers').textContent = `${roundUpToThreeDecimals(grandGrossTotal).toFixed(3)} Flowers`;
  document.getElementById('tax-deduction').textContent = `${roundUpToThreeDecimals(taxAmount).toFixed(3)} Flowers`;
  document.getElementById('total-flowers').textContent = `${roundUpToThreeDecimals(netFlowers).toFixed(3)}`;
  document.getElementById('total-betty-coins').textContent = `${roundUpToTwoDecimals(totalBettyCoins).toFixed(2)}`;
  document.getElementById('total-ratio-coins').textContent = `${roundUpToTwoDecimals(totalNetRatioCoins).toFixed(2)}`;
  document.getElementById('item-count').textContent = `${basket.length} Item${basket.length === 1 ? '' : 's'}`;
}

function removeItem(index) {
  basket.splice(index, 1);
  updateBasketTable();
}
