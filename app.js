(() => {
  'use strict';

  const WHATSAPP_NUMBER = '256780844098';
  const FREE_DELIVERY_THRESHOLD = 150000;
  const INITIAL_VISIBLE = 24;
  const PAGE_STEP = 24;
  const NEW_ARRIVAL_COUNT = 12;
  const STORAGE_KEYS = {
    theme: 'bros_theme',
    age: 'bros_age_verified',
    cart: 'bros_cart_v2',
    wishlist: 'bros_wishlist_v2',
    session: 'bros_session_id',
    orders: 'bros_orders_v1',
  };

  const CATEGORY_META = {
    'All': {
      blurb: 'Every item currently listed in the Bros catalogue.',
      tone: 'amber',
      icon: '<svg viewBox="0 0 24 24"><path d="m12 3 2.3 6.4L21 12l-6.7 2.6L12 21l-2.3-6.4L3 12l6.7-2.6L12 3Z"/></svg>',
    },
    'Vapes': {
      blurb: 'Disposables, pods, mods, cartridges and e-liquids.',
      tone: 'amber',
      icon: '<svg viewBox="0 0 24 24"><rect x="9" y="6" width="6" height="14" rx="2"/><path d="M11 3h2v3h-2zM9 11h6"/></svg>',
    },
    'Bongs & Pipes': {
      blurb: 'Glass bongs, silicone bubblers, hookahs and hand pipes.',
      tone: 'ember',
      icon: '<svg viewBox="0 0 24 24"><path d="M4 14c0 3 2.5 5 5.5 5H15a3 3 0 0 0 3-3V7h-4v7H9.5A1.5 1.5 0 0 1 8 12.5V10H4v4Z"/></svg>',
    },
    'Lighters': {
      blurb: 'Everyday flames, clipper icons and windproof torches.',
      tone: 'gold',
      icon: '<svg viewBox="0 0 24 24"><path d="M12 3c2.5 2.4 3.5 4.4 3.5 6.2a3.5 3.5 0 1 1-7 0C8.5 7.4 9.5 5.4 12 3Z"/><rect x="7" y="12" width="10" height="9" rx="2"/></svg>',
    },
    'Accessories': {
      blurb: 'Pouches, jars, tins, scales, cutters and setup essentials.',
      tone: 'crimson',
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v3m0 10v3M4 12h3m10 0h3"/></svg>',
    },
    'Rolling Papers': {
      blurb: 'Papers, cones, wraps, filter tips and organic hemp.',
      tone: 'gold',
      icon: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h8m-8 4h5"/></svg>',
    },
    'Ashtrays': {
      blurb: 'Glass, silicone, metal and character ashtrays.',
      tone: 'ember',
      icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="11" rx="8" ry="3.5"/><path d="M4 11v3c0 2.5 3.6 4.5 8 4.5s8-2 8-4.5v-3"/></svg>',
    },
    'Grinders': {
      blurb: 'Precision metal, drum, and character dry herb grinders.',
      tone: 'amber',
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    },
    'Rollers': {
      blurb: 'Automatic, bamboo, and king-size rolling machines.',
      tone: 'gold',
      icon: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>',
    },
    'Rolling Trays': {
      blurb: 'Metal and shatterproof glass rolling trays.',
      tone: 'crimson',
      icon: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M6 9h12v6H6z"/></svg>',
    },
  };

  function getSessionId() {
    try {
      let sid = localStorage.getItem(STORAGE_KEYS.session);
      if (!sid) {
        sid = 'bros_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
        localStorage.setItem(STORAGE_KEYS.session, sid);
      }
      return sid;
    } catch (_) {
      return 'bros_guest';
    }
  }

  const SESSION_ID = getSessionId();

  async function apiRequest(endpoint, options = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 12000) : null;
    try {
      const headers = Object.assign(
        { 'Content-Type': 'application/json', 'X-Session-Id': SESSION_ID },
        options.headers || {}
      );
      const requestOptions = Object.assign({}, options, { headers });
      if (controller) requestOptions.signal = controller.signal;
      const res = await fetch(endpoint, requestOptions);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }

  function getProductUrl(productOrId) {
    const id = typeof productOrId === 'object' ? productOrId.id : productOrId;
    return `product.html?id=${encodeURIComponent(id)}`;
  }

  const rawProducts = typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS)
    ? PRODUCTS
    : (Array.isArray(window.PRODUCTS) ? window.PRODUCTS : []);

  const products = rawProducts.map((item, index) => {
    if (Array.isArray(item)) {
      const priceNumber = Number(item[1]) || 0;
      const soldOut = Boolean(item[4]);
      const badge = index < NEW_ARRIVAL_COUNT && !soldOut ? 'New' : '';
      return {
        id: index,
        name: String(item[0] || '').trim(),
        category: String(item[3] || 'Accessories').trim(),
        price: formatUGX(priceNumber),
        priceNumber,
        image: String(item[2] || '').trim(),
        badge,
        soldOut,
        searchText: `${item[0] || ''} ${item[3] || ''} ${badge}`.toLowerCase(),
      };
    }
    const priceNumber = parsePrice(item.price);
    return {
      id: index,
      name: String(item.name || '').trim(),
      category: String(item.category || 'Accessories').trim(),
      price: String(item.price || 'UGX 0').trim(),
      priceNumber,
      image: String(item.image || '').trim(),
      badge: item.badge ? String(item.badge).trim() : '',
      soldOut: Boolean(item.soldOut),
      searchText: `${item.name || ''} ${item.category || ''} ${item.badge || ''}`.toLowerCase(),
    };
  });

  const categories = buildCategories(products);
  const state = {
    category: 'All',
    quickFilter: 'all',
    search: '',
    price: 'all',
    sort: 'featured',
    availableOnly: false,
    visibleCount: INITIAL_VISIBLE,
    cart: loadCart(),
    wishlist: loadWishlist(),
    compare: new Set(),
    heroIndex: 0,
    heroTimer: null,
    lastFocusedElement: null,
    orders: loadOrders(),
  };

  const els = {
    ageGate: document.getElementById('ageGate'),
    ageActions: document.getElementById('ageActions'),
    ageDenied: document.getElementById('ageDenied'),
    themeToggle: document.getElementById('themeToggle'),
    languageToggle: document.getElementById('languageToggle'),
    languageMenu: document.getElementById('languageMenu'),
    departmentToggle: document.getElementById('departmentToggle'),
    departmentMenu: document.getElementById('departmentMenu'),
    megaCategories: document.getElementById('megaCategories'),
    mobileMenuToggle: document.getElementById('mobileMenuToggle'),
    mobileMenu: document.getElementById('mobileMenu'),
    mobileDepartments: document.getElementById('mobileDepartments'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchSuggestions: document.getElementById('searchSuggestions'),
    wishlistToggle: document.getElementById('wishlistToggle'),
    wishlistCount: document.getElementById('wishlistCount'),
    savedTabCount: document.getElementById('savedTabCount'),
    cartToggle: document.getElementById('cartToggle'),
    cartCount: document.getElementById('cartCount'),
    mobileCartCount: document.getElementById('mobileCartCount'),
    cartTotal: document.getElementById('cartTotal'),
    heroImageFrame: document.getElementById('heroImageFrame'),
    heroImage: document.getElementById('heroImage'),
    heroProductCategory: document.getElementById('heroProductCategory'),
    heroSlideCounter: document.getElementById('heroSlideCounter'),
    heroProductName: document.getElementById('heroProductName'),
    heroProductNameLink: document.getElementById('heroProductNameLink'),
    heroProductPrice: document.getElementById('heroProductPrice'),
    heroWhatsApp: document.getElementById('heroWhatsApp'),
    heroDots: document.getElementById('heroDots'),
    heroPrevious: document.getElementById('heroPrevious'),
    heroNext: document.getElementById('heroNext'),
    categoryGrid: document.getElementById('categoryGrid'),
    featuredProducts: document.getElementById('featuredProducts'),
    filterBar: document.getElementById('filterBar'),
    priceFilter: document.getElementById('priceFilter'),
    sortSelect: document.getElementById('sortSelect'),
    availableOnly: document.getElementById('availableOnly'),
    clearFilters: document.getElementById('clearFilters'),
    emptyClear: document.getElementById('emptyClear'),
    allCount: document.getElementById('allCount'),
    resultsCount: document.getElementById('resultsCount'),
    productsGrid: document.getElementById('productsGrid'),
    emptyState: document.getElementById('emptyState'),
    loadMore: document.getElementById('loadMore'),
    compareBar: document.getElementById('compareBar'),
    compareCount: document.getElementById('compareCount'),
    compareClear: document.getElementById('compareClear'),
    compareOpen: document.getElementById('compareOpen'),
    compareDialog: document.getElementById('compareDialog'),
    compareContent: document.getElementById('compareContent'),
    quickView: document.getElementById('quickView'),
    quickViewContent: document.getElementById('quickViewContent'),
    cartDialog: document.getElementById('cartDialog'),
    cartHeadingCount: document.getElementById('cartHeadingCount'),
    cartItems: document.getElementById('cartItems'),
    cartEmpty: document.getElementById('cartEmpty'),
    cartFooter: document.getElementById('cartFooter'),
    cartSubtotal: document.getElementById('cartSubtotal'),
    cartDeliveryHint: document.getElementById('cartDeliveryHint'),
    checkoutWhatsApp: document.getElementById('checkoutWhatsApp'),
    openCheckoutModal: document.getElementById('openCheckoutModal'),
    checkoutDialog: document.getElementById('checkoutDialog'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutSummaryBox: document.getElementById('checkoutSummaryBox'),
    checkoutError: document.getElementById('checkoutError'),
    orderConfirmationBox: document.getElementById('orderConfirmationBox'),
    ordersDialog: document.getElementById('ordersDialog'),
    ordersBody: document.getElementById('ordersBody'),
    toastRegion: document.getElementById('toastRegion'),
    scrollTop: document.getElementById('scrollTop'),
    updatesForm: document.getElementById('updatesForm'),
    updatesEmail: document.getElementById('updatesEmail'),
    updatesFeedback: document.getElementById('updatesFeedback'),
    currentYear: document.getElementById('currentYear'),
  };

  init();

  function init() {
    if (els.currentYear) els.currentYear.textContent = String(new Date().getFullYear());
    if (els.allCount) els.allCount.textContent = String(products.length);

    applyQueryFilters();
    syncThemeControl();
    initAgeGate();
    renderCategories();
    renderHero();
    renderFeatured();
    renderCatalogue();
    updateCartUI();
    updateWishlistUI();
    updateCompareUI();
    bindEvents();
    syncFromBackend();
  }

  function applyQueryFilters() {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category');
      const q = params.get('q');
      const filter = params.get('filter');
      if (cat && categories.some(c => c.name.toLowerCase() === cat.toLowerCase())) {
        const matched = categories.find(c => c.name.toLowerCase() === cat.toLowerCase());
        state.category = matched.name;
      }
      if (q) {
        state.search = q;
        if (els.searchInput) els.searchInput.value = q;
        if (els.searchClear) els.searchClear.hidden = !q;
      }
      if (filter && ['all', 'new', 'available', 'under-100', 'wishlist'].includes(filter)) {
        state.quickFilter = filter;
      }
    } catch (_) {}
  }

  async function syncFromBackend() {
    const [cartData, wishlistData] = await Promise.all([
      apiRequest(`/api/cart?session_id=${encodeURIComponent(SESSION_ID)}`),
      apiRequest(`/api/wishlist?session_id=${encodeURIComponent(SESSION_ID)}`),
    ]);

    if (cartData && cartData.items && typeof cartData.items === 'object') {
      const serverEntries = Object.entries(cartData.items);
      if (serverEntries.length > 0 && Object.keys(state.cart).length === 0) {
        serverEntries.forEach(([k, v]) => {
          const id = Number(k);
          const qty = Number(v);
          if (products[id] && qty > 0) state.cart[id] = qty;
        });
        saveCartLocal();
        updateCartUI();
      } else if (Object.keys(state.cart).length > 0) {
        apiRequest('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ session_id: SESSION_ID, items: state.cart }),
        });
      }
    }

    if (wishlistData && Array.isArray(wishlistData.items)) {
      if (wishlistData.items.length > 0 && state.wishlist.size === 0) {
        wishlistData.items.forEach(id => {
          if (products[Number(id)]) state.wishlist.add(Number(id));
        });
        saveWishlistLocal();
        updateWishlistUI();
      } else if (state.wishlist.size > 0) {
        apiRequest('/api/wishlist', {
          method: 'POST',
          body: JSON.stringify({ session_id: SESSION_ID, items: [...state.wishlist] }),
        });
      }
    }
  }

  function parsePrice(price) {
    const digits = String(price || '').replace(/[^\d]/g, '');
    return Number(digits) || 0;
  }

  function formatUGX(amount) {
    return `UGX ${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildWhatsAppUrl(message) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function productWhatsAppUrl(product, quantity = 1) {
    const qtyText = quantity > 1 ? ` (Qty: ${quantity})` : '';
    return buildWhatsAppUrl(`Hi Bros, I'd like to order ${product.name}${qtyText} listed at ${product.price}. Is it available?`);
  }

  function buildCategories(items) {
    const counts = new Map();
    items.forEach((product) => {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    });

    const ordered = [
      'All',
      'Vapes',
      'Bongs & Pipes',
      'Lighters',
      'Accessories',
      'Rolling Papers',
      'Ashtrays',
      'Grinders',
      'Rollers',
      'Rolling Trays',
    ];

    counts.forEach((_, category) => {
      if (!ordered.includes(category)) ordered.push(category);
    });

    return ordered
      .filter((category) => category === 'All' || counts.has(category))
      .map((category) => ({
        name: category,
        count: category === 'All' ? items.length : counts.get(category) || 0,
        ...(CATEGORY_META[category] || CATEGORY_META.Accessories),
      }));
  }

  function initAgeGate() {
    if (!els.ageGate) return;
    let verified = false;
    try {
      verified = localStorage.getItem(STORAGE_KEYS.age) === '1';
    } catch (_) {}

    if (verified) {
      els.ageGate.hidden = true;
      document.documentElement.classList.add('age-verified');
      return;
    }

    const confirmButton = els.ageGate.querySelector('[data-age-confirm]');
    const denyButton = els.ageGate.querySelector('[data-age-deny]');
    window.setTimeout(() => confirmButton?.focus(), 40);

    confirmButton?.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE_KEYS.age, '1');
      } catch (_) {}
      document.documentElement.classList.add('age-verified');
      els.ageGate.hidden = true;
      showToast('Welcome to Bros.');
    });

    denyButton?.addEventListener('click', () => {
      if (els.ageActions) els.ageActions.hidden = true;
      if (els.ageDenied) {
        els.ageDenied.hidden = false;
        els.ageDenied.focus();
      }
    });
  }

  function syncThemeControl() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    els.themeToggle?.setAttribute('aria-label', label);
    els.themeToggle?.setAttribute('title', label);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', isDark ? '#110604' : '#fbf7f2');
  }

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    } catch (_) {}
    syncThemeControl();
  }

  function wireImageFallback(img, product) {
    if (!img) return;
    // Replace the handler when a persistent image (like the hero) changes products.
    img.onerror = () => {
      img.classList.add('is-broken');
      const parent = img.parentElement;
      if (parent && !parent.querySelector('.image-fallback')) {
        const fallback = document.createElement('span');
        fallback.className = 'image-fallback';
        fallback.innerHTML = `<strong>b.</strong><small>${escapeHtml(product?.category || 'Bros')}</small>`;
        parent.appendChild(fallback);
      }
    };
  }

  function getHeroProducts() {
    const picks = [
      products[0],
      products[5],
      products[7],
      products[19],
    ].filter(Boolean);
    return picks.length ? picks : products.slice(0, 3);
  }

  function renderHero() {
    const heroProducts = getHeroProducts();
    if (!heroProducts.length) return;

    if (els.heroDots) {
      els.heroDots.innerHTML = heroProducts
        .map((product, index) => `
          <button class="hero-dot ${index === state.heroIndex ? 'is-active' : ''}" type="button" data-hero-index="${index}" aria-label="Show ${escapeHtml(product.name)}" aria-pressed="${index === state.heroIndex}"></button>
        `)
        .join('');
    }

    updateHeroSlide(heroProducts);

    if (els.heroImageFrame) {
      const openCurrentHeroProduct = () => {
        const current = heroProducts[state.heroIndex] || heroProducts[0];
        if (current) window.location.href = getProductUrl(current);
      };
      els.heroImageFrame.addEventListener('click', openCurrentHeroProduct);
      els.heroImageFrame.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCurrentHeroProduct();
        }
      });
    }

    els.heroPrevious?.addEventListener('click', () => {
      state.heroIndex = (state.heroIndex - 1 + heroProducts.length) % heroProducts.length;
      updateHeroSlide(heroProducts);
      restartHeroTimer(heroProducts);
    });

    els.heroNext?.addEventListener('click', () => {
      state.heroIndex = (state.heroIndex + 1) % heroProducts.length;
      updateHeroSlide(heroProducts);
      restartHeroTimer(heroProducts);
    });

    els.heroDots?.addEventListener('click', (event) => {
      const dot = event.target.closest('[data-hero-index]');
      if (!dot) return;
      state.heroIndex = Number(dot.dataset.heroIndex) || 0;
      updateHeroSlide(heroProducts);
      restartHeroTimer(heroProducts);
    });

    restartHeroTimer(heroProducts);
  }

  function updateHeroSlide(heroProducts) {
    const product = heroProducts[state.heroIndex] || heroProducts[0];
    if (!product) return;

    if (els.heroImage) {
      els.heroImage.classList.remove('is-broken');
      els.heroImage.parentElement?.querySelector('.image-fallback')?.remove();
      els.heroImage.src = product.image;
      els.heroImage.alt = product.name;
      wireImageFallback(els.heroImage, product);
    }
    if (els.heroProductCategory) els.heroProductCategory.textContent = product.category;
    if (els.heroSlideCounter) {
      els.heroSlideCounter.textContent = `${String(state.heroIndex + 1).padStart(2, '0')} / ${String(heroProducts.length).padStart(2, '0')}`;
    }
    if (els.heroProductNameLink) {
      els.heroProductNameLink.textContent = product.name;
      els.heroProductNameLink.href = getProductUrl(product);
    } else if (els.heroProductName) {
      els.heroProductName.textContent = product.name;
    }
    if (els.heroProductPrice) els.heroProductPrice.textContent = product.price;
    if (els.heroWhatsApp) {
      els.heroWhatsApp.href = productWhatsAppUrl(product);
      els.heroWhatsApp.setAttribute('aria-label', `Ask Bros about ${product.name} on WhatsApp`);
    }

    els.heroDots?.querySelectorAll('.hero-dot').forEach((dot, index) => {
      const active = index === state.heroIndex;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-pressed', String(active));
    });
  }

  function restartHeroTimer(heroProducts) {
    window.clearInterval(state.heroTimer);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    state.heroTimer = window.setInterval(() => {
      state.heroIndex = (state.heroIndex + 1) % heroProducts.length;
      updateHeroSlide(heroProducts);
    }, 6500);
  }

  function renderCategories() {
    const departmentCategories = categories.filter((category) => category.name !== 'All');

    if (els.categoryGrid) {
      els.categoryGrid.innerHTML = departmentCategories
        .map((category) => `
          <button class="category-tile category-card tone-${escapeHtml(category.tone)} ${state.category === category.name ? 'is-active' : ''}" type="button" data-select-category="${escapeHtml(category.name)}">
            <span class="category-icon" aria-hidden="true">${category.icon}</span>
            <span class="category-name">${escapeHtml(category.name)}</span>
            <small class="category-count">${category.count} items</small>
          </button>
        `)
        .join('');
    }

    if (els.filterBar) {
      els.filterBar.innerHTML = categories
        .map((category) => {
          const active = state.category === category.name;
          return `
            <button class="category-chip filter-chip ${active ? 'is-active' : ''}" type="button" data-select-category="${escapeHtml(category.name)}" aria-pressed="${active}">
              <span>${escapeHtml(category.name)}</span>
              <span class="chip-count">${category.count}</span>
            </button>
          `;
        })
        .join('');
    }

    if (els.megaCategories) {
      els.megaCategories.innerHTML = departmentCategories
        .map((category) => `
          <button class="mega-category" type="button" data-select-category="${escapeHtml(category.name)}">
            <span class="mega-category-icon mega-icon tone-${escapeHtml(category.tone)}" aria-hidden="true">${category.icon}</span>
            <span>
              <strong>${escapeHtml(category.name)} <em>(${category.count})</em></strong>
              <small>${escapeHtml(category.blurb)}</small>
            </span>
          </button>
        `)
        .join('');
    }

    if (els.mobileDepartments) {
      els.mobileDepartments.innerHTML = departmentCategories
        .map((category) => `
          <button type="button" data-select-category="${escapeHtml(category.name)}">
            <span aria-hidden="true">${category.icon}</span>${escapeHtml(category.name)}
          </button>
        `)
        .join('');
    }
  }

  function renderFeatured() {
    if (!els.featuredProducts) return;
    const featuredIds = [0, 1, 5, 7, 8, 14, 19, 28];
    const featured = featuredIds.map((id) => products[id]).filter(Boolean);
    els.featuredProducts.innerHTML = featured.map((product) => renderProductCard(product, { compact: true })).join('');
    wireCardImages(els.featuredProducts);
  }

  function getFilteredProducts() {
    const query = state.search.trim().toLowerCase();

    const filtered = products.filter((product) => {
      if (state.category !== 'All' && product.category !== state.category) return false;
      if (state.availableOnly && product.soldOut) return false;
      if (state.quickFilter === 'new' && product.badge !== 'New') return false;
      if (state.quickFilter === 'available' && product.soldOut) return false;
      if (state.quickFilter === 'under-100' && (product.priceNumber <= 0 || product.priceNumber > 100000)) return false;
      if (state.quickFilter === 'wishlist' && !state.wishlist.has(product.id)) return false;
      if (!matchesPriceFilter(product.priceNumber, state.price)) return false;
      if (query && !product.searchText.includes(query)) return false;
      return true;
    });

    return sortProducts(filtered, state.sort);
  }

  function matchesPriceFilter(price, filter) {
    if (filter === 'under-50') return price > 0 && price < 50000;
    if (filter === '50-100') return price >= 50000 && price <= 100000;
    if (filter === '100-200') return price > 100000 && price <= 200000;
    if (filter === 'over-200') return price > 200000;
    return true;
  }

  function sortProducts(list, sort) {
    const copy = [...list];
    if (sort === 'price-low') {
      return copy.sort((a, b) => a.priceNumber - b.priceNumber || a.id - b.id);
    }
    if (sort === 'price-high') {
      return copy.sort((a, b) => b.priceNumber - a.priceNumber || a.id - b.id);
    }
    if (sort === 'name') {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy.sort((a, b) => Number(a.soldOut) - Number(b.soldOut) || Number(b.badge === 'New') - Number(a.badge === 'New') || a.id - b.id);
  }

  function renderCatalogue() {
    const filtered = getFilteredProducts();
    const visible = filtered.slice(0, state.visibleCount);

    syncCategorySelection();
    syncQuickTabs();
    syncClearButton();

    if (els.resultsCount) {
      els.resultsCount.textContent = buildResultsSummary(filtered.length, visible.length);
    }

    if (els.productsGrid) {
      els.productsGrid.innerHTML = visible.map((product) => renderProductCard(product)).join('');
      wireCardImages(els.productsGrid);
    }

    if (els.emptyState) {
      els.emptyState.hidden = filtered.length > 0;
    }

    if (els.loadMore) {
      const remaining = filtered.length - visible.length;
      els.loadMore.hidden = remaining <= 0;
      if (remaining > 0) {
        els.loadMore.innerHTML = `Show ${Math.min(PAGE_STEP, remaining)} more (${remaining} remaining) <span aria-hidden="true">↓</span>`;
      }
    }
  }

  function buildResultsSummary(total, visible) {
    if (total === 0) return 'No matching products found';
    const parts = [];
    if (state.category !== 'All') parts.push(state.category);
    if (state.quickFilter === 'new') parts.push('new arrivals');
    if (state.quickFilter === 'available' || state.availableOnly) parts.push('available now');
    if (state.quickFilter === 'under-100') parts.push('under UGX 100,000');
    if (state.quickFilter === 'wishlist') parts.push('saved items');
    if (state.search.trim()) parts.push(`matching "${state.search.trim()}"`);

    const context = parts.length ? ` in ${parts.join(' · ')}` : '';
    return `Showing ${visible} of ${total} products${context}`;
  }

  function renderProductCard(product, options = {}) {
    const saved = state.wishlist.has(product.id);
    const compared = state.compare.has(product.id);
    const badgeLabel = product.soldOut ? 'Sold out' : product.badge;
    const badgeClass = product.soldOut ? ' is-sold' : product.badge ? ' is-new' : '';
    const productHref = getProductUrl(product);

    return `
      <article class="product-card ${product.soldOut ? 'is-unavailable' : ''} ${options.compact ? 'is-compact' : ''}" data-product-id="${product.id}" data-product-href="${escapeHtml(productHref)}">
        <div class="product-media" role="link" tabindex="0" data-open-page="${product.id}" aria-label="Open ${escapeHtml(product.name)} product page">
          <img class="upscaled-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">
          ${badgeLabel ? `<span class="product-badge${badgeClass}">${escapeHtml(badgeLabel)}</span>` : ''}
          <div class="product-card-actions">
            <button class="product-mini-action ${saved ? 'is-saved' : ''}" type="button" data-toggle-wishlist="${product.id}" aria-label="${saved ? 'Remove' : 'Save'} ${escapeHtml(product.name)}" aria-pressed="${saved}" title="${saved ? 'Remove from saved items' : 'Save for later'}">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>
            </button>
            <button class="product-mini-action ${compared ? 'is-compared' : ''}" type="button" data-toggle-compare="${product.id}" aria-label="Compare ${escapeHtml(product.name)}" aria-pressed="${compared}" title="Compare product">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 4H4v4m0-4 6 6m6 10h4v-4m0 4-6-6M4 16v4h4m-4 0 6-6m10-6V4h-4m4 0-6 6"/></svg>
            </button>
          </div>
          <button class="quick-view-button" type="button" data-quick-view="${product.id}">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.7 12s3.3-6 9.3-6 9.3 6 9.3 6-3.3 6-9.3 6-9.3-6-9.3-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            Quick view
          </button>
        </div>
        <div class="product-info">
          <div class="product-category"><span>${escapeHtml(product.category)}</span></div>
          <h3><a class="product-title-link" href="${escapeHtml(productHref)}">${escapeHtml(product.name)}</a></h3>
          <div class="product-price-line">
            <span class="product-price">${escapeHtml(product.price)}</span>
          </div>
          <div class="product-actions">
            <a class="product-chat" href="${escapeHtml(productWhatsAppUrl(product))}" target="_blank" rel="noopener noreferrer" aria-label="Ask about ${escapeHtml(product.name)} on WhatsApp">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19l.9-4.7A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 9.3c.5 1.7 1.8 3 3.5 3.7"/></svg>
              <span>${product.soldOut ? 'Ask restock' : 'WhatsApp'}</span>
            </a>
            <button class="product-add" type="button" data-add-to-cart="${product.id}" aria-label="Add ${escapeHtml(product.name)} to bag" title="Add to bag" ${product.soldOut ? 'disabled' : ''}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function wireCardImages(root) {
    root?.querySelectorAll('.product-card').forEach((card) => {
      const product = products[Number(card.dataset.productId)];
      const img = card.querySelector('img');
      if (product && img) wireImageFallback(img, product);
    });
  }

  function syncCategorySelection() {
    document.querySelectorAll('[data-select-category]').forEach((button) => {
      const active = button.dataset.selectCategory === state.category;
      button.classList.toggle('is-active', active);
      if (button.hasAttribute('aria-pressed')) {
        button.setAttribute('aria-pressed', String(active));
      }
    });
  }

  function syncQuickTabs() {
    document.querySelectorAll('.catalogue-tab').forEach((tab) => {
      const active = tab.dataset.quickFilter === state.quickFilter;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  function syncClearButton() {
    const hasFilters =
      state.category !== 'All' ||
      state.quickFilter !== 'all' ||
      state.search.trim() !== '' ||
      state.price !== 'all' ||
      state.sort !== 'featured' ||
      state.availableOnly;

    if (els.clearFilters) els.clearFilters.hidden = !hasFilters;
  }

  function setCategory(category, shouldScroll = true) {
    state.category = categories.some((item) => item.name === category) ? category : 'All';
    if (state.quickFilter === 'wishlist') state.quickFilter = 'all';
    state.visibleCount = INITIAL_VISIBLE;
    closeMenus();
    renderCatalogue();
    if (shouldScroll) scrollToCatalogue();
  }

  function resetFilters() {
    state.category = 'All';
    state.quickFilter = 'all';
    state.search = '';
    state.price = 'all';
    state.sort = 'featured';
    state.availableOnly = false;
    state.visibleCount = INITIAL_VISIBLE;

    if (els.searchInput) els.searchInput.value = '';
    if (els.searchClear) els.searchClear.hidden = true;
    if (els.priceFilter) els.priceFilter.value = 'all';
    if (els.sortSelect) els.sortSelect.value = 'featured';
    if (els.availableOnly) els.availableOnly.checked = false;

    hideSearchSuggestions();
    renderCatalogue();
  }

  function scrollToCatalogue() {
    document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSearchSuggestions() {
    if (!els.searchSuggestions || !els.searchInput) return;
    const query = state.search.trim().toLowerCase();
    if (!query) {
      hideSearchSuggestions();
      return;
    }

    const matches = products
      .filter((product) => product.searchText.includes(query))
      .slice(0, 6);

    if (!matches.length) {
      els.searchSuggestions.innerHTML = `
        <div class="suggestion-empty">
          <span>No direct matches for "${escapeHtml(state.search.trim())}".</span>
          <a href="${escapeHtml(buildWhatsAppUrl(`Hi Bros, I'm looking for ${state.search.trim()}. Do you have it available?`))}" target="_blank" rel="noopener noreferrer">Ask on WhatsApp ↗</a>
        </div>
      `;
      els.searchSuggestions.hidden = false;
      els.searchInput.setAttribute('aria-expanded', 'true');
      return;
    }

    els.searchSuggestions.innerHTML = matches
      .map((product) => `
        <a class="suggestion-item" role="option" href="${escapeHtml(getProductUrl(product))}">
          <img class="upscaled-img" src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async">
          <span class="suggestion-details">
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(product.category)} · ${product.soldOut ? 'Sold out' : 'Available'}</small>
          </span>
          <span class="suggestion-price">${escapeHtml(product.price)}</span>
        </a>
      `)
      .join('');

    els.searchSuggestions.hidden = false;
    els.searchInput.setAttribute('aria-expanded', 'true');
  }

  function hideSearchSuggestions() {
    if (!els.searchSuggestions || !els.searchInput) return;
    els.searchSuggestions.hidden = true;
    els.searchInput.setAttribute('aria-expanded', 'false');
  }

  function openQuickView(productId, trigger = document.activeElement) {
    const product = products[Number(productId)];
    if (!product || !els.quickView || !els.quickViewContent) return;

    state.lastFocusedElement = trigger;
    const saved = state.wishlist.has(product.id);
    const categoryMeta = CATEGORY_META[product.category] || CATEGORY_META.Accessories;
    const productHref = getProductUrl(product);
    const status = product.soldOut
      ? 'Currently sold out — ask us about restock.'
      : 'Listed as available. Ready for Kampala delivery.';

    els.quickViewContent.innerHTML = `
      <div class="quick-image">
        <img class="upscaled-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" decoding="async">
      </div>
      <div class="quick-details">
        <span class="eyebrow">${escapeHtml(product.category)}</span>
        <h2 id="quickTitle">${escapeHtml(product.name)}</h2>
        <span class="quick-status${product.soldOut ? ' is-sold' : ''}">${status}</span>
        <div class="quick-price">${escapeHtml(product.price)}</div>
        <p class="quick-copy">${escapeHtml(categoryMeta.blurb)} Confirm current stock, flavour or colour options and delivery timing directly with the Bros team.</p>
        <div class="quick-actions">
          <a class="button button-primary" href="${escapeHtml(productHref)}">Open Full Product Page →</a>
          ${product.soldOut
            ? `<a class="button button-whatsapp" href="${escapeHtml(buildWhatsAppUrl(`Hi Bros, please let me know when ${product.name} is back in stock.`))}" target="_blank" rel="noopener noreferrer">Ask about restock ↗</a>`
            : `<button class="button button-gold" type="button" data-add-to-cart="${product.id}">Add to bag</button>`
          }
        </div>
        <button class="quick-wishlist ${saved ? 'is-saved' : ''}" type="button" data-toggle-wishlist="${product.id}" aria-pressed="${saved}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>
          <span>${saved ? 'Saved in wishlist' : 'Save for later'}</span>
        </button>
      </div>
    `;

    wireImageFallback(els.quickViewContent.querySelector('.quick-image img'), product);
    openDialog(els.quickView);
  }

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || '{}');
      if (!parsed || typeof parsed !== 'object') return {};
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([id, qty]) => [Number(id), Math.max(1, Math.min(99, Number(qty) || 0))])
          .filter(([id, qty]) => products[id] && !products[id].soldOut && qty > 0)
      );
    } catch (_) {
      return {};
    }
  }

  function saveCartLocal() {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
    } catch (_) {}
  }

  function saveCart() {
    saveCartLocal();
    apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ session_id: SESSION_ID, items: state.cart }),
    });
  }

  function addToCart(productId, quantity = 1) {
    const product = products[Number(productId)];
    if (!product || product.soldOut) return;
    const nextQty = (state.cart[product.id] || 0) + quantity;
    state.cart[product.id] = Math.min(99, Math.max(1, nextQty));
    saveCart();
    updateCartUI();
    showToast(`Added ${product.name} to your bag.`);
  }

  function updateCartQuantity(productId, nextQty) {
    const id = Number(productId);
    if (!products[id]) return;
    if (nextQty <= 0) {
      delete state.cart[id];
    } else {
      state.cart[id] = Math.min(99, nextQty);
    }
    saveCart();
    updateCartUI();
  }

  function getCartEntries() {
    return Object.entries(state.cart)
      .map(([id, quantity]) => ({
        product: products[Number(id)],
        quantity: Number(quantity) || 0,
      }))
      .filter((entry) => entry.product && entry.quantity > 0);
  }

  function updateCartUI() {
    const entries = getCartEntries();
    const totalCount = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceNumber * entry.quantity, 0);
    const formattedSubtotal = formatUGX(subtotal);

    if (els.cartCount) els.cartCount.textContent = String(totalCount);
    if (els.mobileCartCount) els.mobileCartCount.textContent = String(totalCount);
    if (els.cartHeadingCount) els.cartHeadingCount.textContent = `(${totalCount})`;
    if (els.cartTotal) els.cartTotal.textContent = formattedSubtotal;
    if (els.cartSubtotal) els.cartSubtotal.textContent = formattedSubtotal;

    if (els.cartEmpty) els.cartEmpty.hidden = entries.length > 0;
    if (els.cartFooter) els.cartFooter.hidden = entries.length === 0;

    if (els.cartDeliveryHint) {
      const remaining = FREE_DELIVERY_THRESHOLD - subtotal;
      els.cartDeliveryHint.textContent = remaining > 0
        ? `Add ${formatUGX(remaining)} more for complimentary Kampala delivery, or confirm standard delivery on WhatsApp.`
        : 'Your bag qualifies for complimentary delivery in Kampala. Confirm timing with our team.';
    }

    if (els.cartItems) {
      els.cartItems.innerHTML = entries
        .map(({ product, quantity }) => `
          <article class="cart-line">
            <a href="${escapeHtml(getProductUrl(product))}" aria-label="View ${escapeHtml(product.name)}">
              <img class="upscaled-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
            </a>
            <div>
              <h3><a href="${escapeHtml(getProductUrl(product))}">${escapeHtml(product.name)}</a></h3>
              <p>${escapeHtml(product.price)} each</p>
              <button class="cart-remove" type="button" data-cart-remove="${product.id}">Remove</button>
            </div>
            <div class="cart-line-actions" aria-label="Quantity for ${escapeHtml(product.name)}">
              <button class="quantity-button" type="button" data-cart-qty="${product.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
              <span class="cart-quantity">${quantity}</span>
              <button class="quantity-button" type="button" data-cart-qty="${product.id}" data-delta="1" aria-label="Increase quantity">+</button>
            </div>
          </article>
        `)
        .join('');
    }
  }

  function checkoutOnWhatsApp() {
    const entries = getCartEntries();
    if (!entries.length) return;
    const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceNumber * entry.quantity, 0);
    const lines = entries.map(({ product, quantity }) => `- ${quantity}x ${product.name} (${product.price})`);
    const message = [
      'Hi Bros! I would like to place an order:',
      '',
      ...lines,
      '',
      `Estimated total: ${formatUGX(subtotal)}`,
      'Please confirm availability and delivery details.',
    ].join('\n');

    window.open(buildWhatsAppUrl(message), '_blank', 'noopener,noreferrer');
  }

  function getDeliveryFee(subtotal, paymentMethod = '') {
    return subtotal >= FREE_DELIVERY_THRESHOLD || /pickup/i.test(paymentMethod) ? 0 : 10000;
  }

  function syncCheckoutLocationField() {
    const paymentMethod = document.getElementById('orderPaymentMethod')?.value || '';
    const areaInput = document.getElementById('orderDeliveryArea');
    const areaLabel = document.getElementById('orderDeliveryAreaLabel');
    const isPickup = /pickup/i.test(paymentMethod);

    if (areaInput) {
      areaInput.required = !isPickup;
      areaInput.setAttribute('aria-required', String(!isPickup));
      areaInput.placeholder = isPickup ? 'Optional for store pickup' : 'e.g. Kololo, Ntinda, or Nakasero';
    }
    if (areaLabel) {
      areaLabel.textContent = isPickup
        ? 'Pickup location (optional)'
        : 'Kampala area or delivery location *';
    }
    renderCheckoutSummary();
  }

  function renderCheckoutSummary() {
    const entries = getCartEntries();
    if (!entries.length || !els.checkoutSummaryBox) return;
    const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceNumber * entry.quantity, 0);
    const paymentMethod = document.getElementById('orderPaymentMethod')?.value || '';
    const isPickup = /pickup/i.test(paymentMethod);
    const deliveryFee = getDeliveryFee(subtotal, paymentMethod);
    const total = subtotal + deliveryFee;
    els.checkoutSummaryBox.innerHTML = `
      <div class="summary-line"><span>Items (${entries.reduce((sum, entry) => sum + entry.quantity, 0)})</span><strong>${formatUGX(subtotal)}</strong></div>
      <div class="summary-line"><span>${isPickup ? 'Fulfilment' : 'Kampala Delivery'}</span><strong>${isPickup ? 'Store pickup' : deliveryFee === 0 ? 'FREE' : formatUGX(deliveryFee)}</strong></div>
      <div class="summary-line summary-total"><span>Total Payable</span><strong>${formatUGX(total)}</strong></div>
    `;
  }

  function openCheckoutDialog() {
    const entries = getCartEntries();
    if (!entries.length || !els.checkoutDialog) return;

    if (els.checkoutForm) els.checkoutForm.hidden = false;
    if (els.orderConfirmationBox) els.orderConfirmationBox.hidden = true;
    if (els.checkoutError) {
      els.checkoutError.hidden = true;
      els.checkoutError.textContent = '';
    }
    renderCheckoutSummary();
    closeDialog(els.cartDialog);
    openDialog(els.checkoutDialog);
  }

  async function submitOrder(event) {
    event.preventDefault();
    const entries = getCartEntries();
    if (!entries.length) return;

    const customerName = document.getElementById('orderCustomerName')?.value.trim() || '';
    const customerPhone = document.getElementById('orderCustomerPhone')?.value.trim() || '';
    const paymentMethod = document.getElementById('orderPaymentMethod')?.value || 'Cash on Delivery';
    const isPickup = /pickup/i.test(paymentMethod);
    const deliveryArea = document.getElementById('orderDeliveryArea')?.value.trim() || (isPickup ? 'Kampala' : '');
    const deliveryNotes = document.getElementById('orderDeliveryNotes')?.value.trim() || '';

    if (!customerName || !customerPhone || (!isPickup && !deliveryArea)) {
      showToast(isPickup
        ? 'Please fill in your name and phone number.'
        : 'Please fill in your name, phone number, and Kampala delivery area.');
      return;
    }

    const submitBtn = document.getElementById('submitOrderBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing order...';
    }

    const payload = {
      session_id: SESSION_ID,
      customer_name: customerName,
      customer_phone: customerPhone,
      delivery_area: deliveryArea,
      delivery_notes: deliveryNotes,
      payment_method: paymentMethod,
      items: entries.map(({ product, quantity }) => ({
        id: product.id,
        quantity,
      })),
    };

    const res = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Order';
    }

    if (!res || !res.order) {
      const fallbackUrl = buildWhatsAppUrl([
        'Hi Bros! I could not complete checkout on the website and would like to place this order:',
        '',
        ...entries.map(({ product, quantity }) => `- ${quantity}x ${product.name} (${product.price})`),
        '',
        `Name: ${customerName}`,
        `Phone: ${customerPhone}`,
        `${isPickup ? 'Fulfilment' : 'Delivery area'}: ${isPickup ? 'Store pickup in Kampala' : deliveryArea}`,
        `Payment: ${paymentMethod}`,
        ...(deliveryNotes ? [`Notes: ${deliveryNotes}`] : []),
      ].join('\n'));
      if (els.checkoutError) {
        els.checkoutError.innerHTML = `We couldn't save your order just now. Your bag is safe — please retry, or <a href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noopener noreferrer">send it to Bros on WhatsApp</a>.`;
        els.checkoutError.hidden = false;
      }
      showToast('Order was not saved. Your bag is still available.');
      return;
    }

    const orderRecord = res.order;
    orderRecord.order_code = orderRecord.order_code || orderRecord.orderRef;
    orderRecord.customer_name = orderRecord.customer_name || orderRecord.customerName || customerName;
    orderRecord.delivery_area = orderRecord.delivery_area || orderRecord.deliveryArea || deliveryArea;
    orderRecord.whatsapp_url = orderRecord.whatsapp_url || orderRecord.whatsappUrl || buildWhatsAppUrl(
      `Hi Bros! Please confirm order ${orderRecord.order_code} for ${customerName} to ${deliveryArea}.`
    );

    state.orders.unshift(orderRecord);
    saveOrdersLocal();

    const orderIsPickup = /pickup/i.test(
      orderRecord.payment_method || orderRecord.paymentMethod || paymentMethod
    );
    const fulfillmentCopy = orderIsPickup
      ? 'for store pickup in Kampala'
      : `for delivery to <strong>${escapeHtml(orderRecord.delivery_area)}</strong>`;

    state.cart = {};
    saveCart();
    updateCartUI();

    if (els.checkoutForm) els.checkoutForm.hidden = true;
    if (els.orderConfirmationBox) {
      els.orderConfirmationBox.hidden = false;
      els.orderConfirmationBox.innerHTML = `
        <div class="order-success-card">
          <span class="eyebrow-pill"><span class="eyebrow-dot"></span> Order Confirmed</span>
          <h3>Thank you, ${escapeHtml(orderRecord.customer_name)}!</h3>
          <p>Your order <strong>${escapeHtml(orderRecord.order_code)}</strong> has been registered ${fulfillmentCopy}.</p>
          <div class="order-code-banner">
            <span>Order Reference</span>
            <strong>${escapeHtml(orderRecord.order_code)}</strong>
          </div>
          <div class="order-success-actions">
            <a class="button button-whatsapp" href="${escapeHtml(orderRecord.whatsapp_url)}" target="_blank" rel="noopener noreferrer">
              Send Order ${escapeHtml(orderRecord.order_code)} on WhatsApp ↗
            </a>
            <button class="button button-outline" type="button" data-close-dialog>Continue Shopping</button>
          </div>
        </div>
      `;
    }

    showToast(`Order ${orderRecord.order_code} created!`);
  }

  function loadOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveOrdersLocal() {
    try {
      localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(state.orders.slice(0, 20)));
    } catch (_) {}
  }

  async function openOrdersDialog(trigger = document.activeElement) {
    if (!els.ordersDialog || !els.ordersBody) return;
    state.lastFocusedElement = trigger;

    const apiData = await apiRequest(`/api/orders?session_id=${encodeURIComponent(SESSION_ID)}`);
    if (apiData && Array.isArray(apiData.orders) && apiData.orders.length > 0) {
      state.orders = apiData.orders;
      saveOrdersLocal();
    }

    if (!state.orders.length) {
      els.ordersBody.innerHTML = `
        <div class="cart-empty">
          <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></div>
          <h3>No orders yet</h3>
          <p>When you place an order through Bros, your order ID and status will appear here.</p>
        </div>
      `;
    } else {
      els.ordersBody.innerHTML = `
        <div class="orders-list">
          ${state.orders.map((o) => {
            const isPickup = /pickup/i.test(o.payment_method || o.paymentMethod || '');
            const fulfillment = isPickup
              ? 'Store pickup in Kampala'
              : `Deliver to: <strong>${escapeHtml(o.delivery_area || o.deliveryArea || 'Kampala')}</strong>`;
            return `
              <div class="order-item-card">
                <div class="order-item-top">
                  <strong>${escapeHtml(o.order_code || o.orderRef)}</strong>
                  <span class="order-status-pill">${escapeHtml(o.status || 'confirmed')}</span>
                </div>
                <p class="order-item-meta">${fulfillment} · Total: <strong>${formatUGX(o.total)}</strong></p>
                ${Array.isArray(o.items) ? `<p class="order-item-products">${o.items.map(i => `${i.quantity}× ${escapeHtml(i.name)}`).join(', ')}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    openDialog(els.ordersDialog);
  }

  function loadWishlist() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(Number).filter((id) => products[id]) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveWishlistLocal() {
    try {
      localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify([...state.wishlist]));
    } catch (_) {}
  }

  function saveWishlist() {
    saveWishlistLocal();
    apiRequest('/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ session_id: SESSION_ID, items: [...state.wishlist] }),
    });
  }

  function toggleWishlist(productId) {
    const id = Number(productId);
    const product = products[id];
    if (!product) return;

    if (state.wishlist.has(id)) {
      state.wishlist.delete(id);
      showToast(`Removed ${product.name} from saved items.`);
    } else {
      state.wishlist.add(id);
      showToast(`Saved ${product.name}.`);
    }

    saveWishlist();
    updateWishlistUI();
    renderFeatured();
    renderCatalogue();
  }

  function updateWishlistUI() {
    const count = state.wishlist.size;
    if (els.wishlistCount) {
      els.wishlistCount.textContent = String(count);
      els.wishlistCount.hidden = count === 0;
    }
    if (els.savedTabCount) {
      els.savedTabCount.textContent = String(count);
    }
  }

  function toggleCompare(productId) {
    const id = Number(productId);
    const product = products[id];
    if (!product) return;

    if (state.compare.has(id)) {
      state.compare.delete(id);
    } else {
      if (state.compare.size >= 4) {
        showToast('You can compare up to 4 products at a time.');
        return;
      }
      state.compare.add(id);
      showToast(`Added ${product.name} to comparison.`);
    }

    updateCompareUI();
    renderFeatured();
    renderCatalogue();
  }

  function updateCompareUI() {
    const count = state.compare.size;
    if (els.compareBar) els.compareBar.hidden = count === 0;
    if (els.compareCount) els.compareCount.textContent = `${count} selected`;
  }

  function openCompareDialog(trigger = document.activeElement) {
    if (!els.compareDialog || !els.compareContent) return;
    const chosen = [...state.compare].map((id) => products[id]).filter(Boolean);
    if (!chosen.length) return;

    state.lastFocusedElement = trigger;
    const headers = chosen.map((product) => `
      <td>
        <a href="${escapeHtml(getProductUrl(product))}">
          <img class="compare-product-image upscaled-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
          <span class="compare-product-title">${escapeHtml(product.name)}</span>
        </a>
      </td>`).join('');
    const row = (label, value) => `<tr><th scope="row">${label}</th>${value}</tr>`;
    const categoryRow = row('Category', chosen.map((p) => `<td>${escapeHtml(p.category)}</td>`).join(''));
    const priceRow = row('Price', chosen.map((p) => `<td class="compare-price">${escapeHtml(p.price)}</td>`).join(''));
    const statusRow = row('Availability', chosen.map((p) => `<td>${p.soldOut ? 'Sold out · ask about restock' : 'Available in Kampala'}</td>`).join(''));
    const actionRow = row('Action', chosen.map((p) => `<td><a class="button button-primary" href="${escapeHtml(getProductUrl(p))}">View item →</a></td>`).join(''));

    els.compareContent.innerHTML = `<table class="compare-table"><thead><tr><th scope="col">Product</th>${headers}</tr></thead><tbody>${categoryRow}${priceRow}${statusRow}${actionRow}</tbody></table>`;
    openDialog(els.compareDialog);
  }

  function openDialog(dialog, trigger = document.activeElement) {
    if (!dialog) return;
    state.lastFocusedElement = trigger;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    state.lastFocusedElement?.focus?.();
  }

  function closeMenus() {
    if (els.departmentMenu) els.departmentMenu.hidden = true;
    els.departmentToggle?.setAttribute('aria-expanded', 'false');
    if (els.languageMenu) els.languageMenu.hidden = true;
    els.languageToggle?.setAttribute('aria-expanded', 'false');
    if (els.mobileMenu) els.mobileMenu.hidden = true;
    els.mobileMenuToggle?.setAttribute('aria-expanded', 'false');
    if (els.mobileDepartments) els.mobileDepartments.hidden = true;
    document.querySelector('[data-mobile-departments]')?.setAttribute('aria-expanded', 'false');
  }

  function showToast(message) {
    if (!els.toastRegion) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon" aria-hidden="true">✦</span><span>${escapeHtml(message)}</span>`;
    els.toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 240);
    }, 2600);
  }

  function bindEvents() {
    els.themeToggle?.addEventListener('click', toggleTheme);

    els.languageToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = Boolean(els.languageMenu?.hidden);
      closeMenus();
      if (els.languageMenu) els.languageMenu.hidden = !willOpen;
      els.languageToggle.setAttribute('aria-expanded', String(willOpen));
    });

    els.departmentToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = Boolean(els.departmentMenu?.hidden);
      closeMenus();
      if (els.departmentMenu) els.departmentMenu.hidden = !willOpen;
      els.departmentToggle.setAttribute('aria-expanded', String(willOpen));
    });

    els.mobileMenuToggle?.addEventListener('click', () => {
      const willOpen = Boolean(els.mobileMenu?.hidden);
      if (els.mobileMenu) els.mobileMenu.hidden = !willOpen;
      els.mobileMenuToggle.setAttribute('aria-expanded', String(willOpen));
    });

    document.querySelector('[data-mobile-departments]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const willOpen = Boolean(els.mobileDepartments?.hidden);
      if (els.mobileDepartments) els.mobileDepartments.hidden = !willOpen;
      button.setAttribute('aria-expanded', String(willOpen));
    });

    els.searchForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      hideSearchSuggestions();
      renderCatalogue();
      scrollToCatalogue();
    });

    els.searchInput?.addEventListener('input', () => {
      state.search = els.searchInput.value;
      state.visibleCount = INITIAL_VISIBLE;
      if (els.searchClear) els.searchClear.hidden = !state.search.trim();
      renderSearchSuggestions();
      renderCatalogue();
    });

    els.searchClear?.addEventListener('click', () => {
      state.search = '';
      if (els.searchInput) {
        els.searchInput.value = '';
        els.searchInput.focus();
      }
      els.searchClear.hidden = true;
      hideSearchSuggestions();
      renderCatalogue();
    });

    els.priceFilter?.addEventListener('change', () => {
      state.price = els.priceFilter.value;
      state.visibleCount = INITIAL_VISIBLE;
      renderCatalogue();
    });

    els.sortSelect?.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      state.visibleCount = INITIAL_VISIBLE;
      renderCatalogue();
    });

    els.availableOnly?.addEventListener('change', () => {
      state.availableOnly = els.availableOnly.checked;
      state.visibleCount = INITIAL_VISIBLE;
      renderCatalogue();
    });

    els.clearFilters?.addEventListener('click', resetFilters);
    els.emptyClear?.addEventListener('click', resetFilters);

    els.loadMore?.addEventListener('click', () => {
      state.visibleCount += PAGE_STEP;
      renderCatalogue();
    });

    const showWishlistView = () => {
      state.category = 'All';
      state.quickFilter = state.quickFilter === 'wishlist' ? 'all' : 'wishlist';
      state.visibleCount = INITIAL_VISIBLE;
      renderCatalogue();
      scrollToCatalogue();
    };

    els.wishlistToggle?.addEventListener('click', showWishlistView);

    els.cartToggle?.addEventListener('click', (event) => openDialog(els.cartDialog, event.currentTarget));
    els.checkoutWhatsApp?.addEventListener('click', checkoutOnWhatsApp);
    els.openCheckoutModal?.addEventListener('click', openCheckoutDialog);
    els.checkoutForm?.addEventListener('submit', submitOrder);
    document.getElementById('orderPaymentMethod')?.addEventListener('change', syncCheckoutLocationField);
    syncCheckoutLocationField();

    els.compareClear?.addEventListener('click', () => {
      state.compare.clear();
      updateCompareUI();
      renderFeatured();
      renderCatalogue();
    });

    els.compareOpen?.addEventListener('click', (event) => openCompareDialog(event.currentTarget));

    els.updatesForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = els.updatesEmail?.value.trim();
      if (!email) return;
      const submitButton = els.updatesForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      const res = await apiRequest('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (submitButton) submitButton.disabled = false;
      if (!res || res.status !== 'subscribed') {
        if (els.updatesFeedback) {
          els.updatesFeedback.textContent = 'We could not save your email right now. Please try again later or contact us on WhatsApp.';
          els.updatesFeedback.classList.add('is-error');
        }
        showToast('Could not subscribe right now. Please try again.');
        return;
      }
      if (els.updatesFeedback) {
        els.updatesFeedback.textContent = res.message || 'You are on the Bros new-arrival list.';
        els.updatesFeedback.classList.remove('is-error');
      }
      showToast('Subscribed to Bros new-arrival updates.');
      els.updatesForm.reset();
    });

    els.scrollTop?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
      document.getElementById('siteHeader')?.classList.toggle('is-scrolled', window.scrollY > 10);
      if (els.scrollTop) {
        els.scrollTop.classList.toggle('is-visible', window.scrollY > 680);
      }
    }, { passive: true });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const categoryTrigger = target.closest('[data-select-category], [data-category]');
      if (categoryTrigger) {
        event.preventDefault();
        const category = categoryTrigger.getAttribute('data-select-category') || categoryTrigger.getAttribute('data-category');
        setCategory(category, true);
        return;
      }

      const quickFilterTrigger = target.closest('[data-quick-filter]');
      if (quickFilterTrigger) {
        const filter = quickFilterTrigger.getAttribute('data-quick-filter') || 'all';
        state.quickFilter = filter;
        state.visibleCount = INITIAL_VISIBLE;
        renderCatalogue();
        if (!quickFilterTrigger.classList.contains('catalogue-tab')) scrollToCatalogue();
        return;
      }

      const addTrigger = target.closest('[data-add-to-cart]');
      if (addTrigger) {
        event.stopPropagation();
        addToCart(addTrigger.getAttribute('data-add-to-cart'));
        return;
      }

      const wishlistTrigger = target.closest('[data-toggle-wishlist]');
      if (wishlistTrigger) {
        event.stopPropagation();
        toggleWishlist(wishlistTrigger.getAttribute('data-toggle-wishlist'));
        return;
      }

      const compareTrigger = target.closest('[data-toggle-compare]');
      if (compareTrigger) {
        event.stopPropagation();
        toggleCompare(compareTrigger.getAttribute('data-toggle-compare'));
        if (els.compareDialog?.open) {
          if (state.compare.size) openCompareDialog(state.lastFocusedElement);
          else closeDialog(els.compareDialog);
        }
        return;
      }

      const quickViewTrigger = target.closest('[data-quick-view]');
      if (quickViewTrigger) {
        event.stopPropagation();
        openQuickView(quickViewTrigger.getAttribute('data-quick-view'), quickViewTrigger);
        return;
      }

      const openPageTrigger = target.closest('[data-open-page]');
      if (openPageTrigger && !target.closest('button, a')) {
        const id = openPageTrigger.getAttribute('data-open-page');
        window.location.href = getProductUrl(id);
        return;
      }

      const productCard = target.closest('.product-card');
      if (productCard && !target.closest('button, a')) {
        const href = productCard.getAttribute('data-product-href');
        if (href) {
          window.location.href = href;
          return;
        }
      }

      const qtyButton = target.closest('[data-cart-qty]');
      if (qtyButton) {
        const id = Number(qtyButton.getAttribute('data-cart-qty'));
        const delta = Number(qtyButton.getAttribute('data-delta')) || 0;
        updateCartQuantity(id, (state.cart[id] || 0) + delta);
        return;
      }

      const removeButton = target.closest('[data-cart-remove]');
      if (removeButton) {
        updateCartQuantity(removeButton.getAttribute('data-cart-remove'), 0);
        return;
      }

      if (target.closest('[data-open-cart]')) {
        openDialog(els.cartDialog, target);
        return;
      }

      if (target.closest('[data-open-orders]')) {
        closeMenus();
        openOrdersDialog(target);
        return;
      }

      if (target.closest('[data-close-cart]')) {
        closeDialog(els.cartDialog);
        scrollToCatalogue();
        return;
      }

      if (target.closest('[data-close-mega]')) {
        closeMenus();
        return;
      }

      const closeButton = target.closest('[data-close-dialog]');
      if (closeButton) {
        closeDialog(closeButton.closest('dialog'));
        return;
      }

      if (target instanceof HTMLDialogElement) {
        closeDialog(target);
        return;
      }

      if (target.closest('.mobile-menu a')) {
        closeMenus();
      } else if (!target.closest('.mobile-menu') && !target.closest('.mobile-menu-toggle')) {
        if (els.mobileMenu) els.mobileMenu.hidden = true;
        els.mobileMenuToggle?.setAttribute('aria-expanded', 'false');
      }

      if (!target.closest('.nav-department') && !target.closest('.language-wrap')) {
        if (els.departmentMenu) els.departmentMenu.hidden = true;
        els.departmentToggle?.setAttribute('aria-expanded', 'false');
        if (els.languageMenu) els.languageMenu.hidden = true;
        els.languageToggle?.setAttribute('aria-expanded', 'false');
      }

      if (!target.closest('.search-area')) {
        hideSearchSuggestions();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenus();
        hideSearchSuggestions();
      }
      if (event.key === 'Enter' && document.activeElement?.matches('[data-open-page]')) {
        const id = document.activeElement.getAttribute('data-open-page');
        window.location.href = getProductUrl(id);
      }
    });
  }
})();
