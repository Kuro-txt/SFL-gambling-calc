// --- PRE-HARVEST BASELINES & DAILY HARVEST YIELD TRACKER ---
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
      cloudStatus?.classList.remove('hidden');
    } else {
      cloudStatus?.classList.add('hidden');
    }
  } else {
    cloudStatus?.classList.add('hidden');
  }

  const baseline = localStorage.getItem('sfl_pre_harvest_stock');
  if (baseline) {
    hasManual = true;
    try {
      const data = JSON.parse(baseline);
      const timeEl = document.getElementById('pre-harvest-time');
      if (timeEl) timeEl.textContent = data.timestamp || 'Active';
      manualStatus?.classList.remove('hidden');
      renderStockBadges(data.stock || data, 'manual-baseline-items');
    } catch(e) {
      console.warn("Invalid baseline data format", e);
    }
  } else {
    manualStatus?.classList.add('hidden');
  }

  if (hasCloud || hasManual) {
    mainContainer?.classList.remove('hidden');
  } else {
    mainContainer?.classList.add('hidden');
  }
}

// 1. SAVE PRE-HARVEST BASELINE
document.getElementById('save-pre-harvest-btn')?.addEventListener('click', async () => {
  let baselineStock = {};

  const existingRaw = localStorage.getItem('sfl_pre_harvest_stock');
  if (existingRaw) {
    try {
      const existingParsed = JSON.parse(existingRaw);
      let rawStock = existingParsed.stock || existingParsed || {};
      for (let k in rawStock) {
        let cleanK = k.toLowerCase().trim();
        let val = typeof rawStock[k] === 'number' ? rawStock[k] : parseFloat(rawStock[k]?.amount || rawStock[k] || 0);
        if (val > 0) {
          baselineStock[cleanK] = val;
        }
      }
    } catch (e) {
      console.warn("Could not read previous snapshot, starting fresh:", e);
    }
  }
  
  if (typeof basket !== 'undefined' && basket.length > 0) {
    basket.forEach(entry => {
      let cleanName = entry.item.replace(/^\[.*?\]\s*/, '').toLowerCase().trim();
      if (typeof isSnapshotEligible === 'undefined' || isSnapshotEligible(cleanName)) {
        baselineStock[cleanName] = entry.qty;
      }
    });
  } else if (typeof farmInventoryData !== 'undefined' && Object.keys(farmInventoryData).length > 0) {
    for (let key in farmInventoryData) {
      let cleanName = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (typeof isSnapshotEligible === 'undefined' || isSnapshotEligible(cleanName)) {
        let val = typeof farmInventoryData[key] === 'number' ? farmInventoryData[key] : parseFloat(farmInventoryData[key]?.amount || 0);
        if (val > 0) {
          baselineStock[cleanName] = roundUpToOneDecimal(val);
        }
      }
    }
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
  updatePreHarvestUI();
  alert("🚩 Manual Pre-Harvest baseline saved! Harvest/gather in-game, then click '2. Calculate Harvest Yield'.");
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
      preHarvestData = JSON.parse(preHarvestRaw).stock;
    } catch(e) {}
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

  if (!preHarvestData) {
    alert("⚠️ Click '1. Save Pre-Harvest Stock' FIRST or wait for the 00:00 UTC automatic snapshot before calculating harvest yield!");
    return;
  }

  const taxRate = parseFloat(document.getElementById('tax-select')?.value) || 0;
  let postHarvestStock = {};

  for (let key in preHarvestData) {
    postHarvestStock[key] = parseFloat(preHarvestData[key]) || 0;
  }

  const hasFarmInventory = typeof farmInventoryData !== 'undefined' && Object.keys(farmInventoryData).length > 0;

  if (hasFarmInventory) {
    for (let key in farmInventoryData) {
      let cleanName = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (typeof isSnapshotEligible === 'undefined' || isSnapshotEligible(cleanName)) {
        let val = typeof farmInventoryData[key] === 'number' ? farmInventoryData[key] : parseFloat(farmInventoryData[key]?.amount || 0);
        postHarvestStock[cleanName] = roundUpToOneDecimal(val);
      }
    }
  } else if (typeof basket !== 'undefined' && basket.length > 0) {
    basket.forEach(entry => {
      let cleanName = entry.item.replace(/^\[.*?\]\s*/, '').toLowerCase().trim();
      if (typeof isSnapshotEligible === 'undefined' || isSnapshotEligible(cleanName)) {
        let baseQty = parseFloat(preHarvestData[cleanName]) || 0;
        postHarvestStock[cleanName] = baseQty + entry.qty;
      }
    });
  }

  let newYieldsMap = {};
  let allItemKeys = new Set([...Object.keys(preHarvestData), ...Object.keys(postHarvestStock)]);

  allItemKeys.forEach(itemName => {
    let startQty = preHarvestData[itemName] || 0;
    let endQty = postHarvestStock[itemName] || 0;
    let harvestedQty = roundUpToOneDecimal(endQty - startQty);

    if (harvestedQty > 0) {
      let matchedKey = (typeof allPrices !== 'undefined' && allPrices)
        ? Object.keys(allPrices).find(k => k.replace(/^\[.*?\]\s*/, '').toLowerCase() === itemName)
        : null;
      let unitPrice = matchedKey ? allPrices[matchedKey] : 0;
      let itemFlowers = roundUpToThreeDecimals((unitPrice * harvestedQty) * (1 - taxRate));

      let formattedName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
      newYieldsMap[formattedName] = { qty: harvestedQty, flowers: itemFlowers };
    }
  });

  if (Object.keys(newYieldsMap).length === 0) {
    alert("⚠️ No item stock increase detected. Did you harvest/gather in-game or resync?");
    return;
  }

  let history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
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

  updatePreHarvestUI();
  renderSnapshotHistory();
  alert(`🎉 Calculated harvest yield for ${todayDate}!`);
});

function editSnapshotRow(date) {
  editingSnapshotDate = date;
  renderSnapshotHistory();
}

function cancelEditSnapshot() {
  editingSnapshotDate = null;
  renderSnapshotHistory();
}

async function saveEditedSnapshot(date) {
  let history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
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
      let newQty = inputEl ? roundUpToOneDecimal(parseFloat(inputEl.value) || 0) : crop.qty;

      if (newQty > 0) {
        let matchedKey = (typeof allPrices !== 'undefined' && allPrices)
          ? Object.keys(allPrices).find(k => k.replace(/^\[.*?\]\s*/, '').toLowerCase() === crop.name.toLowerCase())
          : null;
        let unitPrice = matchedKey ? allPrices[matchedKey] : (crop.flowers / (crop.qty || 1));
        let itemNetFlowers = roundUpToThreeDecimals((unitPrice * newQty) * (1 - taxRate));

        updatedCrops.push({
          name: crop.name,
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
  editingSnapshotDate = null;
  renderSnapshotHistory();
  alert(`✅ Harvest record for ${date} updated!`);
}

async function deleteSnapshotRow(date) {
  if (!confirm(`Delete snapshot record for ${date}?`)) return;
  let history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history.filter(i => i.date !== date)));

  if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
    await supabaseClient.from('daily_yields').delete().eq('user_id', currentUser.id).eq('yield_date', date);
  }

  if (typeof editingSnapshotDate !== 'undefined' && editingSnapshotDate === date) editingSnapshotDate = null;
  renderSnapshotHistory();
}

function renderSnapshotHistory() {
  const tbody = document.getElementById('snapshot-history-body');
  if (!tbody) return;
  
  let history = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-sfl-woodLight italic">No harvest sessions logged yet!</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  history.forEach(entry => {
    let isEditing = typeof editingSnapshotDate !== 'undefined' && editingSnapshotDate === entry.date;
    let cropBadges = '';
    let cleanDateId = entry.date.replace(/[^a-zA-Z0-9]/g, '');

    const flowerSymbol = typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : '🌸';
    let cropsList = Array.isArray(entry.crops) ? entry.crops : [];

    if (cropsList.length > 0) {
      cropBadges = cropsList
        .map((crop, idx) => {
          if (isEditing) {
            return `
              <span class="inline-flex items-center gap-1 bg-amber-200 text-amber-900 border-2 border-sfl-green text-[11px] font-bold px-2 py-0.5 rounded shadow-sm mr-1 mb-1">
                <span>${crop.name}:</span>
                <input type="number" id="edit-qty-${cleanDateId}-${idx}" value="${crop.qty.toFixed(1)}" step="0.1" min="0" 
                  class="w-12 sfl-input text-xs font-mono font-bold rounded px-1 text-sfl-dirt text-center">
              </span>
            `;
          } else {
            return `
              <span class="inline-flex items-center gap-1 bg-green-100 text-sfl-green border border-sfl-green/40 text-[11px] font-bold px-2 py-0.5 rounded shadow-sm mr-1 mb-1">
                <span>+${crop.qty.toFixed(1)} ${crop.name}</span>
                <span class="text-sfl-green font-normal">(${crop.flowers.toFixed(3)} ${flowerSymbol})</span>
              </span>
            `;
          }
        })
        .join('');
    }

    let actionButtons = isEditing 
      ? `
        <button onclick="saveEditedSnapshot('${entry.date}')" class="bg-sfl-green text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-green-700 mr-1 shadow-sm">💾 Save</button>
        <button onclick="cancelEditSnapshot()" class="bg-sfl-wood text-amber-200 px-2 py-1 rounded text-[10px] font-bold hover:bg-sfl-woodLight shadow-sm">✕</button>
      `
      : `
        <button onclick="editSnapshotRow('${entry.date}')" class="bg-amber-600 text-amber-100 px-2 py-1 rounded text-[10px] font-bold hover:bg-amber-700 mr-1 shadow-sm">✏️ Edit</button>
        <button onclick="deleteSnapshotRow('${entry.date}')" class="bg-sfl-accent text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 shadow-sm">🗑️</button>
      `;

    // Safely calculate Total Daily Yield count
    let rawTotalCount = parseFloat(entry.totalCount || entry.total_count);
    let totalYieldCount = !isNaN(rawTotalCount) 
      ? rawTotalCount 
      : cropsList.reduce((acc, c) => acc + (parseFloat(c.qty) || 0), 0);

    let rawNetFlowers = parseFloat(entry.netFlowers || entry.net_flowers || 0);

    let tr = document.createElement('tr');
    tr.className = isEditing ? "bg-amber-100/70 transition" : "hover:bg-amber-50/50 transition";
    tr.innerHTML = `
      <td class="px-3 py-2.5 font-bold whitespace-nowrap">${entry.date}</td>
      <td class="px-3 py-2.5 font-bold font-mono text-sfl-wood">${totalYieldCount.toFixed(1)} Items</td>
      <td class="px-3 py-2.5">${cropBadges || '<span class="italic text-gray-400">No details</span>'}</td>
      <td class="px-3 py-2.5 font-bold text-sfl-green font-mono">${rawNetFlowers.toFixed(3)} ${flowerSymbol}</td>
      <td class="px-2 py-2.5 text-center whitespace-nowrap">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('export-json-btn')?.addEventListener('click', () => {
  let history = localStorage.getItem('sfl_daily_snapshots') || '[]';
  let blob = new Blob([history], { type: 'application/json' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sfl_harvest_yields_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
});

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
          alert('✅ Imported successfully!');
        }
      } catch (err) {
        alert('❌ Failed to read JSON file.');
      }
    };
    reader.readAsText(file);
    importFileInput.value = '';
  });
}
