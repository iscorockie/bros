(() => {
  'use strict';

  const WHATSAPP_NUMBER = '256780844098';
  const FREE_DELIVERY_THRESHOLD = 150000;
  const NEW_ARRIVAL_COUNT = 12;
  const STORAGE_KEYS = {
    theme: 'bros_theme',
    cart: 'bros_cart_v2',
    wishlist: 'bros_wishlist_v2',
    session: 'bros_session_id',
    orders: 'bros_orders_v1',
  };

  const CATEGORY_DESCRIPTIONS = {
    'Vapes': 'Engineered for smooth vapour delivery and dependable battery performance. Genuine hardware and e-liquids verified by Bros Uganda.',
    'Bongs & Pipes': 'Ergonomic glass bongs, silicone bubblers, hookahs and travel-ready pieces crafted for smooth filtration and easy maintenance.',
    'Accessories': 'Precision-crafted setup essentials, nicotine pouches, jars, and stash gear built for durability and effortless daily use.',
    'Lighters': 'Reliable ignition, refillable designs, and wind-resistant torches ready for everyday carry.',
    'Rolling Papers': 'Slow-burning papers, natural gum lines, cones, and rolling accessories for a clean finish.',
    'Ashtrays': 'Heat-resistant glass, metal, and silicone ashtrays that pair easy cleaning with standout character.',
    'Grinders': 'Precision-milled dry herb grinders designed for smooth turns, even consistency, and long-lasting performance.',
    'Rollers': 'Effortless manual and automatic rolling machines built for consistent, even rolls every time.',
    'Rolling Trays': 'Smooth, easy-to-clean metal and shatterproof glass trays that keep your setup organized.',
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
    try {
      const headers = Object.assign(
        { 'Content-Type': 'application/json', 'X-Session-Id': SESSION_ID },
        options.headers || {}
      );
      const res = await fetch(endpoint, Object.assign({}, options, { headers }));
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
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
    };
  });

  const params = new URLSearchParams(window.location.search);
  const requestedId = Number(params.get('id'));
  const currentProduct = products[Number.isFinite(requestedId) && products[requestedId] ? requestedId : 0];

  const state = {
    product: currentProduct,
    quantity: 1,
    cart: loadCart(),
    wishlist: loadWishlist(),
    reviews: [],
    lastFocusedElement: null,
  };

  const els = {
    themeToggle: document.getElementById('themeToggle'),
    wishlistCount: document.getElementById('wishlistCount'),
    utilityWishlistCount: document.getElementById('utilityWishlistCount'),
    cartToggle: document.getElementById('cartToggle'),
    cartCount: document.getElementById('cartCount'),
    cartTotal: document.getElementById('cartTotal'),
    utilityCartTotal: document.getElementById('utilityCartTotal'),
    breadcrumbCategory: document.getElementById('breadcrumbCategory'),
    breadcrumbProduct: document.getElementById('breadcrumbProduct'),
    pdpHero: document.getElementById('pdpHero'),
    pdpSpecList: document.getElementById('pdpSpecList'),
    pdpAvgRating: document.getElementById('pdpAvgRating'),
    pdpReviewCount: document.getElementById('pdpReviewCount'),
    pdpReviewsList: document.getElementById('pdpReviewsList'),
    pdpReviewForm: document.getElementById('pdpReviewForm'),
    relatedHeading: document.getElementById('relatedHeading'),
    viewAllCategoryLink: document.getElementById('viewAllCategoryLink'),
    relatedProductsGrid: document.getElementById('relatedProductsGrid'),
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
    orderConfirmationBox: document.getElementById('orderConfirmationBox'),
    toastRegion: document.getElementById('toastRegion'),
  };

  init();

  function init() {
    syncThemeControl();
    if (!state.product) {
      if (els.pdpHero) {
        els.pdpHero.innerHTML = `
          <div class="empty-state">
            <h2>Product not found</h2>
            <p>The requested product could not be located in the Bros catalogue.</p>
            <a class="button button-primary" href="index.html#catalogue">Back to full catalogue</a>
          </div>
        `;
      }
      return;
    }

    document.title = `${state.product.name} — ${state.product.price} | Bros Smoke Shop Uganda`;
    renderBreadcrumbs();
    renderProductHero();
    renderSpecs();
    renderRelatedProducts();
    updateCartUI();
    updateWishlistUI();
    bindEvents();
    fetchProductDetailsFromBackend();
  }

  function syncThemeControl() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    els.themeToggle?.setAttribute('aria-label', label);
    els.themeToggle?.setAttribute('title', label);
  }

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    } catch (_) {}
    syncThemeControl();
  }

  function renderBreadcrumbs() {
    const p = state.product;
    if (els.breadcrumbCategory) {
      els.breadcrumbCategory.textContent = p.category;
      els.breadcrumbCategory.href = `index.html?category=${encodeURIComponent(p.category)}#catalogue`;
    }
    if (els.breadcrumbProduct) {
      els.breadcrumbProduct.textContent = p.name;
    }
  }

  function renderProductHero() {
    const p = state.product;
    const saved = state.wishlist.has(p.id);
    const description = CATEGORY_DESCRIPTIONS[p.category] || CATEGORY_DESCRIPTIONS.Accessories;
    const freeDeliveryEligible = p.priceNumber >= FREE_DELIVERY_THRESHOLD;
    const prevId = (p.id - 1 + products.length) % products.length;
    const nextId = (p.id + 1) % products.length;

    const whatsappOrderHref = buildWhatsAppUrl(
      p.soldOut
        ? `Hi Bros, please let me know when ${p.name} (listed at ${p.price}) is back in stock.`
        : `Hi Bros! I'd like to order ${state.quantity}x ${p.name} (${p.price} each). Is it available for delivery?`
    );

    els.pdpHero.innerHTML = `
      <div class="pdp-grid">
        <div class="pdp-media-stage glass-tile">
          <div class="pdp-media-badges">
            <span class="product-category">${escapeHtml(p.category)}</span>
            ${p.badge ? `<span class="product-badge is-new">${escapeHtml(p.badge)}</span>` : ''}
            <span class="pdp-upscale-tag" title="Enhanced 4x resolution via Real-ESRGAN">4× HD Enhanced</span>
          </div>
          <div class="pdp-image-container" id="pdpImageContainer">
            <img id="pdpMainImage" class="upscaled-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" fetchpriority="high" decoding="async">
          </div>
          <div class="pdp-nav-Neighbors">
            <a class="pdp-neighbor-link" href="${escapeHtml(getProductUrl(prevId))}">← Previous item</a>
            <a class="pdp-neighbor-link" href="index.html#catalogue">All 237 products</a>
            <a class="pdp-neighbor-link" href="${escapeHtml(getProductUrl(nextId))}">Next item →</a>
          </div>
        </div>

        <div class="pdp-info-stage glass-tile">
          <div class="pdp-status-row">
            <span class="pdp-stock-pill ${p.soldOut ? 'is-out' : 'is-in'}">${p.soldOut ? 'Currently Sold Out' : 'In Stock · Ready for Dispatch'}</span>
            <span class="pdp-sku">SKU: BROS-${String(p.id + 1).padStart(3, '0')}</span>
          </div>

          <h1 class="pdp-title">${escapeHtml(p.name)}</h1>

          <div class="pdp-price-block">
            <strong class="pdp-price">${escapeHtml(p.price)}</strong>
            <span class="pdp-delivery-pill ${freeDeliveryEligible ? 'is-free' : ''}">
              ${freeDeliveryEligible ? '✦ Qualifies for FREE Kampala Delivery' : 'Same-day Kampala delivery available'}
            </span>
          </div>

          <p class="pdp-description">${escapeHtml(description)}</p>

          ${!p.soldOut ? `
            <div class="pdp-purchase-controls">
              <div class="pdp-qty-selector" aria-label="Select quantity">
                <button type="button" id="pdpQtyMinus" aria-label="Decrease quantity">−</button>
                <span id="pdpQtyValue">${state.quantity}</span>
                <button type="button" id="pdpQtyPlus" aria-label="Increase quantity">+</button>
              </div>
              <button class="button button-primary pdp-add-btn" type="button" id="pdpAddToCart">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
                Add to Bag · <span id="pdpAddBtnPrice">${formatUGX(p.priceNumber * state.quantity)}</span>
              </button>
            </div>
          ` : ''}

          <div class="pdp-secondary-actions">
            ${!p.soldOut ? `
              <button class="button button-gold pdp-buy-now" type="button" id="pdpBuyNow">
                Buy Now (Express Checkout)
              </button>
            ` : ''}
            <a class="button button-whatsapp" id="pdpWhatsAppBtn" href="${escapeHtml(whatsappOrderHref)}" target="_blank" rel="noopener noreferrer">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19l.9-4.7A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9.5 9c.6 1.8 2 3.2 3.8 3.8"/></svg>
              ${p.soldOut ? 'Request Restock Alert on WhatsApp' : 'Order Directly on WhatsApp'}
            </a>
            <button class="button button-outline pdp-wishlist-btn ${saved ? 'is-active' : ''}" type="button" id="pdpToggleWishlist" aria-pressed="${saved}">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>
              <span>${saved ? 'Saved in Wishlist' : 'Save to Wishlist'}</span>
            </button>
          </div>

          <div class="pdp-trust-strip">
            <div><strong>100% Authentic</strong><span>Verified genuine stock</span></div>
            <div><strong>Express Dispatch</strong><span>Under 60 mins in central Kampala</span></div>
            <div><strong>21+ Adult Store</strong><span>ID verified on delivery</span></div>
          </div>
        </div>
      </div>
    `;

    const mainImg = document.getElementById('pdpMainImage');
    if (mainImg) {
      mainImg.addEventListener('error', () => {
        mainImg.classList.add('is-broken');
        const parent = mainImg.parentElement;
        if (parent && !parent.querySelector('.image-fallback')) {
          const fallback = document.createElement('span');
          fallback.className = 'image-fallback';
          fallback.innerHTML = `<strong>b.</strong><small>${escapeHtml(p.category)}</small>`;
          parent.appendChild(fallback);
        }
      }, { once: true });
    }

    document.getElementById('pdpQtyMinus')?.addEventListener('click', () => {
      state.quantity = Math.max(1, state.quantity - 1);
      syncQtyDisplay();
    });

    document.getElementById('pdpQtyPlus')?.addEventListener('click', () => {
      state.quantity = Math.min(99, state.quantity + 1);
      syncQtyDisplay();
    });

    document.getElementById('pdpAddToCart')?.addEventListener('click', () => {
      addToCart(p.id, state.quantity);
    });

    document.getElementById('pdpBuyNow')?.addEventListener('click', () => {
      addToCart(p.id, state.quantity);
      openCheckoutDialog();
    });

    document.getElementById('pdpToggleWishlist')?.addEventListener('click', () => {
      toggleWishlist(p.id);
    });
  }

  function syncQtyDisplay() {
    const p = state.product;
    const qtyEl = document.getElementById('pdpQtyValue');
    const priceEl = document.getElementById('pdpAddBtnPrice');
    const waBtn = document.getElementById('pdpWhatsAppBtn');
    if (qtyEl) qtyEl.textContent = String(state.quantity);
    if (priceEl) priceEl.textContent = formatUGX(p.priceNumber * state.quantity);
    if (waBtn && !p.soldOut) {
      waBtn.href = buildWhatsAppUrl(
        `Hi Bros! I'd like to order ${state.quantity}x ${p.name} (${p.price} each, total ${formatUGX(p.priceNumber * state.quantity)}). Is it available for delivery?`
      );
    }
  }

  function renderSpecs(customSpecs = null) {
    if (!els.pdpSpecList) return;
    const p = state.product;
    const specs = customSpecs || {
      'Department': p.category,
      'Product Code': `BROS-${String(p.id + 1).padStart(3, '0')}`,
      'Listed Price': p.price,
      'Availability': p.soldOut ? 'Out of stock (Restock on request)' : 'In stock in Kampala',
      'Image Quality': '4× Real-ESRGAN Enhanced',
      'Age Requirement': '21+ Adults Only',
    };

    els.pdpSpecList.innerHTML = Object.entries(specs)
      .map(([key, val]) => `
        <div class="pdp-spec-row">
          <dt>${escapeHtml(key)}</dt>
          <dd>${escapeHtml(val)}</dd>
        </div>
      `)
      .join('');
  }

  async function fetchProductDetailsFromBackend() {
    const data = await apiRequest(`/api/products/${encodeURIComponent(state.product.id)}`);
    if (data && data.product) {
      if (data.product.specs) renderSpecs(data.product.specs);
      if (Array.isArray(data.product.reviews)) {
        state.reviews = data.product.reviews;
      }
      renderReviews(data.product.avg_rating || 4.9, data.product.review_count || state.reviews.length);
    } else {
      renderReviews(4.9, 0);
    }
  }

  function renderReviews(avgRating = 4.9, reviewCount = 0) {
    if (els.pdpAvgRating) els.pdpAvgRating.textContent = Number(avgRating || 4.9).toFixed(1);
    if (els.pdpReviewCount) {
      els.pdpReviewCount.textContent = reviewCount > 0 ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'Verified Store';
    }

    if (!els.pdpReviewsList) return;

    if (!state.reviews.length) {
      els.pdpReviewsList.innerHTML = `
        <div class="pdp-review-card glass-tile">
          <div class="pdp-review-top">
            <strong>Bros Quality Guarantee</strong>
            <span class="pdp-stars" aria-label="5 out of 5 stars">★★★★★</span>
          </div>
          <p>Every ${escapeHtml(state.product.name)} is inspected by our Kampala team before dispatch. Have a question or already tried it? Leave the first customer review!</p>
        </div>
      `;
      return;
    }

    els.pdpReviewsList.innerHTML = state.reviews
      .map((rev) => {
        const stars = '★'.repeat(Math.max(1, Math.min(5, Number(rev.rating) || 5))) +
                      '☆'.repeat(5 - Math.max(1, Math.min(5, Number(rev.rating) || 5)));
        return `
          <article class="pdp-review-card glass-tile">
            <div class="pdp-review-top">
              <strong>${escapeHtml(rev.author)}</strong>
              <span class="pdp-stars">${stars}</span>
            </div>
            <p>${escapeHtml(rev.comment)}</p>
          </article>
        `;
      })
      .join('');
  }

  function renderRelatedProducts() {
    const p = state.product;
    if (els.relatedHeading) els.relatedHeading.textContent = `More in ${p.category}`;
    if (els.viewAllCategoryLink) {
      els.viewAllCategoryLink.href = `index.html?category=${encodeURIComponent(p.category)}#catalogue`;
    }
    if (!els.relatedProductsGrid) return;

    const related = products
      .filter((item) => item.category === p.category && item.id !== p.id && !item.soldOut)
      .slice(0, 4);

    els.relatedProductsGrid.innerHTML = related
      .map((item) => {
        const href = getProductUrl(item);
        const saved = state.wishlist.has(item.id);
        const badgeLabel = item.soldOut ? 'Sold out' : item.badge ? 'New arrival' : 'Available';
        const badgeClass = item.soldOut ? ' is-sold' : item.badge ? ' is-new' : '';
        return `
          <article class="product-card" data-product-id="${item.id}" data-product-href="${escapeHtml(href)}">
            <div class="product-media" role="link" tabindex="0" data-open-page="${item.id}" aria-label="Open ${escapeHtml(item.name)} product page">
              <img class="upscaled-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async">
              <span class="product-badge${badgeClass}">${badgeLabel}</span>
              <div class="product-card-actions">
                <button class="product-mini-action ${saved ? 'is-saved' : ''}" type="button" data-toggle-wishlist="${item.id}" aria-label="Save ${escapeHtml(item.name)}" aria-pressed="${saved}">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>
                </button>
              </div>
            </div>
            <div class="product-info">
              <div class="product-category">
                <span>${escapeHtml(item.category)}</span>
                <span class="product-status">Available</span>
              </div>
              <h3><a class="product-title-link" href="${escapeHtml(href)}">${escapeHtml(item.name)}</a></h3>
              <div class="product-price-line">
                <span class="product-price">${escapeHtml(item.price)}</span>
                <a class="product-price-note" href="${escapeHtml(href)}">View details →</a>
              </div>
              <div class="product-actions">
                <a class="product-chat" href="${escapeHtml(buildWhatsAppUrl(`Hi Bros, I'm interested in ${item.name} (${item.price}).`))}" target="_blank" rel="noopener noreferrer">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19l.9-4.7A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 9.3c.5 1.7 1.8 3 3.5 3.7"/></svg>
                  <span>WhatsApp</span>
                </a>
                <button class="product-add" type="button" data-add-to-cart="${item.id}" aria-label="Add ${escapeHtml(item.name)} to bag">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
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

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
    } catch (_) {}
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
    showToast(`Added ${quantity}× ${product.name} to your bag.`);
  }

  function updateCartQuantity(productId, nextQty) {
    const id = Number(productId);
    if (!products[id]) return;
    if (nextQty <= 0) delete state.cart[id];
    else state.cart[id] = Math.min(99, nextQty);
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
    if (els.cartHeadingCount) els.cartHeadingCount.textContent = `(${totalCount})`;
    if (els.cartTotal) els.cartTotal.textContent = formattedSubtotal;
    if (els.utilityCartTotal) els.utilityCartTotal.textContent = formattedSubtotal;
    if (els.cartSubtotal) els.cartSubtotal.textContent = formattedSubtotal;

    if (els.cartEmpty) els.cartEmpty.hidden = entries.length > 0;
    if (els.cartFooter) els.cartFooter.hidden = entries.length === 0;

    if (els.cartDeliveryHint) {
      const remaining = FREE_DELIVERY_THRESHOLD - subtotal;
      els.cartDeliveryHint.textContent = remaining > 0
        ? `Add ${formatUGX(remaining)} more for complimentary Kampala delivery.`
        : 'Your bag qualifies for complimentary delivery in Kampala!';
    }

    if (els.cartItems) {
      els.cartItems.innerHTML = entries
        .map(({ product, quantity }) => `
          <article class="cart-line">
            <a href="${escapeHtml(getProductUrl(product))}">
              <img class="upscaled-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
            </a>
            <div>
              <h3><a href="${escapeHtml(getProductUrl(product))}">${escapeHtml(product.name)}</a></h3>
              <p>${escapeHtml(product.price)} each</p>
              <button class="cart-remove" type="button" data-cart-remove="${product.id}">Remove</button>
            </div>
            <div class="cart-line-actions">
              <button class="quantity-button" type="button" data-cart-qty="${product.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
              <span class="cart-quantity">${quantity}</span>
              <button class="quantity-button" type="button" data-cart-qty="${product.id}" data-delta="1" aria-label="Increase quantity">+</button>
            </div>
          </article>
        `)
        .join('');
    }
  }

  function loadWishlist() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(Number).filter((id) => products[id]) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveWishlist() {
    try {
      localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify([...state.wishlist]));
    } catch (_) {}
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
      showToast(`Removed ${product.name} from wishlist.`);
    } else {
      state.wishlist.add(id);
      showToast(`Saved ${product.name} to wishlist.`);
    }

    saveWishlist();
    updateWishlistUI();
    renderProductHero();
    renderRelatedProducts();
  }

  function updateWishlistUI() {
    const count = state.wishlist.size;
    if (els.wishlistCount) {
      els.wishlistCount.textContent = String(count);
      els.wishlistCount.hidden = count === 0;
    }
    if (els.utilityWishlistCount) {
      els.utilityWishlistCount.textContent = String(count);
      els.utilityWishlistCount.hidden = count === 0;
    }
  }

  function openCheckoutDialog() {
    const entries = getCartEntries();
    if (!entries.length || !els.checkoutDialog) return;

    const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceNumber * entry.quantity, 0);
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 10000;
    const total = subtotal + deliveryFee;

    if (els.checkoutForm) els.checkoutForm.hidden = false;
    if (els.orderConfirmationBox) els.orderConfirmationBox.hidden = true;

    if (els.checkoutSummaryBox) {
      els.checkoutSummaryBox.innerHTML = `
        <div class="summary-line"><span>Items (${entries.reduce((s, e) => s + e.quantity, 0)})</span><strong>${formatUGX(subtotal)}</strong></div>
        <div class="summary-line"><span>Kampala Delivery</span><strong>${deliveryFee === 0 ? 'FREE' : formatUGX(deliveryFee)}</strong></div>
        <div class="summary-line summary-total"><span>Total Payable</span><strong>${formatUGX(total)}</strong></div>
      `;
    }

    closeDialog(els.cartDialog);
    openDialog(els.checkoutDialog);
  }

  async function submitOrder(event) {
    event.preventDefault();
    const entries = getCartEntries();
    if (!entries.length) return;

    const customerName = document.getElementById('orderCustomerName')?.value.trim() || '';
    const customerPhone = document.getElementById('orderCustomerPhone')?.value.trim() || '';
    const deliveryArea = document.getElementById('orderDeliveryArea')?.value.trim() || '';
    const paymentMethod = document.getElementById('orderPaymentMethod')?.value || 'Cash on Delivery';
    const deliveryNotes = document.getElementById('orderDeliveryNotes')?.value.trim() || '';

    if (!customerName || !customerPhone || !deliveryArea) {
      showToast('Please fill in your name, phone number, and Kampala delivery area.');
      return;
    }

    const res = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        session_id: SESSION_ID,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_area: deliveryArea,
        delivery_notes: deliveryNotes,
        payment_method: paymentMethod,
        items: entries.map(({ product, quantity }) => ({ id: product.id, quantity })),
      }),
    });

    const subtotal = entries.reduce((sum, entry) => sum + entry.product.priceNumber * entry.quantity, 0);
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 10000;
    const total = subtotal + deliveryFee;

    const orderRecord = (res && res.order) ? res.order : {
      order_code: 'BROS-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      customer_name: customerName,
      delivery_area: deliveryArea,
      total,
      whatsapp_url: buildWhatsAppUrl(
        `Hi Bros! I placed order for ${entries.map(e => `${e.quantity}x ${e.product.name}`).join(', ')} (${formatUGX(total)}) to ${deliveryArea}.`
      ),
    };

    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders) || '[]');
      existing.unshift(orderRecord);
      localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(existing.slice(0, 20)));
    } catch (_) {}

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
          <p>Your order <strong>${escapeHtml(orderRecord.order_code)}</strong> has been registered for delivery to <strong>${escapeHtml(orderRecord.delivery_area)}</strong>.</p>
          <div class="order-code-banner">
            <span>Order Reference</span>
            <strong>${escapeHtml(orderRecord.order_code)}</strong>
          </div>
          <div class="order-success-actions">
            <a class="button button-whatsapp" href="${escapeHtml(orderRecord.whatsapp_url)}" target="_blank" rel="noopener noreferrer">
              Send Order ${escapeHtml(orderRecord.order_code)} on WhatsApp ↗
            </a>
            <button class="button button-outline" type="button" data-close-dialog>Close</button>
          </div>
        </div>
      `;
    }

    showToast(`Order ${orderRecord.order_code} created!`);
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
    els.cartToggle?.addEventListener('click', (event) => openDialog(els.cartDialog, event.currentTarget));
    els.checkoutWhatsApp?.addEventListener('click', checkoutOnWhatsApp);
    els.openCheckoutModal?.addEventListener('click', openCheckoutDialog);
    els.checkoutForm?.addEventListener('submit', submitOrder);

    els.pdpReviewForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const author = document.getElementById('reviewAuthor')?.value.trim();
      const rating = Number(document.getElementById('reviewRating')?.value) || 5;
      const comment = document.getElementById('reviewComment')?.value.trim();
      if (!author || !comment) return;

      const res = await apiRequest(`/api/products/${encodeURIComponent(state.product.id)}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ author, rating, comment }),
      });

      const newReview = (res && res.review) ? res.review : {
        author,
        rating,
        comment,
        created_at: Math.floor(Date.now() / 1000),
      };

      state.reviews.unshift(newReview);
      const avg = state.reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / state.reviews.length;
      renderReviews(avg, state.reviews.length);
      els.pdpReviewForm.reset();
      showToast('Thank you! Your review has been posted.');
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const addTrigger = target.closest('[data-add-to-cart]');
      if (addTrigger) {
        event.stopPropagation();
        addToCart(addTrigger.getAttribute('data-add-to-cart'), 1);
        return;
      }

      const wishlistTrigger = target.closest('[data-toggle-wishlist]');
      if (wishlistTrigger) {
        event.stopPropagation();
        toggleWishlist(wishlistTrigger.getAttribute('data-toggle-wishlist'));
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

      const closeButton = target.closest('[data-close-dialog]');
      if (closeButton) {
        closeDialog(closeButton.closest('dialog'));
        return;
      }

      if (target instanceof HTMLDialogElement) {
        closeDialog(target);
      }
    });
  }
})();
