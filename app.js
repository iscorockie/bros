/* Bros storefront interactions. Lightweight vanilla JavaScript; no checkout or analytics vendor required. */
(() => {
  'use strict';

  const PHONE = '256780844098';
  const PAGE_SIZE = 24;
  const NEW_ARRIVAL_COUNT = 12;
  const FEATURED_IDS = [0, 1, 5, 7, 8, 14, 19, 28];
  const HERO_SLIDES = [
    {
      productId: 0,
      headline: 'Elevate your',
      accent: 'experience.',
      description: 'Discover considered vapes, accessories and everyday essentials — all in one place, with a real team ready to help.'
    },
    {
      productId: 5,
      headline: 'Find your',
      accent: 'next favourite.',
      description: 'Explore a carefully stocked collection of premium gear, with clear UGX pricing and easy ordering on WhatsApp.'
    },
    {
      productId: 7,
      headline: 'Make room for',
      accent: 'better details.',
      description: 'From a new daily essential to a thoughtful finishing touch, good gear is only a message away.'
    }
  ];

  const CATEGORY_SHORTCUTS = [
    { label: 'Vapes', icon: '〰', category: 'Vapes' },
    { label: 'E-Liquids', icon: '◉', query: 'e-juice' },
    { label: 'Nicotine Pouches', icon: '▱', query: 'pouches' },
    { label: 'Accessories', icon: '✳', category: 'Accessories' },
    { label: 'Lighters', icon: '♨', category: 'Lighters' },
    { label: 'Rolling Essentials', icon: '≋', categories: ['Rolling Papers', 'Rolling Trays', 'Rollers', 'Grinders'] },
    { label: 'New Arrivals', icon: '✦', quickFilter: 'new' },
    { label: 'Bros Picks', icon: '★', quickFilter: 'picks' }
  ];

  const CATEGORY_ICONS = {
    'Vapes': '〰',
    'Rolling Papers': '▤',
    'Grinders': '⚙',
    'Lighters': '♨',
    'Rolling Trays': '▱',
    'Bongs & Pipes': '◌',
    'Ashtrays': '◉',
    'Rollers': '≋',
    'Accessories': '✳'
  };

  // WhatsApp is a brand mark, not a line icon: it comes from the shared sprite in index.html
  // so every CTA renders the identical glyph and inherits the current text colour.
  const WA_ICON = '<svg class="wa-icon" aria-hidden="true" focusable="false"><use href="#icon-whatsapp"></use></svg>';

  const ICON = {
    heart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>',
    compare: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 4H4v4m0-4 6 6m6 10h4v-4m0 4-6-6M4 16v4h4m-4 0 6-6m10-6V4h-4m4 0-6 6"/></svg>',
    eye: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.7 12s3.3-6 9.3-6 9.3 6 9.3 6-3.3 6-9.3 6-9.3-6-9.3-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    bag: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    chat: WA_ICON
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const storage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    },
    json(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) { return fallback; }
    }
  };

  const products = PRODUCTS.map((item, id) => ({
    id,
    name: item[0],
    price: Number(item[1]),
    image: item[2],
    category: item[3],
    soldOut: Boolean(item[4])
  }));

  const categories = Array.from(new Set(products.map(product => product.category)));
  const state = {
    category: 'all',
    categoryGroup: null,
    quickFilter: 'all',
    query: '',
    price: 'all',
    sort: 'featured',
    availableOnly: false,
    page: 1,
    wishlist: normalizeWishlist(storage.json('bros_wishlist', storage.json('bros_wishlist_v2', []))),
    compare: new Set(),
    cart: normalizeCart(storage.json('bros_cart', storage.json('bros_cart_v2', []))),
    heroSlide: 0,
    suggestionIndex: -1
  };

  const nodes = {
    root: document.documentElement,
    ageGate: $('#ageGate'),
    ageActions: $('#ageActions'),
    ageDenied: $('#ageDenied'),
    searchForm: $('#searchForm'),
    searchInput: $('#searchInput'),
    searchClear: $('#searchClear'),
    suggestions: $('#searchSuggestions'),
    productsGrid: $('#productsGrid'),
    resultsCount: $('#resultsCount'),
    emptyState: $('#emptyState'),
    loadMore: $('#loadMore'),
    filterBar: $('#filterBar'),
    priceFilter: $('#priceFilter'),
    sortSelect: $('#sortSelect'),
    availableOnly: $('#availableOnly'),
    clearFilters: $('#clearFilters'),
    catalogueTitle: $('#catalogueTitle'),
    cartDialog: $('#cartDialog'),
    cartItems: $('#cartItems'),
    cartEmpty: $('#cartEmpty'),
    cartFooter: $('#cartFooter'),
    compareDialog: $('#compareDialog'),
    quickView: $('#quickView'),
    quickViewContent: $('#quickViewContent')
  };

  function normalizeWishlist(value) {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.map(Number).filter(id => Number.isInteger(id) && products[id]));
  }

  function normalizeCart(value) {
    const lines = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? Object.entries(value).map(([id, quantity]) => ({ id, quantity }))
        : [];
    return lines.map(line => ({ id: Number(line.id), quantity: Math.max(1, Math.min(25, Number(line.quantity) || 1)) }))
      .filter(line => Number.isInteger(line.id) && products[line.id] && !products[line.id].soldOut);
  }

  function formatPrice(price) {
    return `UGX ${Number(price).toLocaleString('en-UG')}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function whatsappURL(message) {
    return `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
  }

  function productMessage(product) {
    const availability = product.soldOut ? 'Could you let me know if it will be restocked?' : 'Could you confirm availability?';
    return `Hi Bros! I'm interested in ${product.name} (${formatPrice(product.price)}). ${availability}`;
  }

  function trackMetric(name, detail = {}) {
    // Integrations can listen for this event or map it into an existing dataLayer.
    const payload = { event: name, ...detail };
    window.dispatchEvent(new CustomEvent('bros:metric', { detail: payload }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: `bros_${name}`, ...detail });
  }

  function showToast(message) {
    const region = $('#toastRegion');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon" aria-hidden="true">✦</span><span>${escapeHTML(message)}</span>`;
    region.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function markBrokenImages(root = document) {
    $$('img', root).forEach(image => {
      image.addEventListener('error', () => image.classList.add('is-broken'), { once: true });
    });
  }

  function productById(id) {
    return products[Number(id)] || null;
  }

  function setProductImage(elementId, productId) {
    const image = document.getElementById(elementId);
    // Fall back to the first catalogue item so a slot never keeps its placeholder.
    const product = productById(productId) || products[0];
    if (!image || !product) return;
    image.src = product.image;
    image.alt = product.name;
  }

  function initializeAgeGate() {
    const verified = storage.get('bros_age_verified') === '1';
    if (verified) {
      nodes.ageGate.hidden = true;
      nodes.root.classList.add('age-verified');
    } else {
      nodes.ageGate.hidden = false;
      nodes.root.classList.remove('age-verified');
      window.setTimeout(() => $('[data-age-confirm]')?.focus(), 40);
    }

    $('[data-age-confirm]')?.addEventListener('click', () => {
      storage.set('bros_age_verified', '1');
      nodes.root.classList.add('age-verified');
      nodes.ageGate.hidden = true;
      trackMetric('age_verified');
      $('#themeToggle')?.focus({ preventScroll: true });
    });

    $('[data-age-deny]')?.addEventListener('click', () => {
      nodes.ageActions.hidden = true;
      nodes.ageDenied.hidden = false;
      nodes.ageGate.setAttribute('aria-describedby', 'ageDescription ageDenied');
      nodes.ageDenied.focus?.();
    });
  }

  function initializeTheme() {
    const toggle = $('#themeToggle');
    const metaTheme = $('meta[name="theme-color"]');
    const apply = theme => {
      const next = theme === 'dark' ? 'dark' : 'light';
      nodes.root.dataset.theme = next;
      storage.set('bros_theme', next);
      const target = next === 'dark' ? 'light' : 'dark';
      toggle?.setAttribute('aria-label', `Switch to ${target} mode`);
      toggle?.setAttribute('title', `Switch to ${target} mode`);
      if (metaTheme) metaTheme.content = next === 'dark' ? '#0b111b' : '#f7f9fc';
    };
    apply(storage.get('bros_theme', 'light'));
    toggle?.addEventListener('click', () => apply(nodes.root.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function renderCategoryNavigation() {
    const countByCategory = products.reduce((count, product) => {
      count[product.category] = (count[product.category] || 0) + 1;
      return count;
    }, {});

    const categoryGrid = $('#categoryGrid');
    if (categoryGrid) {
      categoryGrid.innerHTML = CATEGORY_SHORTCUTS.map(shortcut => `
        <button class="category-tile" type="button" data-shortcut="${escapeHTML(shortcut.label)}" aria-label="Shop ${escapeHTML(shortcut.label)}">
          <span class="category-icon" aria-hidden="true">${shortcut.icon}</span><span>${escapeHTML(shortcut.label)}</span>
        </button>`).join('');
    }

    const chipHtml = `<button class="category-chip is-active" type="button" data-category="all">All <span class="chip-count">${products.length}</span></button>` +
      categories.map(category => `<button class="category-chip" type="button" data-category="${escapeHTML(category)}">${CATEGORY_ICONS[category] || '▦'} ${escapeHTML(category)} <span class="chip-count">${countByCategory[category]}</span></button>`).join('');
    if (nodes.filterBar) nodes.filterBar.innerHTML = chipHtml;

    const departmentHtml = categories.map(category => `
      <button class="mega-category" type="button" data-category="${escapeHTML(category)}">
        <span class="mega-category-icon" aria-hidden="true">${CATEGORY_ICONS[category] || '▦'}</span>
        <span>${escapeHTML(category)}<small>${countByCategory[category]} products</small></span>
      </button>`).join('');
    const megaCategories = $('#megaCategories');
    const mobileDepartments = $('#mobileDepartments');
    if (megaCategories) megaCategories.innerHTML = departmentHtml;
    if (mobileDepartments) mobileDepartments.innerHTML = categories.map(category => `
      <button type="button" data-category="${escapeHTML(category)}"><span aria-hidden="true">${CATEGORY_ICONS[category] || '▦'}</span>${escapeHTML(category)}</button>`).join('');

    $('#allCount').textContent = products.length;
  }

  function renderHero() {
    const dots = $('#heroDots');
    if (dots) {
      dots.innerHTML = HERO_SLIDES.map((_, index) => `<button class="hero-dot${index === state.heroSlide ? ' is-active' : ''}" type="button" data-hero-slide="${index}" aria-label="Show featured product ${index + 1}" aria-pressed="${index === state.heroSlide}"></button>`).join('');
    }
    updateHeroSlide(state.heroSlide, false);

    $('#heroPrevious')?.addEventListener('click', () => changeHeroSlide(-1));
    $('#heroNext')?.addEventListener('click', () => changeHeroSlide(1));
    dots?.addEventListener('click', event => {
      const button = event.target.closest('[data-hero-slide]');
      if (button) updateHeroSlide(Number(button.dataset.heroSlide));
    });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.setInterval(() => {
        if (document.hidden || !nodes.ageGate.hidden) return;
        changeHeroSlide(1);
      }, 7000);
    }
  }

  function changeHeroSlide(direction) {
    const next = (state.heroSlide + direction + HERO_SLIDES.length) % HERO_SLIDES.length;
    updateHeroSlide(next);
  }

  function updateHeroSlide(index, animate = true) {
    const slide = HERO_SLIDES[index];
    const product = productById(slide?.productId);
    if (!slide || !product) return;
    state.heroSlide = index;
    const image = $('#heroImage');
    const title = $('#heroTitle');
    if (image) {
      if (animate) image.classList.add('hero-image-changing');
      image.src = product.image;
      image.alt = product.name;
      image.addEventListener('load', () => image.classList.remove('hero-image-changing'), { once: true });
      image.addEventListener('error', () => image.classList.remove('hero-image-changing'), { once: true });
    }
    if (title) title.innerHTML = `${escapeHTML(slide.headline)} <span>${escapeHTML(slide.accent)}</span>`;
    $('#heroDescription').textContent = slide.description;
    $('#heroProductCategory').textContent = product.category;
    $('#heroProductName').textContent = product.name;
    $('#heroProductPrice').textContent = formatPrice(product.price);
    $('#heroSlideCounter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(HERO_SLIDES.length).padStart(2, '0')}`;
    const heroWhatsApp = $('#heroWhatsApp');
    heroWhatsApp.href = whatsappURL(productMessage(product));
    heroWhatsApp.dataset.waProduct = String(product.id);
    heroWhatsApp.setAttribute('aria-label', `Ask Bros about ${product.name} on WhatsApp`);
    $$('#heroDots [data-hero-slide]').forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.setAttribute('aria-pressed', String(dotIndex === index));
    });
  }

  function setPromoImages() {
    setProductImage('promoImageDelivery', 1);
    setProductImage('promoImageNew', 5);
    setProductImage('promoImageAccessories', 8);
    setProductImage('storyImageValue', products.reduce((cheapest, product) => product.price < cheapest.price ? product : cheapest, products[0]).id);
    const lighter = products.find(product => product.category === 'Lighters' && !product.soldOut);
    const paper = products.find(product => product.category === 'Rolling Papers' && !product.soldOut);
    setProductImage('storyImageLighter', lighter ? lighter.id : 0);
    setProductImage('storyImageEssentials', paper ? paper.id : 0);
    const minimum = Math.min(...products.map(product => product.price));
    $('#startingPrice').textContent = `UGX ${minimum.toLocaleString('en-UG')}`;
  }

  function getCurrentProducts() {
    let list = products.slice();

    if (state.query) {
      const query = state.query.toLocaleLowerCase();
      list = list.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase().includes(query));
    }

    if (state.category !== 'all') list = list.filter(product => product.category === state.category);
    if (Array.isArray(state.categoryGroup)) list = list.filter(product => state.categoryGroup.includes(product.category));

    switch (state.quickFilter) {
      case 'new':
        list = list.filter(product => product.id < NEW_ARRIVAL_COUNT);
        break;
      case 'available':
        list = list.filter(product => !product.soldOut);
        break;
      case 'under-100':
        list = list.filter(product => product.price < 100000);
        break;
      case 'picks':
        list = list.filter(product => FEATURED_IDS.includes(product.id));
        break;
      case 'wishlist':
        list = list.filter(product => state.wishlist.has(product.id));
        break;
      default:
        break;
    }

    if (state.price === 'under-50') list = list.filter(product => product.price < 50000);
    if (state.price === '50-100') list = list.filter(product => product.price >= 50000 && product.price <= 100000);
    if (state.price === '100-200') list = list.filter(product => product.price > 100000 && product.price <= 200000);
    if (state.price === 'over-200') list = list.filter(product => product.price > 200000);
    if (state.availableOnly) list = list.filter(product => !product.soldOut);

    if (state.sort === 'price-low') list.sort((a, b) => a.price - b.price || a.id - b.id);
    if (state.sort === 'price-high') list.sort((a, b) => b.price - a.price || a.id - b.id);
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }

  function renderCard(product, options = {}) {
    const saved = state.wishlist.has(product.id);
    const compared = state.compare.has(product.id);
    const soldLabel = product.soldOut ? 'Sold out' : 'Available';
    const badgeLabel = product.soldOut ? 'Sold out' : product.id < NEW_ARRIVAL_COUNT ? 'New arrival' : 'Available';
    const badgeClass = product.soldOut ? ' is-sold' : product.id < NEW_ARRIVAL_COUNT ? ' is-new' : '';
    const chatLabel = product.soldOut ? 'Ask about restock' : 'WhatsApp';
    const addLabel = product.soldOut ? 'Unavailable' : 'Add to bag';
    const featuredClass = options.featured ? ' is-featured-card' : '';
    return `
      <article class="product-card${featuredClass}" data-product-card="${product.id}">
        <div class="product-media">
          <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async">
          <span class="product-badge${badgeClass}">${badgeLabel}</span>
          <div class="product-card-actions">
            <button class="product-mini-action${saved ? ' is-saved' : ''}" type="button" data-action="wishlist" data-product-id="${product.id}" aria-label="${saved ? 'Remove' : 'Add'} ${escapeHTML(product.name)} ${saved ? 'from' : 'to'} saved items" aria-pressed="${saved}" title="${saved ? 'Remove from saved items' : 'Save for later'}">${ICON.heart}</button>
            <button class="product-mini-action${compared ? ' is-compared' : ''}" type="button" data-action="compare" data-product-id="${product.id}" aria-label="${compared ? 'Remove' : 'Add'} ${escapeHTML(product.name)} ${compared ? 'from' : 'to'} comparison" aria-pressed="${compared}" title="${compared ? 'Remove from comparison' : 'Compare'}">${ICON.compare}</button>
          </div>
          <button class="quick-view-button" type="button" data-action="quick" data-product-id="${product.id}">${ICON.eye} Quick view</button>
        </div>
        <div class="product-info">
          <div class="product-category"><span>${escapeHTML(product.category)}</span><span class="product-status">${soldLabel}</span></div>
          <h3>${escapeHTML(product.name)}</h3>
          <div class="product-price-line"><span class="product-price">${formatPrice(product.price)}</span><span class="product-price-note">Price in UGX</span></div>
          <div class="product-actions">
            <a class="product-chat" href="${escapeHTML(whatsappURL(productMessage(product)))}" target="_blank" rel="noopener noreferrer" data-wa-product="${product.id}" aria-label="${chatLabel} for ${escapeHTML(product.name)} on WhatsApp">${ICON.chat}<span>${chatLabel}</span></a>
            <button class="product-add" type="button" data-action="add" data-product-id="${product.id}" aria-label="${addLabel}: ${escapeHTML(product.name)}" title="${addLabel}" ${product.soldOut ? 'disabled' : ''}>${ICON.bag}</button>
          </div>
        </div>
      </article>`;
  }

  function renderCatalogue() {
    const list = getCurrentProducts();
    const visible = list.slice(0, state.page * PAGE_SIZE);
    nodes.productsGrid.innerHTML = visible.map(product => renderCard(product)).join('');
    markBrokenImages(nodes.productsGrid);

    const showing = visible.length;
    if (state.query) {
      nodes.resultsCount.textContent = `${list.length} result${list.length === 1 ? '' : 's'} for “${state.query}”${list.length > showing ? ` · showing ${showing}` : ''}`;
    } else {
      nodes.resultsCount.textContent = list.length === products.length
        ? `Showing all ${products.length} products`
        : `Showing ${showing} of ${list.length} product${list.length === 1 ? '' : 's'}`;
    }

    nodes.emptyState.hidden = list.length !== 0;
    nodes.productsGrid.hidden = list.length === 0;
    nodes.loadMore.hidden = showing >= list.length;
    nodes.loadMore.innerHTML = `Show ${Math.min(PAGE_SIZE, list.length - showing)} more products <span aria-hidden="true">↓</span>`;
    nodes.catalogueTitle.textContent = state.quickFilter === 'wishlist'
      ? 'Your saved products.'
      : state.query
        ? 'Search results.'
        : state.category !== 'all'
          ? `${state.category}.`
          : Array.isArray(state.categoryGroup)
            ? 'Rolling essentials.'
            : 'Find your next favourite.';

    $$('.category-chip', nodes.filterBar).forEach(chip => {
      const active = chip.dataset.category === state.category && !state.categoryGroup;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    $$('.catalogue-tab').forEach(tab => {
      const active = tab.dataset.quickFilter === state.quickFilter;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });

    const hasFilters = Boolean(state.query || state.category !== 'all' || state.categoryGroup || state.quickFilter !== 'all' || state.price !== 'all' || state.availableOnly);
    nodes.clearFilters.hidden = !hasFilters;
    $('#savedTabCount').textContent = state.wishlist.size;
  }

  function renderFeatured() {
    const rail = $('#featuredProducts');
    if (!rail) return;
    rail.innerHTML = FEATURED_IDS.map(id => productById(id)).filter(Boolean).slice(0, 6).map(product => renderCard(product, { featured: true })).join('');
    markBrokenImages(rail);
  }

  function updateSearchURL() {
    try {
      const url = new URL(window.location.href);
      if (state.query) url.searchParams.set('q', state.query);
      else url.searchParams.delete('q');
      if (state.category !== 'all') url.searchParams.set('category', state.category);
      else url.searchParams.delete('category');
      if (state.quickFilter !== 'all') url.searchParams.set('filter', state.quickFilter);
      else url.searchParams.delete('filter');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function setSearch(query, options = {}) {
    state.query = String(query || '').trim();
    state.category = 'all';
    state.categoryGroup = null;
    state.quickFilter = 'all';
    state.page = 1;
    if (nodes.searchInput.value !== state.query) nodes.searchInput.value = state.query;
    nodes.searchClear.hidden = !state.query;
    renderCatalogue();
    updateSearchURL();
    if (options.hideSuggestions !== false) closeSuggestions();
    if (options.scroll) scrollToCatalogue();
  }

  function renderSuggestions(query) {
    const cleanQuery = query.trim().toLocaleLowerCase();
    state.suggestionIndex = -1;
    nodes.searchInput.setAttribute('aria-expanded', 'false');
    if (!cleanQuery) {
      closeSuggestions();
      return;
    }

    const matches = products.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase().includes(cleanQuery)).slice(0, 6);
    const markup = matches.length
      ? `<div class="suggestion-heading">Product suggestions</div>${matches.map((product, index) => `
          <button class="suggestion-item" type="button" role="option" aria-selected="false" data-suggestion-id="${product.id}" id="search-option-${index}">
            <img src="${escapeHTML(product.image)}" alt="" loading="lazy" decoding="async">
            <span class="suggestion-details"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)}</small></span>
            <span class="suggestion-price">${formatPrice(product.price)}</span>
          </button>`).join('')}
        <button class="suggestion-item suggestion-all" type="button" role="option" aria-selected="false" id="search-option-${matches.length}" data-search-all="true"><span class="suggestion-details"><strong>See all results for “${escapeHTML(query.trim())}”</strong></span><span aria-hidden="true">↗</span></button>`
      : `<div class="suggestion-empty">No matches yet. Try another product name or category.</div>`;
    nodes.suggestions.innerHTML = markup;
    nodes.suggestions.hidden = false;
    nodes.searchInput.setAttribute('aria-expanded', 'true');
    markBrokenImages(nodes.suggestions);
  }

  function closeSuggestions() {
    nodes.suggestions.hidden = true;
    nodes.searchInput.setAttribute('aria-expanded', 'false');
    nodes.searchInput.removeAttribute('aria-activedescendant');
    state.suggestionIndex = -1;
    $$('.suggestion-item', nodes.suggestions).forEach(item => item.setAttribute('aria-selected', 'false'));
  }

  function moveSuggestion(direction) {
    const options = $$('.suggestion-item[role="option"]', nodes.suggestions);
    if (!options.length || nodes.suggestions.hidden) return false;
    state.suggestionIndex = (state.suggestionIndex + direction + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === state.suggestionIndex)));
    const active = options[state.suggestionIndex];
    nodes.searchInput.setAttribute('aria-activedescendant', active.id || `search-option-${state.suggestionIndex}`);
    active.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function scrollToCatalogue() {
    closeSuggestions();
    closeMobileMenu();
    closeDepartmentMenu();
    $('#catalogue').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function updateCartStorage() {
    storage.set('bros_cart', JSON.stringify(state.cart));
    renderCart();
  }

  function cartQuantity() {
    return state.cart.reduce((sum, line) => sum + line.quantity, 0);
  }

  function cartSubtotal() {
    return state.cart.reduce((sum, line) => sum + (productById(line.id)?.price || 0) * line.quantity, 0);
  }

  function renderCart() {
    const quantity = cartQuantity();
    const subtotal = cartSubtotal();
    $('#cartCount').textContent = quantity;
    $('#mobileCartCount').textContent = quantity;
    $('#cartHeadingCount').textContent = `(${quantity})`;
    $('#cartTotal').textContent = formatPrice(subtotal);
    $('#utilityCartTotal').textContent = formatPrice(subtotal);
    $('#cartSubtotal').textContent = formatPrice(subtotal);

    const hasItems = state.cart.length > 0;
    nodes.cartEmpty.hidden = hasItems;
    nodes.cartFooter.hidden = !hasItems;
    nodes.cartItems.innerHTML = state.cart.map(line => {
      const product = productById(line.id);
      if (!product) return '';
      return `
        <article class="cart-line">
          <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async">
          <div><h3>${escapeHTML(product.name)}</h3><p>${formatPrice(product.price)}</p><button class="cart-remove" type="button" data-action="cart-remove" data-product-id="${product.id}">Remove</button></div>
          <div class="cart-line-actions"><button class="quantity-button" type="button" data-action="cart-quantity" data-change="-1" data-product-id="${product.id}" aria-label="Decrease ${escapeHTML(product.name)} quantity">−</button><span class="cart-quantity">${line.quantity}</span><button class="quantity-button" type="button" data-action="cart-quantity" data-change="1" data-product-id="${product.id}" aria-label="Increase ${escapeHTML(product.name)} quantity">+</button></div>
        </article>`;
    }).join('');
    markBrokenImages(nodes.cartItems);
  }

  function addToCart(id) {
    const product = productById(id);
    if (!product || product.soldOut) return;
    const existing = state.cart.find(line => line.id === product.id);
    if (existing) existing.quantity = Math.min(25, existing.quantity + 1);
    else state.cart.push({ id: product.id, quantity: 1 });
    updateCartStorage();
    trackMetric('add_to_cart', { productId: product.id, productName: product.name, price: product.price });
    showToast(`${product.name} added to your bag.`);
  }

  function adjustCart(id, amount) {
    const line = state.cart.find(item => item.id === Number(id));
    if (!line) return;
    line.quantity += amount;
    if (line.quantity <= 0) state.cart = state.cart.filter(item => item.id !== line.id);
    line.quantity = Math.min(25, line.quantity);
    updateCartStorage();
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter(item => item.id !== Number(id));
    updateCartStorage();
  }

  function openCart() {
    renderCart();
    if (!nodes.cartDialog.open) nodes.cartDialog.showModal();
  }

  function startWhatsAppCheckout() {
    if (!state.cart.length) return;
    const lines = state.cart.map(line => {
      const product = productById(line.id);
      return product ? `• ${product.name} × ${line.quantity} — ${formatPrice(product.price * line.quantity)}` : '';
    }).filter(Boolean);
    const message = `Hi Bros! I'd like to order:\n${lines.join('\n')}\n\nSubtotal: ${formatPrice(cartSubtotal())}\nPlease confirm availability, delivery and payment options.`;
    trackMetric('whatsapp_checkout_started', { itemCount: cartQuantity(), subtotal: cartSubtotal() });
    window.open(whatsappURL(message), '_blank', 'noopener,noreferrer');
  }

  function renderQuickView(product) {
    if (!product) return;
    $('#quickTitle').textContent = `${product.name} — product details`;
    const status = product.soldOut ? 'Currently sold out — ask us about restock.' : 'Listed as available. Please confirm current stock with our team.';
    nodes.quickViewContent.innerHTML = `
      <div class="quick-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" decoding="async"></div>
      <div class="quick-details">
        <span class="eyebrow">${escapeHTML(product.category)}</span>
        <h2>${escapeHTML(product.name)}</h2>
        <span class="quick-status${product.soldOut ? ' is-sold' : ''}">${status}</span>
        <div class="quick-price">${formatPrice(product.price)}</div>
        <p class="quick-copy">UGX pricing shown as listed. Message Bros to confirm stock, delivery timing and payment details before ordering.</p>
        <div class="quick-actions">
          <a class="button button-whatsapp" href="${escapeHTML(whatsappURL(productMessage(product)))}" target="_blank" rel="noopener noreferrer" data-wa-product="${product.id}">${ICON.chat} Ask on WhatsApp</a>
          <button class="button button-primary" type="button" data-action="add" data-product-id="${product.id}" ${product.soldOut ? 'disabled' : ''}>${ICON.bag} ${product.soldOut ? 'Unavailable' : 'Add to bag'}</button>
        </div>
        <button class="quick-wishlist" type="button" data-action="wishlist" data-product-id="${product.id}" aria-pressed="${state.wishlist.has(product.id)}">${ICON.heart}<span>${state.wishlist.has(product.id) ? 'Remove from saved items' : 'Save for later'}</span></button>
      </div>`;
    markBrokenImages(nodes.quickViewContent);
    if (!nodes.quickView.open) nodes.quickView.showModal();
    trackMetric('product_quick_view', { productId: product.id, productName: product.name });
  }

  function updateWishlist() {
    storage.set('bros_wishlist', JSON.stringify(Array.from(state.wishlist)));
    const count = state.wishlist.size;
    const badge = $('#wishlistCount');
    badge.textContent = count;
    badge.hidden = count === 0;
    $('#wishlistToggle').setAttribute('aria-label', count ? `Show wishlist, ${count} saved item${count === 1 ? '' : 's'}` : 'Show wishlist');
    const utilityCount = $('#utilityWishlistCount');
    utilityCount.textContent = count;
    utilityCount.hidden = count === 0;
    $('#wishlistUtility').setAttribute('aria-label', count ? `Show wishlist, ${count} saved item${count === 1 ? '' : 's'}` : 'Show wishlist');
    $('#savedTabCount').textContent = count;
    renderCatalogue();
    renderFeatured();
  }

  function toggleWishlist(id) {
    const product = productById(id);
    if (!product) return;
    if (state.wishlist.has(product.id)) {
      state.wishlist.delete(product.id);
      showToast(`${product.name} removed from saved items.`);
    } else {
      state.wishlist.add(product.id);
      showToast(`${product.name} saved for later.`);
    }
    updateWishlist();
    const quickButton = $('[data-action="wishlist"]', nodes.quickViewContent);
    if (quickButton && Number(quickButton.dataset.productId) === product.id) {
      quickButton.setAttribute('aria-pressed', String(state.wishlist.has(product.id)));
      quickButton.innerHTML = `${ICON.heart}<span>${state.wishlist.has(product.id) ? 'Remove from saved items' : 'Save for later'}</span>`;
    }
  }

  function updateCompare() {
    const count = state.compare.size;
    const bar = $('#compareBar');
    bar.hidden = count === 0;
    $('#compareCount').textContent = `${count} selected`;
    $('#compareOpen').disabled = count < 2;
    $('#compareOpen').textContent = count < 2 ? 'Choose one more' : 'Compare selected →';
    renderCatalogue();
    renderFeatured();
  }

  function toggleCompare(id) {
    const product = productById(id);
    if (!product) return;
    if (state.compare.has(product.id)) {
      state.compare.delete(product.id);
      showToast(`${product.name} removed from comparison.`);
    } else if (state.compare.size >= 3) {
      showToast('Compare up to three products at a time.');
      return;
    } else {
      state.compare.add(product.id);
      showToast(`${product.name} added to comparison.`);
    }
    updateCompare();
  }

  function renderComparison() {
    const chosen = Array.from(state.compare).map(productById).filter(Boolean);
    if (chosen.length < 2) {
      showToast('Choose at least two products to compare.');
      return;
    }
    const headers = chosen.map(product => `
      <td><img class="compare-product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"><span class="compare-product-title">${escapeHTML(product.name)}</span></td>`).join('');
    const row = (label, value) => `<tr><th scope="row">${label}</th>${value}</tr>`;
    const categoryRow = row('Category', chosen.map(product => `<td>${escapeHTML(product.category)}</td>`).join(''));
    const priceRow = row('Price', chosen.map(product => `<td class="compare-price">${formatPrice(product.price)}</td>`).join(''));
    const statusRow = row('Availability', chosen.map(product => `<td>${product.soldOut ? 'Sold out · ask about restock' : 'Listed as available'}</td>`).join(''));
    const actionRow = row('Next step', chosen.map(product => `<td><a class="button button-whatsapp" href="${escapeHTML(whatsappURL(productMessage(product)))}" target="_blank" rel="noopener noreferrer" data-wa-product="${product.id}">${ICON.chat}Ask about this item</a></td>`).join(''));
    $('#compareContent').innerHTML = `<table class="compare-table"><thead><tr><th scope="col">Product</th>${headers}</tr></thead><tbody>${categoryRow}${priceRow}${statusRow}${actionRow}</tbody></table>`;
    markBrokenImages($('#compareContent'));
    if (!nodes.compareDialog.open) nodes.compareDialog.showModal();
  }

  function clearAllFilters() {
    state.category = 'all';
    state.categoryGroup = null;
    state.quickFilter = 'all';
    state.query = '';
    state.price = 'all';
    state.sort = 'featured';
    state.availableOnly = false;
    state.page = 1;
    nodes.searchInput.value = '';
    nodes.priceFilter.value = 'all';
    nodes.sortSelect.value = 'featured';
    nodes.availableOnly.checked = false;
    nodes.searchClear.hidden = true;
    closeSuggestions();
    updateSearchURL();
    renderCatalogue();
  }

  function setCategory(category) {
    state.category = category === 'all' ? 'all' : category;
    state.categoryGroup = null;
    state.quickFilter = 'all';
    state.page = 1;
    state.query = '';
    nodes.searchInput.value = '';
    nodes.searchClear.hidden = true;
    closeSuggestions();
    updateSearchURL();
    renderCatalogue();
  }

  function setQuickFilter(filter) {
    if (!filter) return;
    state.category = 'all';
    state.categoryGroup = null;
    state.query = '';
    nodes.searchInput.value = '';
    nodes.searchClear.hidden = true;
    state.quickFilter = filter;
    state.page = 1;
    closeSuggestions();
    updateSearchURL();
    renderCatalogue();
  }

  function applyShortcut(shortcutName) {
    const shortcut = CATEGORY_SHORTCUTS.find(item => item.label === shortcutName);
    if (!shortcut) return;
    closeMobileMenu();
    if (shortcut.query) {
      state.category = 'all';
      state.categoryGroup = null;
      state.quickFilter = 'all';
      setSearch(shortcut.query, { scroll: true });
      return;
    }
    if (shortcut.category) {
      setCategory(shortcut.category);
      scrollToCatalogue();
      return;
    }
    if (shortcut.categories) {
      state.category = 'all';
      state.categoryGroup = shortcut.categories;
      state.quickFilter = 'all';
      state.query = '';
      nodes.searchInput.value = '';
      nodes.searchClear.hidden = true;
      state.page = 1;
      updateSearchURL();
      renderCatalogue();
      scrollToCatalogue();
      return;
    }
    setQuickFilter(shortcut.quickFilter);
    scrollToCatalogue();
  }

  function closeMobileMenu() {
    const menu = $('#mobileMenu');
    const toggle = $('#mobileMenuToggle');
    if (menu) menu.hidden = true;
    $('#mobileDepartments').hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation menu');
    $$('[data-mobile-departments]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  }

  function closeDepartmentMenu() {
    const menu = $('#departmentMenu');
    const toggle = $('#departmentToggle');
    if (menu) menu.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
  }

  function togglePopup(button, menu) {
    if (!button || !menu) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
  }

  function attachEvents() {
    nodes.searchInput.addEventListener('input', () => {
      const value = nodes.searchInput.value.trim();
      state.category = 'all';
      state.categoryGroup = null;
      state.quickFilter = 'all';
      state.query = value;
      state.page = 1;
      nodes.searchClear.hidden = !value;
      renderCatalogue();
      updateSearchURL();
      renderSuggestions(nodes.searchInput.value);
    });

    nodes.searchForm.addEventListener('submit', event => {
      event.preventDefault();
      setSearch(nodes.searchInput.value, { scroll: true });
      trackMetric('search', { query: state.query });
    });

    nodes.searchInput.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSuggestion(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSuggestion(-1);
      } else if (event.key === 'Escape') {
        closeSuggestions();
      } else if (event.key === 'Enter' && state.suggestionIndex >= 0) {
        const option = $$('.suggestion-item[role="option"]', nodes.suggestions)[state.suggestionIndex];
        if (option?.dataset.suggestionId) {
          event.preventDefault();
          const product = productById(option.dataset.suggestionId);
          if (product) setSearch(product.name, { scroll: true });
        } else if (option?.dataset.searchAll) {
          event.preventDefault();
          setSearch(nodes.searchInput.value, { scroll: true });
        }
      }
    });

    nodes.suggestions.addEventListener('click', event => {
      const option = event.target.closest('[data-suggestion-id]');
      if (option) {
        const product = productById(option.dataset.suggestionId);
        if (product) setSearch(product.name, { scroll: true });
        return;
      }
      if (event.target.closest('[data-search-all]')) setSearch(nodes.searchInput.value, { scroll: true });
    });

    nodes.searchClear.addEventListener('click', () => {
      setSearch('', { hideSuggestions: true });
      nodes.searchInput.focus();
    });

    nodes.filterBar.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (button) setCategory(button.dataset.category);
    });

    nodes.priceFilter.addEventListener('change', () => {
      state.price = nodes.priceFilter.value;
      state.page = 1;
      renderCatalogue();
    });
    nodes.sortSelect.addEventListener('change', () => {
      state.sort = nodes.sortSelect.value;
      state.page = 1;
      renderCatalogue();
    });
    nodes.availableOnly.addEventListener('change', () => {
      state.availableOnly = nodes.availableOnly.checked;
      state.page = 1;
      renderCatalogue();
    });

    nodes.clearFilters.addEventListener('click', clearAllFilters);
    $('#emptyClear').addEventListener('click', clearAllFilters);
    nodes.loadMore.addEventListener('click', () => {
      state.page += 1;
      renderCatalogue();
    });

    document.addEventListener('click', event => {
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        const id = Number(actionButton.dataset.productId);
        switch (actionButton.dataset.action) {
          case 'quick': renderQuickView(productById(id)); break;
          case 'add': addToCart(id); break;
          case 'wishlist': toggleWishlist(id); break;
          case 'compare': toggleCompare(id); break;
          case 'cart-quantity': adjustCart(id, Number(actionButton.dataset.change)); break;
          case 'cart-remove': removeFromCart(id); break;
          default: break;
        }
      }

      const categoryTarget = event.target.closest('[data-category]');
      if (categoryTarget && !categoryTarget.closest('#filterBar')) {
        event.preventDefault();
        setCategory(categoryTarget.dataset.category);
        scrollToCatalogue();
      }

      const shortcutTarget = event.target.closest('[data-shortcut]');
      if (shortcutTarget) applyShortcut(shortcutTarget.dataset.shortcut);

      const quickFilterTarget = event.target.closest('[data-quick-filter]');
      if (quickFilterTarget) {
        event.preventDefault();
        setQuickFilter(quickFilterTarget.dataset.quickFilter);
        if (quickFilterTarget.tagName === 'A' || quickFilterTarget.closest('.promo-card')) scrollToCatalogue();
      }
      if (event.target.closest('#mobileMenu a')) closeMobileMenu();

      if (event.target.closest('[data-open-cart]')) openCart();
      if (event.target.closest('[data-close-cart]')) nodes.cartDialog.close();
      if (event.target.closest('[data-focus-search]')) {
        nodes.searchInput.focus({ preventScroll: true });
        nodes.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog')?.close();
      if (event.target.closest('[data-close-mega]')) closeDepartmentMenu();

      const quickMenu = $('#departmentMenu');
      if (quickMenu && !quickMenu.hidden && !event.target.closest('.nav-department')) closeDepartmentMenu();
      const languageMenu = $('#languageMenu');
      if (languageMenu && !languageMenu.hidden && !event.target.closest('.language-wrap')) {
        languageMenu.hidden = true;
        $('#languageToggle').setAttribute('aria-expanded', 'false');
      }
      if (!event.target.closest('.search-area')) closeSuggestions();

      const waLink = event.target.closest('a[href*="wa.me"]');
      if (waLink) {
        const productId = Number(waLink.dataset.waProduct);
        const product = Number.isInteger(productId) ? productById(productId) : null;
        trackMetric('whatsapp_click', product ? { productId: product.id, productName: product.name } : { placement: 'general' });
      }
    });

    const showWishlist = () => {
      setQuickFilter('wishlist');
      scrollToCatalogue();
    };
    $('#wishlistToggle').addEventListener('click', showWishlist);
    $('#wishlistUtility').addEventListener('click', showWishlist);
    $('#cartToggle').addEventListener('click', openCart);
    $('#checkoutWhatsApp').addEventListener('click', startWhatsAppCheckout);
    $('#compareOpen').addEventListener('click', renderComparison);
    $('#compareClear').addEventListener('click', () => {
      state.compare.clear();
      updateCompare();
    });
    $('#mobileMenuToggle').addEventListener('click', () => {
      const menu = $('#mobileMenu');
      const wasOpen = !menu.hidden;
      togglePopup($('#mobileMenuToggle'), menu);
      $('#mobileMenuToggle').setAttribute('aria-label', menu.hidden ? 'Open navigation menu' : 'Close navigation menu');
      if (wasOpen) {
        $('#mobileDepartments').hidden = true;
        $('[data-mobile-departments]').setAttribute('aria-expanded', 'false');
      }
    });
    $$('[data-mobile-departments]').forEach(button => button.addEventListener('click', () => {
      const panel = $('#mobileDepartments');
      const opening = panel.hidden;
      panel.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
    }));
    $('#departmentToggle').addEventListener('click', () => togglePopup($('#departmentToggle'), $('#departmentMenu')));
    $('#languageToggle').addEventListener('click', () => togglePopup($('#languageToggle'), $('#languageMenu')));

    $('#updatesForm').addEventListener('submit', event => {
      event.preventDefault();
      const email = $('#updatesEmail').value.trim();
      if (!email) return;
      const message = `Hi Bros! Please contact me about new arrivals and updates. My email is ${email}. Please ask before adding me to any mailing list.`;
      trackMetric('updates_request', { channel: 'whatsapp' });
      window.open(whatsappURL(message), '_blank', 'noopener,noreferrer');
      showToast('WhatsApp is ready — send the message to request updates.');
    });

    $$('.product-dialog, .cart-dialog, .compare-dialog').forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Tab' && !nodes.ageGate.hidden) {
        const focusable = $$('button, a, input, [tabindex="0"]', nodes.ageGate)
          .filter(element => !element.disabled && !element.closest('[hidden]') && element.getClientRects().length);
        if (!focusable.length) {
          event.preventDefault();
          nodes.ageDenied.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !nodes.ageGate.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !nodes.ageGate.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Escape') {
        closeSuggestions();
        closeDepartmentMenu();
        closeMobileMenu();
        $('#languageMenu').hidden = true;
        $('#languageToggle').setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('scroll', () => {
      $('#siteHeader').classList.toggle('is-scrolled', window.scrollY > 10);
      $('#scrollTop').classList.toggle('is-visible', window.scrollY > 500);
    }, { passive: true });
    $('#scrollTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function initialize() {
    initializeAgeGate();
    initializeTheme();
    renderCategoryNavigation();
    setPromoImages();
    renderHero();
    renderFeatured();
    renderCatalogue();
    renderCart();
    updateWishlist();
    updateCompare();
    $('#currentYear').textContent = new Date().getFullYear();

    const initialParams = new URLSearchParams(window.location.search);
    const initialQuery = initialParams.get('q');
    const initialCategory = initialParams.get('category');
    const initialFilter = initialParams.get('filter');
    if (initialQuery) {
      setSearch(initialQuery, { hideSuggestions: true });
    } else if (initialCategory && categories.includes(initialCategory)) {
      setCategory(initialCategory);
    } else if (['new', 'available', 'under-100', 'wishlist', 'picks'].includes(initialFilter)) {
      setQuickFilter(initialFilter);
    }

    attachEvents();
    markBrokenImages();
  }

  initialize();
})();
