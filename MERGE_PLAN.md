# Storefront rebuild + backend reconciliation plan

## Decision and scope

Target `main`; preserve its Python backend and deployment assets, while taking the rebuilt storefront from `arena/01a0fd46-bros` (the current review branch is based on `bfae5c6`). The merge base is `12d1db33f6dda2adcab141a6eadcfa032df46c1d`.

The merge simulation reports four conflicting paths. `products.js` is present on both sides but is byte-identical, so Git resolves it without a conflict. The remaining main-only files are retained.

## Exact conflict map

| Path | Merge result | Resolution |
| --- | --- | --- |
| `README.md` | Both sides edited the file; run/deployment instructions and product behavior disagree. | Manually combine the rebuild's static-storefront and accessibility notes with the backend/API instructions. Document that the homepage uses browser storage and WhatsApp, while `server.py` remains available and GitHub Pages does not run it. |
| `app.js` | Add/add: each side independently added a different storefront controller after the common base. | Take the rebuild-side file (`bfae5c6`): its search, filtering, compare, quick view, browser bag, accessibility fixes, and WhatsApp flow are the selected homepage behavior. Do not blend main's API/order controller into it. |
| `index.html` | Both sides edited the page from the old common-base document. | Take the rebuilt page (including its markup/accessibility fixes). Reapply main's deployment-specific `bros.chikwafu.com` URL in Open Graph/JSON-LD, add a canonical URL and the retained `favicon.svg` link. Do not reintroduce main's old homepage markup. |
| `styles.css` | Add/add: each side independently added a different full design system. | Take the rebuild-side `styles.css` as the homepage stylesheet. Do not append main's amber-wide overrides. Move only the retained product-detail-page (`.pdp-*`) rules into a new `product.css`, tune them to the rebuild's blue tokens, and load that file from `product.html`; this keeps the PDP styles isolated. |
| `products.js` | Added on both sides, no content conflict. | Keep the identical file; both blob IDs are `121612604c9c216bcf7670ebb771d0a0bb93b5e6` (the 237-item product data remains unchanged). |

## Main-only paths to keep

These add-only paths merge without conflict and must remain in the result: `.gitignore`, `CNAME`, `data/upscale_manifest.json`, `favicon.svg`, `images/amber-fluted-gradient.png`, `product.html`, `product.js`, `scripts/upscale_images.py`, and **`server.py`**. `product.html` and `product.js` remain available as the existing backend-aware detail page; `product.css` preserves its detail-page layout without replacing the rebuilt homepage CSS.

## Behavior boundary to review

The selected homepage `app.js` is intentionally the rebuild's localStorage/WhatsApp implementation and does **not** call the main branch's `/api/*` endpoints. `server.py` and the API are preserved, and the retained `product.js` still uses them when that detail page is served by the Python server, but the rebuilt homepage currently opens its quick-view dialog rather than linking to `product.html`. Connecting the homepage cart/order flow to the API or adding a full-detail link is a separate follow-up, not a hidden part of this merge.

`CNAME` and the custom-domain metadata are kept for GitHub Pages. GitHub Pages is static hosting; it will not run `server.py`, so API-backed behavior still requires a separately hosted service. The old main homepage was replaced rather than patched line-by-line. The inherited product-page validator errors (DOCTYPE casing, generic-element name, telephone spacing, missing form submit control, and missing image `src`) were fixed in this follow-up; both served HTML documents now pass the recommended validator preset. The only remaining validator suppression is the scoped `prefer-native-element` exception on the custom searchable listbox.

## Verification recorded for this merge

1. `node --check app.js`, `node --check products.js`, and `node --check product.js` pass; the catalogue still has 237 records.
2. `python3 -m py_compile server.py scripts/upscale_images.py` passes.
3. Both served pages have unique static IDs, no missing ARIA references, no `<img>` without `src`, and no form without a submit control; all merge-conflict markers are removed.
4. `html-validate` 11.16.2 (recommended preset) passes on `index.html`, `product.html`, and the whole repository with zero errors. The rebuild's filterable listbox has a one-element, reasoned `prefer-native-element` suppression.
5. An axe-core/jsdom check returns zero WCAG 2.1 A/AA violations on both pages in light and dark themes after confirming age; jsdom lacks canvas, so color-contrast coverage may be incomplete.
6. A live `server.py` smoke test returned HTTP 200 for `/`, `/product.html`, `/product.css`, and `/api/products`; `/api/health` reported 237 products.
