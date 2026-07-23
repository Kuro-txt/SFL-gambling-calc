// --- PRE-HARVEST BASELINES & DAILY HARVEST YIELD TRACKER ---

if (typeof window.editingSnapshotDate === 'undefined') {
  window.editingSnapshotDate = null;
}

// Unified Key Normalizer across entire app
function normalizeItemKey(rawInput) {
  if (!rawInput) return '';
  let str = typeof rawInput === 'object' ? (rawInput.item || rawInput.name || '') : String(rawInput);
  return str.replace(/^\[.*?\]\s*/, '').toLowerCase().trim();
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

  // Display top saved items
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

  if (!mainContainer) return;

  let hasCloud = false;
  let hasManual = false;

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const todayDate = new Date().toISOString().split('T')[0];
    const { data } = await supabaseClient
      .from('preharvest_baselines')
      .select('stock, created_at')
      .eq('user_id', currentUser.id)
      .eq('snapshot_date', todayDate)
      .maybeSingle();

    if (data && data.stock) {
      hasCloud = true;
      if (cloudStatus) cloudStatus.classList.remove('hidden');
    } else {
      if (cloudStatus) cloudStatus.classList.add('hidden');
    }
  } else {
    if (cloudStatus) cloudStatus.classList.add('hidden');
  }

  const baseline = localStorage.getItem('sfl_pre_harvest_stock');
  if (baseline) {
    hasManual = true;
    try {
      const data = JSON.parse(baseline);
      const timeEl = document.getElementById('pre-harvest-time');
      if (timeEl) timeEl.textContent = data.timestamp || 'Active';
      if (manualStatus) manualStatus.classList.remove('hidden');
      renderStockBadges(data.stock || data, 'manual-baseline-items');
    } catch (e) {
      console.warn("Error parsing pre-harvest baseline", e);
    }
  } else {
    if (manualStatus) manualStatus.classList.add('hidden');
  }

  if (hasCloud || hasManual) {
    mainContainer.classList.remove('hidden');
  } else {
    mainContainer.classList.add('hidden');
  }
}

// 1. SAVE PRE-HARVEST BASELINE (MERGES LOCAL + CLOUD BASELINES CLEANLY)
document.getElementById('save-pre-harvest-btn')?.addEventListener('click', async () => {
  let baselineStock = {};
  const todayDate = new Date().toISOString().split('T')[0];

  // Step A: Load Cloud Baseline first if signed in
  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from('preharvest_baselines')
        .select('stock')
        .eq('user_id', currentUser.id)
        .eq('snapshot_date', todayDate)
        .maybeSingle();

      if (data && data.stock) {
        for (let k in data.stock) {
          let cleanK = normalizeItemKey(k);
          let val = parseFloat(data.stock[k]) || 0;
          if (cleanK && val > 0) baselineStock[cleanK] = val;
        }
      }
    } catch(e) {
      console.warn("Cloud baseline fetch skipped");
    }
  }

  // Step B: Merge existing local baseline storage
  const existingRaw = localStorage.getItem('sfl_pre_harvest_stock');
  if (existingRaw) {
    try {
      const existingParsed = JSON.parse(existingRaw);
      let rawStock = existingParsed.stock || existingParsed || {};
      for (let k in rawStock) {
        let cleanK = normalizeItemKey(k);
        let val = typeof rawStock[k] === 'number' ? rawStock[k] : parseFloat(rawStock[k]?.amount || rawStock[k] || 0);
        if (cleanK && val > 0) baselineStock[cleanK] = val;
      }
    } catch (e) {}
  }

  // Step C: Merge Synced Farm Inventory if available
  if (typeof farmInventoryData !== 'undefined' && farmInventoryData && Object.keys(farmInventoryData).length > 0) {
    for (let key in farmInventoryData) {
      let cleanName = normalizeItemKey(key);
      let val = typeof farmInventoryData[key] === 'number' 
        ? farmInventoryData[key] 
        : parseFloat(farmInventoryData[key]?.amount || 0);
      
      if (cleanName && val > 0) {
        if (baselineStock[cleanName] === undefined) {
          baselineStock[cleanName] = roundUpToOneDecimal(val);
        }
      }
    }
  }

  // Step D: Merge Basket items
  if (typeof basket !== 'undefined' && Array.isArray(basket) && basket.length > 0) {
    basket.forEach(entry => {
      let cleanName = normalizeItemKey(entry);
      let qty = typeof entry === 'object' ? (parseFloat(entry.qty || entry.amount) || 0) : 0;

      if (cleanName && qty > 0) {
        baselineStock[cleanName] = roundUpToOneDecimal(qty);
      }
    });
  }

  if (Object.keys(baselineStock).length === 0) {
    alert("⚠️ Cannot save an empty snapshot! Please add items to your Farm Basket or sync your farm inventory first.");
    return;
  }

  const preHarvestPayload = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    stock: baselineStock
  };

  localStorage.setItem('sfl_pre_harvest_stock', JSON.stringify(preHarvestPayload));

  // Sync back to cloud if logged in
  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    await supabaseClient.from('preharvest_baselines').upsert({
      user_id: currentUser.id,
      snapshot_date: todayDate,
      stock: baselineStock
    }, { onConflict: 'user_id,snapshot_date' });
  }

  updatePreHarvestUI();
  alert("🚩 Pre-Harvest baseline saved and synced with cloud!");
});

document.getElementById('clear-pre-harvest-btn')?.addEventListener('click', () => {
  if (confirm("Are you sure you want to clear your active pre-harvest baseline?")) {
    localStorage.removeItem('sfl_pre_harvest_stock');
    updatePreHarvestUI();
  }
});

// 2. CALCULATE HARVEST YIELD
document.getElementById('log-yield-btn')?.addEventListener('click', async () => {
  let preHarvestData = {};
  const todayDate = new Date().toISOString().split('T')[0];

  // Load from local storage
  const preHarvestRaw = localStorage.getItem('sfl_pre_harvest_stock');
  if (preHarvestRaw) {
    try {
      const parsed = JSON.parse(preHarvestRaw);
      let rawObj = parsed.stock || parsed;
      for (let k in rawObj) {
        preHarvestData[normalizeItemKey(k)] = parseFloat(rawObj[k]) || 0;
      }
    } catch (e) {}
  }

  // Fallback to Supabase Cloud Baseline if local is empty
  if (Object.keys(preHarvestData).length === 0 && typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data } = await supabaseClient
      .from('preharvest_baselines')
      .select('stock')
      .eq('user_id', currentUser.id)
      .eq('snapshot_date', todayDate)
      .maybeSingle();

    if (data && data.stock) {
      for (let k in data.stock) {
        preHarvestData[normalizeItemKey(k)] = parseFloat(data.stock[k]) || 0;
      }
    }
  }

  if (Object.keys(preHarvestData).length === 0) {
    alert("⚠️ Click '1. Save Pre-Harvest Stock' FIRST or wait for the 00:00 UTC automatic snapshot before calculating harvest yield!");
    return;
  }

  const taxRate = parseFloat(document.getElementById('tax-select')?.value) || 0;
  let postHarvestStock = {};

  // Copy baseline floor
  for (let k in preHarvestData) {
    postHarvestStock[k] = preHarvestData[k];
  }

  let hasBasketItems = typeof basket !== 'undefined' && Array.isArray(basket) && basket.length > 0;

  if (hasBasketItems) {
    basket.forEach(entry => {
      let cleanName = normalizeItemKey(entry);
      let harvestedQty = typeof entry === 'object' ? (parseFloat(entry.qty || entry.amount) || 0) : 0;
      if (cleanName && harvestedQty > 0) {
        let baseQty = postHarvestStock[cleanName] || 0;
        postHarvestStock[cleanName] = baseQty + harvestedQty;
      }
    });
  } else if (typeof farmInventoryData !== 'undefined' && farmInventoryData && Object.keys(farmInventoryData).length > 0) {
    for (let key in farmInventoryData) {
      let cleanName = normalizeItemKey(key);
      let val = typeof farmInventoryData[key] === 'number' 
        ? farmInventoryData[key] 
        : parseFloat(farmInventoryData[key]?.amount || 0);
      postHarvestStock[cleanName] = val;
    }
  }

  let newYieldsMap = {};
  let allItemKeys = new Set([...Object.keys(preHarvestData), ...Object.keys(postHarvestStock)]);

  allItemKeys.forEach(itemName => {
    let startQty = preHarvestData[itemName] || 0;
    let endQty = postHarvestStock[itemName] || 0;
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

  let cropsMap = {};
  let grandCount = 0;
  let grandFlowers = 0;

  if (existingDayIndex >= 0 && Array.isArray(history[existingDayIndex].crops)) {
    history[existingDayIndex].crops.forEach(c => {
      let name = c.name || c.item;
      cropsMap[name] = {
        qty: parseFloat(c.qty) || 0,
        flowers: parseFloat(c.flowers) || 0
      };
    });
  }

  Object.keys(newYieldsMap).forEach(itemName => {
    if (cropsMap[itemName]) {
      cropsMap[itemName].qty += newYieldsMap[itemName].qty;
      cropsMap[itemName].flowers += newYieldsMap[itemName].flowers;
    } else {
      cropsMap[itemName] = {
        qty: newYieldsMap[itemName].qty,
        flowers: newYieldsMap[itemName].flowers
      };
    }
  });

  let mergedCropsArray = [];
  Object.keys(cropsMap).forEach(itemName => {
    mergedCropsArray.push({
      name: itemName,
      qty: cropsMap[itemName].qty,
      flowers: cropsMap[itemName].flowers
    });
    grandCount += cropsMap[itemName].qty;
    grandFlowers += cropsMap[itemName].flowers;
  });

  const updatedDailyEntry = {
    date: todayDate,
    totalCount: roundUpToOneDecimal(grandCount),
    crops: mergedCropsArray,
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
      crops: mergedCropsArray
    }, { onConflict: 'user_id,yield_date' });
  }

  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history));

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
