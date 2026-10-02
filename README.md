# Bros storefront

A responsive, static Bros storefront built with vanilla HTML, CSS and JavaScript for GitHub Pages. There is no build step or runtime dependency.

## Run locally

From this directory, start any static file server, for example:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Files

- `index.html` — page structure, metadata, age gate, navigation, sections and dialogs.
- `styles.css` — responsive light/dark design system and component styles.
- `app.js` — theme persistence, age verification, catalogue filters/search, wishlist, comparison, quick view, local bag and WhatsApp actions.
- `products.js` — the existing 237-item product array. Product names, UGX prices, image URLs and availability values are preserved from the previous site; product photos are not edited or replaced.

## Store behaviour

- Orders are handed off to WhatsApp at `+256 780 844 098`; the site does not collect payment details.
- Search, category and price filters, sorting, availability, wishlist, comparison, quick view and bag contents work in the browser. Theme, age verification, wishlist and bag preferences are stored locally.
- The top 12 products in the existing catalogue are used for the “New arrivals” view; the featured set is curated by product index in `app.js`.
- Product-specific star ratings, old prices, sales counts and stock quantities are not in the source catalogue. The storefront therefore does not invent those values or show a fabricated discount timer/progress bar. Add a real promotion/inventory feed before enabling sale badges, countdowns or sold-progress indicators.
- Conversion hooks emit `bros:metric` browser events (`add_to_cart`, `whatsapp_click`, `search`, `product_quick_view`, and others). An existing analytics tool can listen for those events or use the optional `dataLayer` integration in `app.js`.

## Before launch

Confirm the age requirement, delivery threshold, delivery coverage, phone number, store claims and current catalogue availability with the business. The product image URLs continue to load from the existing image host, so those images still require the host to remain available.
