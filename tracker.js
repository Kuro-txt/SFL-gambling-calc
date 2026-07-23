// --- PRE-HARVEST BASELINES & DAILY HARVEST YIELD TRACKER ---

if (typeof window.editingSnapshotDate === 'undefined') {
  window.editingSnapshotDate = null;
}

function normalizeItemKey(rawName) {
  if (!rawName) return '';
  return String(rawName)
    .replace(/^\[.*?\]\s*/, '')
    .toLowerCase()
    .trim();
}

function roundUpToOneDecimal(val) {
  return Math.ceil((parseFloat(val) || 0) * 10) / 10;
}

function roundUpToThreeDecimals(val) {
  return Math.ceil((parseFloat(val) || 0) * 1000) / 1000;
}

function renderStockBadges(stockObj, targetElId) {
  const container = document.getElementById(targetElId);
  if (!container || !stockObj) return;

  let html = '';
  let entries = Object.entries(stockObj);

  if (entries.length === 0) {
    container.innerHTML = `<span class="italic text-amber-800/60">No items saved</span>`;
    return;
  }

  entries.forEach(([itemKey, qty]) => {
    let cleanName = itemKey.charAt(0).toUpperCase() + itemKey.slice(1);
    let numericQty = typeof qty === 'number' ? qty : parseFloat(qty?.amount || qty || 0);
    
    if (numericQty > 0) {
      html += `<span class="bg-amber-200/90 text-amber-950 font-semibold px-2 py-0.5 rounded border border-amber-300 mr-1 mb-1 inline-block">${cleanName}: ${numericQty.toFixed(1)}</span> `;
    }
  });

  container.innerHTML = html;
}

async function updatePreHarvestUI() {
  const mainContainer = document.getElementById('pre-harvest-status');
  const cloudStatus = document.getElementById('cloud-baseline-status');
  const manualStatus = document.getElementById('manual-baseline-status');

  if (!mainContainer || !cloudStatus || !manualStatus) return;

  let hasCloud = false;
  let hasManual = false;

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const todayDate = new Date().toISOString().split('T')[0];
    const { data } = await supabaseClient
      .from('preharvest_baselines')
      .select('created_at')
      .eq('user_id', currentUser.id)
      .eq('snapshot_date', todayDate)
      .maybeSingle();

    if (data) {
      hasCloud = true;
      cloudStatus.classList.remove('hidden');
    } else {
      cloudStatus.classList.add('hidden');
    }
  } else {
    cloudStatus.classList.add('hidden');
  }

  const baseline = localStorage.getItem('sfl_pre_harvest_stock');
  if (baseline) {
    hasManual = true;
    try {
      const data = JSON.parse(baseline);
      const timeEl = document.getElementById('pre-harvest-time');
      if (timeEl) timeEl.textContent = data.timestamp || 'Active';
      manualStatus.classList.remove('hidden');
      renderStockBadges(data.stock || data, 'manual-baseline-items');
    } catch (e) {
      console.warn("Error parsing pre-harvest baseline", e);
    }
  } else {
    manualStatus.classList.add('hidden');
  }

  if (hasCloud || hasManual) {
    mainContainer.classList.remove('hidden');
  } else {
    mainContainer.classList.add('hidden');
  }
}

// 1. SAVE / CUMULATIVE MERGE PRE-HARVEST BASELINE
document.getElementById('save-pre-harvest-btn')?.addEventListener('click', async () => {
  let baselineStock = {};

  // Step A: Load ALL existing snapshot items from localStorage
  const existingRaw = localStorage.getItem('sfl_pre_harvest_stock');
  if (existingRaw) {
    try {
      const existingParsed = JSON.parse(existingRaw);
      let rawStock = existingParsed.stock || existingParsed || {};
      for (let k in rawStock) {
        let cleanK = normalizeItemKey(k);
        let val = typeof rawStock[k] === 'number' ? rawStock[k] : parseFloat(rawStock[k]?.amount || rawStock[k] || 0);
        if (val > 0) {
          baselineStock[cleanK] = val;
        }
      }
    } catch (e) {
      console.warn("Could not read previous snapshot, starting fresh:", e);
    }
  }

  let newlyAddedOrUpdated = false;

  // Step B: Merge items from Farm Basket
  if (typeof basket !== 'undefined' && Array.isArray(basket) && basket.length > 0) {
    basket.forEach(entry => {
      let cleanName = normalizeItemKey(entry.item);
      let addedQty = parseFloat(entry.qty) || 0;
      if (addedQty > 0) {
        baselineStock[cleanName] = addedQty;
        newlyAddedOrUpdated = true;
      }
    });
  }

  // Step C: Merge items from Synced Farm Inventory if present
  if (typeof farmInventoryData !== 'undefined' && farmInventoryData && Object.keys(farmInventoryData).length > 0) {
    for (let key in farmInventoryData) {
      let cleanName = normalizeItemKey(key);
      let val = typeof farmInventoryData[key] === 'number' 
        ? farmInventoryData[key] 
        : parseFloat(farmInventoryData[key]?.amount || 0);
      
      if (val > 0) {
        // Only set if not already overridden by basket
        if (baselineStock[cleanName] === undefined) {
          baselineStock[cleanName] = val;
        }
        newlyAddedOrUpdated = true;
      }
    }
  }

  if (!newlyAddedOrUpdated && Object.keys(baselineStock).length === 0) {
    alert("⚠️ Cannot save an empty snapshot! Please add items to your Farm Basket or sync your farm inventory first.");
    return;
  }

  const preHarvestPayload = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    stock: baselineStock
  };

  localStorage.setItem('sfl_pre_harvest_stock', JSON.stringify(preHarvestPayload));
  updatePreHarvestUI();
  alert("🚩 Pre-Harvest baseline updated! New items were added without resetting previous snapshot items.");
});

document.getElementById('clear-pre-harvest-btn')?.addEventListener('click', () => {
  localStorage.removeItem('sfl_pre_harvest_stock');
  updatePreHarvestUI();
});

// 2. CALCULATE HARVEST YIELD
document.getElementById('log-yield-btn')?.addEventListener('click', async () => {
  let preHarvestData = null;
  const todayDate = new Date().toISOString().split('T')[0];

  const preHarvestRaw = localStorage.getItem('sfl_pre_harvest_stock');
  if (preHarvestRaw) {
    try {
      const parsed = JSON.parse(preHarvestRaw);
      preHarvestData = parsed.stock || parsed;
    } catch (e) {
      console.warn("Invalid pre-harvest data");
    }
  }

  if (!preHarvestData && typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data } = await supabaseClient
      .from('preharvest_baselines')
      .select('stock')
      .eq('user_id', currentUser.id)
      .eq('snapshot_date', todayDate)
      .maybeSingle();

    if (data && data.stock) {
      preHarvestData = data.stock;
    }
  }

  if (!preHarvestData || Object.keys(preHarvestData).length === 0) {
    alert("⚠️ Click '1. Save Pre-Harvest Stock' FIRST or wait for the 00:00 UTC automatic snapshot before calculating harvest yield!");
    return;
  }

  const taxRate = parseFloat(document.getElementById('tax-select')?.value) || 0;
  let postHarvestStock = {};

  // Preserve all baseline items as post-harvest starting values (prevents resets on unselected items)
  for (let key in preHarvestData) {
    let cleanKey = normalizeItemKey(key);
    postHarvestStock[cleanKey] = parseFloat(preHarvestData[key]) || 0;
  }

  // Update post-harvest stock from Synced Inventory if available
  if (typeof farmInventoryData !== 'undefined' && farmInventoryData && Object.keys(farmInventoryData).length > 0) {
    for (let key in farmInventoryData) {
      let cleanName = normalizeItemKey(key);
      let val = typeof farmInventoryData[key] === 'number' 
        ? farmInventoryData[key] 
        : parseFloat(farmInventoryData[key]?.amount || 0);
      postHarvestStock[cleanName] = val;
    }
  }

  // Update post-harvest stock from Farm Basket if items exist
  if (typeof basket !== 'undefined' && Array.isArray(basket) && basket.length > 0) {
    basket.forEach(entry => {
      let cleanName = normalizeItemKey(entry.item);
      postHarvestStock[cleanName] = parseFloat(entry.qty) || 0;
    });
  }

  let newYieldsMap = {};
  let allItemKeys = new Set([
    ...Object.keys(preHarvestData).map(normalizeItemKey), 
    ...Object.keys(postHarvestStock).map(normalizeItemKey)
  ]);

  allItemKeys.forEach(itemName => {
    let startQty = parseFloat(preHarvestData[itemName]) || 0;
    let endQty = parseFloat(postHarvestStock[itemName]) || 0;
    let diff = endQty - startQty;

    if (diff > 0.0001) {
      let harvestedQty = roundUpToOneDecimal(diff);
      let matchedKey = (typeof allPrices !== 'undefined' && allPrices) 
        ? Object.keys(allPrices).find(k => normalizeItemKey(k) === itemName)
        : null;
      
      let unitPrice = matchedKey ? allPrices[matchedKey] : 0;
      let itemFlowers = roundUpToThreeDecimals((unitPrice * harvestedQty) * (1 - taxRate));

      let formattedName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
      newYieldsMap[formattedName] = { qty: harvestedQty, flowers: itemFlowers };
    }
  });

  if (Object.keys(newYieldsMap).length === 0) {
    alert("⚠️ No item stock increase detected. Did you harvest in-game, or update your Farm Basket / Sync with higher quantities?");
    return;
  }

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
  } catch(e) { history = []; }

  let existingDayIndex = history.findIndex(entry => entry.date === todayDate);

  let cropsArray = [];
  let grandCount = 0;
  let grandFlowers = 0;

  Object.keys(newYieldsMap).forEach(itemName => {
    cropsArray.push({
      name: itemName,
      qty: newYieldsMap[itemName].qty,
      flowers: newYieldsMap[itemName].flowers
    });
    grandCount += newYieldsMap[itemName].qty;
    grandFlowers += newYieldsMap[itemName].flowers;
  });

  const updatedDailyEntry = {
    date: todayDate,
    totalCount: roundUpToOneDecimal(grandCount),
    crops: cropsArray,
    netFlowers: roundUpToThreeDecimals(grandFlowers).toFixed(3)
  };

  if (existingDayIndex >= 0) {
    history[existingDayIndex] = updatedDailyEntry;
  } else {
    history.unshift(updatedDailyEntry);
  }

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    await supabaseClient.from('daily_yields').upsert({
      user_id: currentUser.id,
      yield_date: todayDate,
      total_count: roundUpToOneDecimal(grandCount),
      net_flowers: roundUpToThreeDecimals(grandFlowers),
      crops: cropsArray
    }, { onConflict: 'user_id,yield_date' });
  }

  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history));
  localStorage.removeItem('sfl_pre_harvest_stock');
  updatePreHarvestUI();
  renderSnapshotHistory();
  alert(`🎉 Successfully recorded daily harvest yield for ${todayDate}!`);
});

function editSnapshotRow(date) {
  window.editingSnapshotDate = date;
  renderSnapshotHistory();
}

function cancelEditSnapshot() {
  window.editingSnapshotDate = null;
  renderSnapshotHistory();
}

async function saveEditedSnapshot(date) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
  } catch(e) { return; }

  let entryIndex = history.findIndex(item => item.date === date);
  if (entryIndex === -1) return;

  const taxRate = parseFloat(document.getElementById('tax-select')?.value) || 0;
  let entry = history[entryIndex];
  let updatedCrops = [];
  let grandTotalCount = 0;
  let grandNetFlowers = 0;

  if (Array.isArray(entry.crops)) {
    entry.crops.forEach((crop, cropIdx) => {
      let cleanDateId = date.replace(/[^a-zA-Z0-9]/g, '');
      let inputEl = document.getElementById(`edit-qty-${cleanDateId}-${cropIdx}`);
      let newQty = inputEl ? roundUpToOneDecimal(parseFloat(inputEl.value) || 0) : (parseFloat(crop.qty) || 0);

      if (newQty > 0) {
        let matchedKey = (typeof allPrices !== 'undefined' && allPrices)
          ? Object.keys(allPrices).find(k => normalizeItemKey(k) === (crop.name || '').toLowerCase())
          : null;

        let unitPrice = matchedKey ? allPrices[matchedKey] : ((parseFloat(crop.flowers) || 0) / (parseFloat(crop.qty) || 1));
        let itemNetFlowers = roundUpToThreeDecimals((unitPrice * newQty) * (1 - taxRate));

        updatedCrops.push({
          name: crop.name || 'Crop',
          qty: newQty,
          flowers: itemNetFlowers
        });

        grandTotalCount += newQty;
        grandNetFlowers += itemNetFlowers;
      }
    });
  }

  if (updatedCrops.length === 0) {
    deleteSnapshotRow(date);
    return;
  }

  history[entryIndex] = {
    date: date,
    totalCount: roundUpToOneDecimal(grandTotalCount),
    crops: updatedCrops,
    netFlowers: roundUpToThreeDecimals(grandNetFlowers).toFixed(3)
  };

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    await supabaseClient.from('daily_yields').upsert({
      user_id: currentUser.id,
      yield_date: date,
      total_count: roundUpToOneDecimal(grandTotalCount),
      net_flowers: roundUpToThreeDecimals(grandNetFlowers),
      crops: updatedCrops
    }, { onConflict: 'user_id,yield_date' });
  }

  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history));
  window.editingSnapshotDate = null;
  renderSnapshotHistory();
  alert(`✅ Harvest record for ${date} updated!`);
}

async function deleteSnapshotRow(date) {
  if (!confirm(`Delete snapshot record for ${date}?`)) return;
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
  } catch(e) { history = []; }

  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history.filter(i => i.date !== date)));

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    await supabaseClient.from('daily_yields').delete().eq('user_id', currentUser.id).eq('yield_date', date);
  }

  if (window.editingSnapshotDate === date) window.editingSnapshotDate = null;
  renderSnapshotHistory();
}

async function loadCloudYieldHistory() {
  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('daily_yields')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('yield_date', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const cloudHistory = data.map(item => ({
          date: item.yield_date || item.date,
          totalCount: parseFloat(item.total_count || item.totalCount || 0),
          crops: item.crops || [],
          netFlowers: parseFloat(item.net_flowers || item.netFlowers || 0).toFixed(3)
        }));
        localStorage.setItem('sfl_daily_snapshots', JSON.stringify(cloudHistory));
        renderSnapshotHistory();
      }
    } catch (err) {
      console.warn("Cloud yield fetch skipped:", err.message);
    }
  }
}

function renderSnapshotHistory() {
  const tbody = document.getElementById('snapshot-history-body');
  if (!tbody) return;

  let rawHistory = localStorage.getItem('sfl_daily_snapshots');
  let history = [];

  try {
    history = JSON.parse(rawHistory || '[]');
  } catch (err) {
    console.error("Failed to parse history JSON:", err);
  }

  const flowerIconSymbol = typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : '🌸';

  if (!Array.isArray(history) || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-sfl-woodLight italic">No harvest sessions logged yet!</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  history.forEach(entry => {
    if (!entry) return;

    let entryDate = entry.date || entry.yield_date || 'Unknown Date';
    let isEditing = window.editingSnapshotDate === entryDate;
    let cropBadges = '';
    let cleanDateId = entryDate.replace(/[^a-zA-Z0-9]/g, '');

    let cropsList = Array.isArray(entry.crops) ? entry.crops : [];

    cropBadges = cropsList
      .map((crop, idx) => {
        const cropQty = parseFloat(crop.qty) || 0;
        const cropFlowers = parseFloat(crop.flowers) || 0;
        const cropName = crop.name || crop.item || 'Item';

        if (isEditing) {
          return `
            <span class="inline-flex items-center gap-1 bg-amber-200 text-amber-900 border-2 border-sfl-green text-[11px] font-bold px-2 py-0.5 rounded shadow-sm mr-1 mb-1">
              <span>${cropName}:</span>
              <input type="number" id="edit-qty-${cleanDateId}-${idx}" value="${cropQty.toFixed(1)}" step="0.1" min="0" 
                class="w-12 sfl-input text-xs font-mono font-bold rounded px-1 text-sfl-dirt text-center">
            </span>
          `;
        } else {
          return `
            <span class="inline-flex items-center gap-1 bg-green-100 text-sfl-green border border-sfl-green/40 text-[11px] font-bold px-2 py-0.5 rounded shadow-sm mr-1 mb-1">
              <span>+${cropQty.toFixed(1)} ${cropName}</span>
              <span class="text-sfl-green font-normal">(${cropFlowers.toFixed(3)} ${flowerIconSymbol})</span>
            </span>
          `;
        }
      })
      .join('');

    let actionButtons = isEditing 
      ? `
        <button onclick="saveEditedSnapshot('${entryDate}')" class="bg-sfl-green text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-green-700 mr-1 shadow-sm cursor-pointer">💾 Save</button>
        <button onclick="cancelEditSnapshot()" class="bg-sfl-wood text-amber-200 px-2 py-1 rounded text-[10px] font-bold hover:bg-sfl-woodLight shadow-sm cursor-pointer">✕</button>
      `
      : `
        <button onclick="editSnapshotRow('${entryDate}')" class="bg-amber-600 text-amber-100 px-2 py-1 rounded text-[10px] font-bold hover:bg-amber-700 mr-1 shadow-sm cursor-pointer">✏️ Edit</button>
        <button onclick="deleteSnapshotRow('${entryDate}')" class="bg-sfl-accent text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 shadow-sm cursor-pointer">🗑️</button>
      `;

    let rawTotalCount = parseFloat(entry.totalCount || entry.total_count);
    let totalYieldCount = !isNaN(rawTotalCount) 
      ? rawTotalCount 
      : cropsList.reduce((acc, c) => acc + (parseFloat(c.qty) || 0), 0);

    let rawNetFlowers = parseFloat(entry.netFlowers || entry.net_flowers);
    let netFlowersVal = !isNaN(rawNetFlowers) ? rawNetFlowers : 0;

    let tr = document.createElement('tr');
    tr.className = isEditing ? "bg-amber-100/70 transition" : "hover:bg-amber-50/50 transition";
    tr.innerHTML = `
      <td class="px-3 py-2.5 font-bold whitespace-nowrap">${entryDate}</td>
      <td class="px-3 py-2.5 font-bold font-mono text-sfl-wood">${totalYieldCount.toFixed(1)} Items</td>
      <td class="px-3 py-2.5">${cropBadges || '<span class="italic text-gray-400">No details</span>'}</td>
      <td class="px-3 py-2.5 font-bold text-sfl-green font-mono">${netFlowersVal.toFixed(3)} ${flowerIconSymbol}</td>
      <td class="px-2 py-2.5 text-center whitespace-nowrap">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Export JSON
document.getElementById('export-json-btn')?.addEventListener('click', () => {
  let history = localStorage.getItem('sfl_daily_snapshots') || '[]';
  let blob = new Blob([history], { type: 'application/json' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sfl_harvest_yields_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
});

// Import JSON
const importFileInput = document.getElementById('import-file-input');
document.getElementById('import-json-btn')?.addEventListener('click', () => importFileInput?.click());

if (importFileInput) {
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (Array.isArray(imported)) {
          localStorage.setItem('sfl_daily_snapshots', JSON.stringify(imported));
          renderSnapshotHistory();
          alert('✅ Imported harvest history successfully!');
        }
      } catch (err) {
        alert('❌ Failed to parse imported JSON file.');
      }
    };
    reader.readAsText(file);
    importFileInput.value = '';
  });
}

// Initial UI Render
document.addEventListener('DOMContentLoaded', () => {
  updatePreHarvestUI();
  renderSnapshotHistory();
  loadCloudYieldHistory();
});
