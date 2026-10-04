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

## Icons

Interface icons are inline 24px stroke SVGs that inherit the global `svg` rule in `styles.css`.
Brand marks are the exception: they are solid glyphs and opt out of the stroke system through
`.wa-icon` (`fill: currentColor`, no stroke). The WhatsApp mark is declared once as a sprite at
the top of `index.html` (`<symbol id="icon-whatsapp">`) and every CTA — static markup and the
templates in `app.js` (`WA_ICON`) alike — references it with `<use href="#icon-whatsapp">`. The
symbol's `viewBox` carries 4.4 units of padding, so the mark keeps the same optical size as the
line icons it sits beside at every size (13px chips to 22px floating pill) without per-component
tuning. Add new WhatsApp touchpoints by reusing the sprite instead of drawing another bubble,
otherwise the mark drifts one component at a time.

## Store behaviour

- Orders are handed off to WhatsApp at `+256 780 844 098`; the site does not collect payment details.
- Search, category and price filters, sorting, availability, wishlist, comparison, quick view and bag contents work in the browser. Theme, age verification, wishlist and bag preferences are stored locally.
- The top 12 products in the existing catalogue are used for the “New arrivals” view; the featured set is curated by product index in `app.js`.
- Product-specific star ratings, old prices, sales counts and stock quantities are not in the source catalogue. The storefront therefore does not invent those values or show a fabricated discount timer/progress bar. Add a real promotion/inventory feed before enabling sale badges, countdowns or sold-progress indicators.
- Conversion hooks emit `bros:metric` browser events (`add_to_cart`, `whatsapp_click`, `search`, `product_quick_view`, and others). An existing analytics tool can listen for those events or use the optional `dataLayer` integration in `app.js`.

## Markup notes

`index.html` is clean under `html-validate` except two deliberate exceptions, so they are not
"fixed" again by accident:

- The search typeahead popup keeps `role="listbox"` instead of a native `<select>`: 237 products
  with photos need filtering as you type. The input is a spec-complete combobox
  (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-activedescendant`).
- `require-sri` on the four `<link>`/`<script>` tags: `products.js` and `app.js` are first-party
  files that change with every catalogue edit (an integrity hash would rot), and Google Fonts
  does not publish stable hashes for its stylesheet.

The age gate owns the page `<h1>` because it is `display: none` once verified, leaving the hero
`<h1>` as the only heading at that level in the accessibility tree.

## Before launch

Confirm the age requirement, delivery threshold, delivery coverage, phone number, store claims and current catalogue availability with the business. The product image URLs continue to load from the existing image host, so those images still require the host to remain available.
