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
  const menu = document.getElementById('wishlist-search-menu');
  try {
    const backendUrl = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
    const res = await fetch(`${backendUrl}/api/nfts`);
    
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    
    let rawList = Array.isArray(data) ? data : (data.data || data.nfts || Object.values(data));

    allNfts = rawList.map(item => {
      const name = item.name || item.title || 'Unknown NFT';
      const price = parseFloat(item.floor ?? item.price ?? item.lastSalePrice ?? 0) || 0;
      const boost = item.boost_text || item.boost || (item.have_boost ? "Boost Active" : "No Boost");

      return {
        name: String(name).trim(),
        price: price,
        boost: String(boost).trim()
      };
    }).filter(item => item.name !== 'Unknown NFT');

    // Sync saved items with live prices
    wishlistItems.forEach(savedItem => {
      let match = allNfts.find(n => n.name.toLowerCase() === savedItem.name.toLowerCase());
      if (match) {
        savedItem.price = match.price;
        savedItem.boost = match.boost;
      }
    });

    saveWishlist();
    renderWishlist();

    if (menu) {
      menu.innerHTML = `<li class="p-2 text-sfl-green font-bold text-xs">Loaded ${allNfts.length} items! Type above to search.</li>`;
    }
  } catch (err) {
    console.error("Failed to load NFT catalog from server:", err.message);
    if (menu) {
      menu.innerHTML = `<li class="p-3 text-sfl-accent font-bold text-xs">⚠️ Failed to connect to server (${err.message}). Check console or CORS settings.</li>`;
    }
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

    if (allNfts.length === 0) {
      menu.innerHTML = '<li class="p-3 text-sfl-woodLight italic text-xs">Loading items from server...</li>';
      menu.classList.remove('hidden');
      return;
    }

    const matches = allNfts.filter(nft => {
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
            ${nft.price.toFixed(2)} ${typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : 'Flowers'}
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

  wishlistItems.push(nft);
  saveWishlist();
  renderWishlist();
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

function renderWishlist() {
  const tbody = document.getElementById('wishlist-body');
  if (!tbody) return;

  const coinRatio = parseFloat(localStorage.getItem('sfl_coin_ratio')) || 1000;

  if (wishlistItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-sfl-woodLight italic">Your wishlist is empty! Search above to add items.</td></tr>`;
    document.getElementById('wishlist-item-count').textContent = '0 Items';
    document.getElementById('wishlist-total-flowers').textContent = '0.00';
    document.getElementById('wishlist-total-coins').textContent = '0.00';
    return;
  }

  tbody.innerHTML = '';
  let grandTotalFlowers = 0;

  wishlistItems.forEach((nft, index) => {
    grandTotalFlowers += nft.price;

    const tr = document.createElement('tr');
    tr.className = "hover:bg-amber-50/50 transition";

    tr.innerHTML = `
      <td class="px-3 py-2.5 font-bold flex items-center gap-2">
        <span>⭐</span>
        <span>${nft.name}</span>
      </td>
      <td class="px-3 py-2.5 text-xs text-sfl-woodLight">${nft.boost}</td>
      <td class="px-3 py-2.5 font-bold text-sfl-green font-mono">${nft.price.toFixed(2)} ${typeof FLOWER_ICON !== 'undefined' ? FLOWER_ICON : 'Flowers'}</td>
      <td class="px-2 py-2.5 text-center">
        <button onclick="removeFromWishlist(${index})" class="bg-sfl-accent text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 shadow-sm">🗑️ Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const grandTotalCoins = grandTotalFlowers * coinRatio;

  document.getElementById('wishlist-item-count').textContent = `${wishlistItems.length} Item${wishlistItems.length === 1 ? '' : 's'}`;
  document.getElementById('wishlist-total-flowers').textContent = grandTotalFlowers.toFixed(2);
  document.getElementById('wishlist-total-coins').textContent = grandTotalCoins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
