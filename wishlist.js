// --- WISHLIST MODULE ---
let allNfts = [];
let wishlistItems = JSON.parse(localStorage.getItem('sfl_wishlist') || '[]');

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  initNftCombobox();
  loadNftCatalog();
  renderWishlist();

  const clearBtn = document.getElementById('clear-wishlist-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearWishlist);
  }
});

// Tab Switcher
function setupTabs() {
  const tabCalcBtn = document.getElementById('tab-calc-btn');
  const tabWishlistBtn = document.getElementById('tab-wishlist-btn');
  const calcSection = document.getElementById('calculator-section');
  const wishlistSection = document.getElementById('wishlist-section');

  if (!tabCalcBtn || !tabWishlistBtn || !calcSection || !wishlistSection) return;

  tabCalcBtn.addEventListener('click', () => {
    calcSection.classList.remove('hidden');
    wishlistSection.classList.add('hidden');
    tabCalcBtn.className = "bg-sfl-wood text-amber-200 px-5 py-2 rounded-xl font-bold text-xs border-2 border-sfl-dirt shadow-md flex items-center gap-2 cursor-pointer";
    tabWishlistBtn.className = "bg-amber-100/60 text-sfl-woodLight px-5 py-2 rounded-xl font-bold text-xs border-2 border-transparent hover:bg-amber-200/60 transition flex items-center gap-2 cursor-pointer";
  });

  tabWishlistBtn.addEventListener('click', () => {
    wishlistSection.classList.remove('hidden');
    calcSection.classList.add('hidden');
    tabWishlistBtn.className = "bg-sfl-wood text-amber-200 px-5 py-2 rounded-xl font-bold text-xs border-2 border-sfl-dirt shadow-md flex items-center gap-2 cursor-pointer";
    tabCalcBtn.className = "bg-amber-100/60 text-sfl-woodLight px-5 py-2 rounded-xl font-bold text-xs border-2 border-transparent hover:bg-amber-200/60 transition flex items-center gap-2 cursor-pointer";
    renderWishlist();
  });
}

// Fetch NFT list from Backend
async function loadNftCatalog() {
  try {
    const backendUrl = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
    const res = await fetch(`${backendUrl}/api/nfts`);
    
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    
    if (Array.isArray(data) && data.length > 0) {
      allNfts = data;
    } else {
      throw new Error("API returned empty list");
    }

    // Sync saved items with live prices while maintaining user's custom offers
    wishlistItems.forEach(savedItem => {
      let match = allNfts.find(n => n.name.toLowerCase() === savedItem.name.toLowerCase());
      if (match) {
        savedItem.price = match.price;
        savedItem.boost = match.boost;
        if (savedItem.offerPrice === undefined) {
          savedItem.offerPrice = match.price;
        }
      }
    });

    saveWishlist();
    renderWishlist();
  } catch (err) {
    console.warn("Could not fetch live catalog, using fallback catalog:", err.message);
    
    allNfts = [
      { name: "Lunar Temple", price: 169, boost: "+1 help progress to player's monuments" },
      { name: "Scarecrow", price: 24, boost: "+15% Crop Yield" },
      { name: "Nancy", price: 12.5, boost: "+20% Crop Growth Speed" },
      { name: "Kuebiko", price: 110, boost: "Free Seeds & +5% Yield" },
      { name: "Golden Cauliflower", price: 78, boost: "+100% Cauliflower Yield" },
      { name: "Cinder", price: 310, boost: "+50% Coal Mining Yield" },
      { name: "Rock Golem", price: 95, boost: "+1 Stone Yield" },
      { name: "Rooster", price: 65, boost: "2x Egg Drop Speed" }
    ];

    wishlistItems.forEach(savedItem => {
      if (savedItem.offerPrice === undefined) {
        savedItem.offerPrice = savedItem.price;
      }
    });
    saveWishlist();
    renderWishlist();
  }
}

// Search Combobox Dropdown
function initNftCombobox() {
  const input = document.getElementById('wishlist-search-input');
  const menu = document.getElementById('wishlist-search-menu');

  if (!input || !menu) return;

  function renderMenu() {
    const query = input.value.toLowerCase().trim();
    menu.innerHTML = '';

    const matches = allNfts.filter(nft => {
      if (!query) return true;
      return nft.name.toLowerCase().includes(query) || 
             nft.boost.toLowerCase().includes(query);
    }).slice(0, 30);

    if (matches.length === 0) {
      menu.innerHTML = '<li class="p-3 text-sfl-woodLight italic text-xs">No matching NFTs found</li>';
    } else {
      matches.forEach(nft => {
        const li = document.createElement('li');
        li.className = 'p-2.5 hover:bg-amber-100 cursor-pointer transition flex justify-between items-center text-xs border-b border-sfl-cardBorder/30 last:border-b-0';

        li.innerHTML = `
          <div class="flex items-center gap-2 overflow-hidden mr-2">
            <span>⭐</span>
            <div class="truncate">
              <div class="font-bold text-sfl-dirt truncate">${nft.name}</div>
              <div class="text-[10px] text-sfl-woodLight truncate">${nft.boost}</div>
            </div>
          </div>
          <span class="text-sfl-green font-mono font-bold whitespace-nowrap flex items-center gap-1">
            ${nft.price.toFixed(2)} Flowers
          </span>
        `;
        li.addEventListener('click', () => {
          addToWishlist(nft);
          input.value = '';
          menu.classList.add('hidden');
        });
        menu.appendChild(li);
      });
    }

    menu.classList.remove('hidden');
  }

  input.addEventListener('input', renderMenu);
  input.addEventListener('focus', renderMenu);

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}

function addToWishlist(nft) {
  if (wishlistItems.some(item => item.name.toLowerCase() === nft.name.toLowerCase())) {
    alert('⚠️ Item is already in your wishlist!');
    return;
  }

  wishlistItems.push({
    ...nft,
    offerPrice: nft.price
  });

  saveWishlist();
  renderWishlist();
}

function updateOfferPrice(index, value) {
  const parsed = parseFloat(value);
  wishlistItems[index].offerPrice = isNaN(parsed) ? 0 : parsed;
  saveWishlist();
  updateWishlistTotals();
}

function removeFromWishlist(index) {
  wishlistItems.splice(index, 1);
  saveWishlist();
  renderWishlist();
}

function clearWishlist() {
  if (wishlistItems.length === 0) return;
  if (confirm("Are you sure you want to clear your entire wishlist?")) {
    wishlistItems = [];
    saveWishlist();
    renderWishlist();
  }
}

function saveWishlist() {
  localStorage.setItem('sfl_wishlist', JSON.stringify(wishlistItems));
}

function updateWishlistTotals() {
  const countEl = document.getElementById('wishlist-item-count');
  const floorFlowersEl = document.getElementById('wishlist-total-flowers');
  const offerFlowersEl = document.getElementById('wishlist-total-offer');

  let grandTotalFloor = 0;
  let grandTotalOffer = 0;

  wishlistItems.forEach(item => {
    grandTotalFloor += item.price;
    grandTotalOffer += (typeof item.offerPrice === 'number' ? item.offerPrice : item.price);
  });

  if (countEl) countEl.textContent = `${wishlistItems.length} Item${wishlistItems.length === 1 ? '' : 's'}`;
  if (floorFlowersEl) floorFlowersEl.textContent = grandTotalFloor.toFixed(2);
  if (offerFlowersEl) offerFlowersEl.textContent = grandTotalOffer.toFixed(2);
}

function renderWishlist() {
  const tbody = document.getElementById('wishlist-body');
  if (!tbody) return;

  if (wishlistItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sfl-woodLight italic">Your wishlist is empty! Search above to add items.</td></tr>`;
    updateWishlistTotals();
    return;
  }

  tbody.innerHTML = '';

  wishlistItems.forEach((nft, index) => {
    if (nft.offerPrice === undefined) {
      nft.offerPrice = nft.price;
    }

    const tr = document.createElement('tr');
    tr.className = "hover:bg-amber-50/50 transition align-middle";

    tr.innerHTML = `
      <td class="px-3 py-2.5 font-bold flex items-center gap-2">
        <span>⭐</span>
        <span>${nft.name}</span>
      </td>
      <td class="px-3 py-2.5 text-xs text-sfl-woodLight">${nft.boost}</td>
      <td class="px-3 py-2.5 font-bold text-sfl-green font-mono">${nft.price.toFixed(2)} Flowers</td>
      <td class="px-3 py-2.5">
        <input type="number" min="0" step="0.01" value="${nft.offerPrice}" 
          oninput="updateOfferPrice(${index}, this.value)"
          class="w-24 sfl-input px-2 py-1 text-xs font-mono font-bold text-amber-900 rounded border-2 border-sfl-cardBorder focus:outline-none focus:border-amber-600 bg-amber-50">
      </td>
      <td class="px-2 py-2.5 text-center">
        <button onclick="removeFromWishlist(${index})" class="bg-sfl-accent text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 shadow-sm cursor-pointer">🗑️ Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateWishlistTotals();
}
