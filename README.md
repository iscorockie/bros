# Bros storefront & backend

The homepage is the rebuilt, responsive Bros storefront for GitHub Pages, with a Python/SQLite service retained for local or separately hosted backend workflows. Product names, UGX prices, image URLs, and availability remain in the shared 237-item catalogue.

## Run locally

For the full Python server and API:

```sh
python3 server.py
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` by default and serves the static files, `product.html`, `/api/*`, `/favicon.ico`, and `/upscaled/inputs/...`.

For a static-only preview instead:

```sh
python3 -m http.server 8080
```

The static server does not provide `/api/*` routes.

## Storefront files

- `index.html` + `app.js` — rebuilt landing page with catalogue search, category/price filters, sorting, availability, wishlist, comparison, quick view, local bag, and WhatsApp-first ordering.
- `styles.css` — the rebuilt responsive light/dark design system.
- `products.js` — the unchanged catalogue of 237 products and existing image URLs.
- `product.html` + `product.js` + `product.css` — the retained detail/review page and its backend-aware interactions; `product.css` isolates the detail-page styles from the rebuilt homepage stylesheet.
- `favicon.svg` — site icon. `CNAME` configures the `bros.chikwafu.com` custom domain for GitHub Pages.

The rebuilt homepage intentionally uses browser storage and WhatsApp for its bag/order handoff; its `app.js` does not call the retained API. The retained detail page still uses API endpoints when served by `server.py`. The homepage currently opens products in its quick-view dialog rather than linking to `product.html`.

GitHub Pages serves static assets only, so it does not run `server.py` or provide the API. Backend-dependent detail-page actions need a separately hosted API when the site is deployed there.

## Backend (`server.py`)

SQLite-backed endpoints include session carts and wishlists, orders, product data and reviews, newsletter subscriptions, inquiries, metrics, and image-upscale status:

- `GET /api/health`
- `GET /api/products` and `GET /api/products/<id>`
- `POST /api/products/<id>/reviews`
- `GET` / `POST /api/cart?session_id=`
- `GET` / `POST /api/wishlist?session_id=`
- `GET` / `POST /api/orders` and `GET /api/orders/<orderRef>`
- `POST /api/inquiries`
- `POST /api/newsletter`
- `GET /api/upscale/status`

The server stores its SQLite database under the ignored `.cache/` directory. Do not expose the local development server as a production API without reviewing its deployment and security requirements.

## Images

Catalogue photos continue to load from their existing image host; the store does not edit or replace them. `scripts/upscale_images.py` writes `data/upscale_manifest.json` without rewriting catalogue URLs. The optional Real-ESRGAN workflow and its outputs are not required to run the storefront.

## Icons and storefront behavior

Interface icons are inline 24px stroke SVGs that inherit the global `svg` rule in `styles.css`. Brand marks are the exception: they are solid glyphs and opt out of the stroke system through `.wa-icon` (`fill: currentColor`, no stroke). The WhatsApp mark is declared once as a sprite at the top of `index.html` (`<symbol id="icon-whatsapp">`) and the static CTAs and `app.js` templates reference it with `<use href="#icon-whatsapp">`.

Orders on the rebuilt homepage are handed off to WhatsApp at `+256 780 844 098`; the page does not collect payment details. Search, filters, wishlist, comparison, quick view, and bag contents work in the browser. Theme, age verification, wishlist, and bag preferences are stored locally.

The catalogue does not contain product-specific ratings, old prices, sales counts, or stock quantities. The storefront therefore avoids fabricated discounts, timers, reviews, and sold-progress indicators. Conversion hooks emit `bros:metric` browser events (including `add_to_cart`, `whatsapp_click`, `search`, and `product_quick_view`) for optional analytics integrations.

## Markup notes

`index.html` and `product.html` pass `html-validate` 11.16.2's recommended preset with zero errors. An axe-core/jsdom check returned zero WCAG 2.1 A/AA violations on both pages in light and dark themes; jsdom does not implement canvas, so automated color-contrast evaluation may be incomplete.

Two deliberate exceptions are documented here so they are not "fixed" again by accident:

- The search typeahead keeps a filterable `role="listbox"` rather than a native `<select>` because it searches 237 products as the user types. The input uses the combobox pattern (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, and `aria-activedescendant`). A scoped `html-validate-disable-next prefer-native-element` comment is attached only to this custom suggestion list.
- SRI is not specified for first-party scripts that change with the catalogue and the Google Fonts stylesheet, which does not publish a stable hash.

The age gate owns the page `<h1>` because it is hidden once verified, leaving the hero `<h1>` as the only heading at that level in the accessibility tree. The previous `main` homepage is replaced by the rebuilt, validated page; related markup findings on the retained product page were fixed in this follow-up.


## Before launch

Confirm the age requirement, delivery threshold and coverage, phone number, store claims, and current catalogue availability with the business. Keep the product image host available. GitHub Pages must remain configured for the `CNAME` domain, and `server.py` must be deployed separately if API-backed functionality is required.
