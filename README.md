# Bros Storefront & Backend

A responsive Bros Uganda storefront with a Python/SQLite backend, dedicated product pages, and an amber glass design system. Catalogue photos stay on the cached Photon `?w=600&ssl=1` URLs; Real-ESRGAN 4× results live in `Real-ESRGAN/results/`.

## Run locally

```sh
python3 server.py
```

Open `http://localhost:8080`. The server binds to `0.0.0.0:8080` and serves the storefront, `product.html`, `/api/*`, `/favicon.ico`, and `/upscaled/inputs/...`.

## Storefront

- `index.html` + `app.js` — catalogue, search, wishlist, compare, bag, checkout, and order tracking. Tapping a product opens `product.html?id=<id>`.
- `product.html` + `product.js` — product detail page with quantity, reviews, related items, and WhatsApp ordering.
- `styles.css` — warm amber/ember palette, fluted gradient bands, and frosted glass tiles (replacing the previous blue theme).
- `products.js` — 237 products with cached `?w=600&ssl=1` image URLs.
- `images/amber-fluted-gradient.png` — hero / banner gradient.

## Backend (`server.py`)

SQLite-backed API (session cart, wishlist, orders, reviews, newsletter):

- `GET /api/health`
- `GET /api/products` and `GET /api/products/<id>`
- `POST /api/products/<id>/reviews`
- `GET` / `POST /api/cart?session_id=`
- `GET` / `POST /api/wishlist?session_id=`
- `GET` / `POST /api/orders` and `GET /api/orders/<orderRef>`
- `POST /api/inquiries`
- `POST /api/newsletter`
- `GET /api/upscale/status`

## Real-ESRGAN

```sh
cd Real-ESRGAN
# pip install -r requirements.txt  # already done in this workspace
python3 inference_realesrgan.py -n realesr-general-x4v3 -i inputs -o results --fp32
```

Batch helper: `python3 scripts/upscale_images.py` (writes `data/upscale_manifest.json` without rewriting catalogue URLs).
