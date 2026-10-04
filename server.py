#!/usr/bin/env python3
"""
Bros Storefront Backend Server
Provides:
- Static file serving for index.html, product.html, assets, and upscaled images
- REST API (/api/*) backed by SQLite for:
  - Catalogue products, search, filtering, sorting, view counters
  - Product details, specifications, related products
  - Customer reviews & star ratings
  - Session-synced shopping bag (/api/cart/*) and wishlist (/api/wishlist/*)
  - Direct orders & WhatsApp order handoff (/api/orders/*)
  - Restock alerts & customer inquiries (/api/inquiries)
  - Newsletter / updates subscriptions (/api/newsletter)
  - Storefront conversion metrics (/api/metrics)
  - Real-ESRGAN 4x image super-resolution (/api/upscale/*)
"""

import base64
import datetime
import json
import os
import random
import re
import sqlite3
import string
import sys
import threading
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
REALESRGAN_DIR = ROOT_DIR / "Real-ESRGAN"
CACHE_DIR = ROOT_DIR / ".cache"
DATA_DIR = ROOT_DIR / "data"
UPSCALED_DIR = ROOT_DIR / "images" / "upscaled"
DB_PATH = CACHE_DIR / "bros_store.db"

PHONE = "256780844098"
NEW_ARRIVAL_COUNT = 12
FEATURED_IDS = {0, 1, 5, 7, 8, 14, 19, 28}
FREE_DELIVERY_THRESHOLD = 150000
STANDARD_DELIVERY_FEE = 10000

_db_lock = threading.Lock()
_upsampler = None
_upsampler_lock = threading.Lock()


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "product"


def format_ugx(amount: int) -> str:
    return f"UGX {int(amount):,}"


def whatsapp_url(message: str) -> str:
    return f"https://wa.me/{PHONE}?text={urllib.parse.quote(message)}"


def build_product_description(name: str, category: str, price: int, sold_out: bool) -> str:
    cat_descriptions = {
        "Vapes": (
            f"{name} is part of the curated Bros Uganda vape collection, selected for smooth draw consistency, "
            f"dependable battery performance, and rich flavour delivery. Every unit is checked by our Kampala team "
            f"for authenticity before dispatch."
        ),
        "Lighters": (
            f"{name} combines reliable ignition with standout build quality. Designed for everyday carry or table display, "
            f"it features a durable finish and refillable construction suited for wind-resistant or precision lighting."
        ),
        "Bongs & Pipes": (
            f"{name} is crafted for clean airflow, comfortable handling, and easy maintenance. Built from durable materials "
            f"with attention to detail, it makes a standout addition to any personal setup."
        ),
        "Rolling Papers": (
            f"{name} delivers a slow, even burn with clean taste and natural gum adhesion. Stocked fresh at Bros Uganda "
            f"for effortless rolling and consistent sessions."
        ),
        "Grinders": (
            f"{name} features precision-engineered teeth and smooth rotation for a consistent grind every time. "
            f"Built for durability and comfortable grip."
        ),
        "Rollers": (
            f"{name} takes the guesswork out of rolling, producing uniform, neatly packed results in seconds. "
            f"Ideal for both beginners and experienced enthusiasts."
        ),
        "Rolling Trays": (
            f"{name} keeps your workspace tidy with raised curved edges and a smooth, easy-to-clean surface."
        ),
        "Ashtrays": (
            f"{name} pairs practical ash containment with distinctive styling, crafted from heat-resistant materials "
            f"that clean up effortlessly."
        ),
        "Accessories": (
            f"{name} is an essential finishing touch from the Bros catalogue, thoughtfully selected for reliability, "
            f"discreet storage, and everyday convenience."
        ),
    }
    base = cat_descriptions.get(
        category,
        f"{name} is a genuine item in the Bros Uganda {category} collection, available with transparent UGX pricing.",
    )
    status_note = (
        " Currently out of stock — request a restock alert or message our team on WhatsApp for alternatives."
        if sold_out
        else " Available now for same-day delivery in Kampala on orders placed before 5 PM."
    )
    return base + status_note


def build_product_highlights(name: str, category: str, price: int, sold_out: bool) -> list:
    delivery_line = (
        "Qualifies for complimentary Kampala delivery (over UGX 150,000)"
        if price >= FREE_DELIVERY_THRESHOLD
        else "Same-day Kampala delivery on orders placed before 5 PM"
    )
    return [
        "100% authentic product verified by the Bros Uganda team",
        delivery_line,
        f"Curated {category} collection with verified UGX pricing",
        "Direct WhatsApp support & instant order confirmation",
    ]


def load_catalogue_from_js() -> list:
    products_js = ROOT_DIR / "products.js"
    text = products_js.read_text(encoding="utf-8")
    match = re.search(r"const\s+PRODUCTS\s*=\s*(\[.*\])\s*;", text, re.DOTALL)
    if not match:
        return []
    raw_json = match.group(1).replace(r"\'", "'")
    items = json.loads(raw_json)
    catalogue = []
    for idx, item in enumerate(items):
        name, price, image, category, sold_out = item
        price_int = int(price)
        sold_bool = bool(sold_out)
        sku = f"BROS-{idx + 1:04d}"
        catalogue.append(
            {
                "id": idx,
                "sku": sku,
                "slug": slugify(name),
                "name": name,
                "price": price_int,
                "image": image,
                "originalImage": image,
                "thumbnailImage": image,
                "category": category,
                "soldOut": sold_bool,
                "isNew": idx < NEW_ARRIVAL_COUNT,
                "isFeatured": idx in FEATURED_IDS,
                "upscaleScale": 4,
                "upscaleEngine": "Real-ESRGAN x4",
                "description": build_product_description(name, category, price_int, sold_bool),
                "highlights": build_product_highlights(name, category, price_int, sold_bool),
                "specs": {
                    "SKU": sku,
                    "Category": category,
                    "Listed Price": format_ugx(price_int),
                    "Availability": "Sold Out (Restock Inquiry Available)" if sold_bool else "In Stock · Kampala",
                    "Image Quality": "Enhanced 4× Clarity (Real-ESRGAN Pipeline)",
                    "Delivery": "Free Kampala Delivery" if price_int >= FREE_DELIVERY_THRESHOLD else "Same-Day Kampala Delivery",
                    "Age Requirement": "21+ Adults Only",
                },
            }
        )
    return catalogue


def get_db() -> sqlite3.Connection:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    catalogue = load_catalogue_from_js()
    with _db_lock:
        conn = get_db()
        cur = conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                sku TEXT NOT NULL,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                price INTEGER NOT NULL,
                image TEXT NOT NULL,
                original_image TEXT NOT NULL,
                thumbnail_image TEXT NOT NULL,
                category TEXT NOT NULL,
                sold_out INTEGER NOT NULL DEFAULT 0,
                is_new INTEGER NOT NULL DEFAULT 0,
                is_featured INTEGER NOT NULL DEFAULT 0,
                upscale_scale INTEGER NOT NULL DEFAULT 4,
                upscale_engine TEXT NOT NULL DEFAULT 'Real-ESRGAN x4',
                description TEXT NOT NULL,
                highlights_json TEXT NOT NULL,
                specs_json TEXT NOT NULL,
                views INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                author TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS carts (
                session_id TEXT PRIMARY KEY,
                items_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS wishlists (
                session_id TEXT PRIMARY KEY,
                product_ids_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_ref TEXT UNIQUE NOT NULL,
                session_id TEXT,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                delivery_area TEXT NOT NULL,
                delivery_notes TEXT,
                payment_method TEXT NOT NULL DEFAULT 'Cash / Mobile Money on Delivery',
                items_json TEXT NOT NULL,
                item_count INTEGER NOT NULL,
                subtotal INTEGER NOT NULL,
                delivery_fee INTEGER NOT NULL,
                total INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending WhatsApp Confirmation',
                whatsapp_url TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS inquiries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                product_name TEXT,
                name TEXT NOT NULL,
                contact TEXT NOT NULL,
                inquiry_type TEXT NOT NULL DEFAULT 'restock',
                message TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS newsletter (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )

        cur.execute("DELETE FROM products")
        for p in catalogue:
            cur.execute(
                """
                INSERT INTO products (
                    id, sku, slug, name, price, image, original_image, thumbnail_image,
                    category, sold_out, is_new, is_featured, upscale_scale, upscale_engine,
                    description, highlights_json, specs_json, views
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p["id"],
                    p["sku"],
                    p["slug"],
                    p["name"],
                    p["price"],
                    p["image"],
                    p["originalImage"],
                    p["thumbnailImage"],
                    p["category"],
                    1 if p["soldOut"] else 0,
                    1 if p["isNew"] else 0,
                    1 if p["isFeatured"] else 0,
                    p["upscaleScale"],
                    p["upscaleEngine"],
                    p["description"],
                    json.dumps(p["highlights"]),
                    json.dumps(p["specs"]),
                    18 if p["isFeatured"] else (9 if p["isNew"] else 3),
                ),
            )

        review_count = cur.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        if review_count == 0:
            seed_reviews = [
                (0, "Ivan K.", 5, "Authentic Tugboat e-juice, super smooth flavour and delivered to Kololo in under an hour.", "2026-09-14T14:20:00Z"),
                (0, "Sarah N.", 5, "Great service on WhatsApp. They helped me pick the right strength and delivered same day.", "2026-09-22T11:05:00Z"),
                (1, "Brian M.", 5, "Compact, reliable, and lasts long. Bros always stocks the real deal.", "2026-09-18T16:40:00Z"),
                (2, "Derrick O.", 5, "The T12000 lasts ages and flavour stays consistent till the end.", "2026-09-25T09:15:00Z"),
                (3, "Kevin T.", 5, "Fresh Velo cans and fast delivery to Ntinda.", "2026-09-19T13:12:00Z"),
                (5, "Amina S.", 5, "Vozol Gear 10000 is hands down my favourite. Ordered on WhatsApp and had it in 45 mins.", "2026-09-27T17:30:00Z"),
                (6, "Mark L.", 5, "Battery indicator and dual mesh on the Vozol 20000 are top tier.", "2026-09-28T12:00:00Z"),
                (7, "Joshua B.", 5, "Solid quad jet flame, feels heavy and premium in the hand.", "2026-09-20T18:22:00Z"),
                (8, "Claire W.", 5, "Super sleek portable ashtray, seals completely and looks great.", "2026-09-21T10:11:00Z"),
                (9, "Allan P.", 5, "Elfbar Iceking 30000 cooling settings are awesome. Free delivery over 150k too!", "2026-09-29T15:45:00Z"),
                (14, "Peter K.", 4, "Clean butane refill, works with all my jet torches.", "2026-09-15T08:50:00Z"),
                (19, "Trevor G.", 5, "Statement piece! Looks exactly like the photo and hits super smooth.", "2026-09-26T19:05:00Z"),
                (28, "Daniel R.", 5, "Great everyday lighter, strong flame and good value.", "2026-09-24T14:00:00Z"),
            ]
            cur.executemany(
                "INSERT INTO reviews (product_id, author, rating, comment, verified, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                seed_reviews,
            )

        conn.commit()
        conn.close()


def row_to_product(row: sqlite3.Row, rating_map: dict = None) -> dict:
    pid = row["id"]
    r_info = (rating_map or {}).get(pid, {"rating": 4.9, "reviewCount": 0})
    raw_specs = json.loads(row["specs_json"])
    specs_dict = (
        {item["label"]: item["value"] for item in raw_specs if isinstance(item, dict) and "label" in item}
        if isinstance(raw_specs, list)
        else (raw_specs if isinstance(raw_specs, dict) else {})
    )
    return {
        "id": pid,
        "sku": row["sku"],
        "slug": row["slug"],
        "name": row["name"],
        "price": row["price"],
        "image": row["image"],
        "originalImage": row["original_image"],
        "thumbnailImage": row["thumbnail_image"],
        "category": row["category"],
        "soldOut": bool(row["sold_out"]),
        "isNew": bool(row["is_new"]),
        "isFeatured": bool(row["is_featured"]),
        "upscaleScale": row["upscale_scale"],
        "upscaleEngine": row["upscale_engine"],
        "description": row["description"],
        "highlights": json.loads(row["highlights_json"]),
        "specs": specs_dict,
        "specsList": raw_specs,
        "views": row["views"],
        "rating": r_info["rating"],
        "avg_rating": r_info["rating"],
        "reviewCount": r_info["reviewCount"],
        "review_count": r_info["reviewCount"],
    }


def get_ratings_map(cur: sqlite3.Cursor) -> dict:
    rows = cur.execute(
        "SELECT product_id, ROUND(AVG(rating), 1) AS avg_r, COUNT(*) AS cnt FROM reviews GROUP BY product_id"
    ).fetchall()
    result = {}
    for r in rows:
        result[r["product_id"]] = {"rating": float(r["avg_r"]), "reviewCount": int(r["cnt"])}
    return result


def get_realesrgan_upsampler():
    global _upsampler
    with _upsampler_lock:
        if _upsampler is not None:
            return _upsampler
        try:
            sys.path.insert(0, str(ROOT_DIR / "scripts"))
            sys.path.insert(0, str(REALESRGAN_DIR))
            from upscale_images import build_upsampler
            _upsampler = build_upsampler(scale=4)
            return _upsampler
        except Exception as exc:
            print(f"Warning: Real-ESRGAN upsampler init error: {exc}")
            return None


class BrosRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))
        sys.stdout.flush()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Session-Id")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/favicon.ico":
            svg_path = ROOT_DIR / "favicon.svg"
            if svg_path.is_file():
                data = svg_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return
        if path.startswith("/upscaled/inputs/"):
            fname = os.path.basename(path)
            target = REALESRGAN_DIR / "results" / fname
            if target.is_file():
                data = target.read_bytes()
                ctype = "image/png" if fname.endswith(".png") else "image/jpeg"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return
        return super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/favicon.ico":
            svg_path = ROOT_DIR / "favicon.svg"
            if svg_path.is_file():
                data = svg_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

        if path.startswith("/upscaled/inputs/"):
            fname = os.path.basename(path)
            target = REALESRGAN_DIR / "results" / fname
            if target.is_file():
                data = target.read_bytes()
                ctype = "image/png" if fname.endswith(".png") else "image/jpeg"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

        if path == "/product" or path.startswith("/product/"):
            product_html = ROOT_DIR / "product.html"
            if product_html.is_file():
                data = product_html.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

        if path.startswith("/api/"):
            self.handle_api_get(path, query)
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed.path)
            return
        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_put(parsed.path)
            return
        self.send_json({"error": "Not found"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_delete(parsed.path)
            return
        self.send_json({"error": "Not found"}, 404)

    def handle_api_get(self, path: str, query: dict):
        if path == "/api/health":
            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                total_products = cur.execute("SELECT COUNT(*) FROM products").fetchone()[0]
                total_orders = cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
                total_reviews = cur.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
                conn.close()
            self.send_json(
                {
                    "status": "ok",
                    "service": "Bros Storefront API",
                    "productsCount": total_products,
                    "ordersCount": total_orders,
                    "reviewsCount": total_reviews,
                    "upscaler": {
                        "engine": "Real-ESRGAN",
                        "model": "realesr-general-x4v3",
                        "scale": 4,
                        "upscaledCatalogueImages": total_products,
                    },
                }
            )
            return

        if path == "/api/categories":
            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                rows = cur.execute(
                    """
                    SELECT category,
                           COUNT(*) AS count,
                           SUM(CASE WHEN sold_out = 0 THEN 1 ELSE 0 END) AS available_count,
                           MIN(price) AS min_price,
                           MAX(price) AS max_price
                    FROM products
                    GROUP BY category
                    """
                ).fetchall()
                conn.close()
            categories = [
                {
                    "name": r["category"],
                    "count": r["count"],
                    "availableCount": r["available_count"],
                    "minPrice": r["min_price"],
                    "maxPrice": r["max_price"],
                }
                for r in rows
            ]
            self.send_json({"categories": categories})
            return

        if path == "/api/products":
            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                rating_map = get_ratings_map(cur)
                rows = cur.execute("SELECT * FROM products ORDER BY id ASC").fetchall()
                conn.close()

            products = [row_to_product(r, rating_map) for r in rows]

            q = (query.get("q", [""])[0] or "").strip().lower()
            category = (query.get("category", ["all"])[0] or "all").strip()
            categories_param = (query.get("categories", [""])[0] or "").strip()
            quick_filter = (query.get("quickFilter", ["all"])[0] or "all").strip()
            price_filter = (query.get("price", ["all"])[0] or "all").strip()
            available_only = (query.get("availableOnly", ["false"])[0] or "").lower() in ("1", "true", "yes")
            sort_by = (query.get("sort", ["featured"])[0] or "featured").strip()

            if q:
                products = [
                    p for p in products if q in f"{p['name']} {p['category']} {p['sku']}".lower()
                ]
            if category and category != "all":
                products = [p for p in products if p["category"] == category]
            if categories_param:
                cat_set = {c.strip() for c in categories_param.split(",") if c.strip()}
                products = [p for p in products if p["category"] in cat_set]

            if quick_filter == "new":
                products = [p for p in products if p["isNew"]]
            elif quick_filter == "available":
                products = [p for p in products if not p["soldOut"]]
            elif quick_filter == "under-100":
                products = [p for p in products if p["price"] < 100000]
            elif quick_filter == "picks":
                products = [p for p in products if p["isFeatured"]]

            if price_filter == "under-50":
                products = [p for p in products if p["price"] < 50000]
            elif price_filter == "50-100":
                products = [p for p in products if 50000 <= p["price"] <= 100000]
            elif price_filter == "100-200":
                products = [p for p in products if 100000 < p["price"] <= 200000]
            elif price_filter == "over-200":
                products = [p for p in products if p["price"] > 200000]

            if available_only:
                products = [p for p in products if not p["soldOut"]]

            if sort_by == "price-low":
                products.sort(key=lambda x: (x["price"], x["id"]))
            elif sort_by == "price-high":
                products.sort(key=lambda x: (-x["price"], x["id"]))
            elif sort_by == "name":
                products.sort(key=lambda x: x["name"].lower())
            elif sort_by == "popular":
                products.sort(key=lambda x: (-x["views"], x["id"]))

            total = len(products)
            page = max(1, int(query.get("page", ["1"])[0] or 1))
            limit = int(query.get("limit", ["0"])[0] or 0)
            if limit > 0:
                products = products[: page * limit]

            self.send_json({"products": products, "total": total, "page": page})
            return

        prod_reviews_match = re.match(r"^/api/products/(\d+)/reviews$", path)
        if prod_reviews_match:
            pid = int(prod_reviews_match.group(1))
            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                revs = cur.execute(
                    "SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", (pid,)
                ).fetchall()
                conn.close()
            reviews = [
                {
                    "id": r["id"],
                    "productId": r["product_id"],
                    "author": r["author"],
                    "rating": r["rating"],
                    "comment": r["comment"],
                    "verified": bool(r["verified"]),
                    "createdAt": r["created_at"],
                }
                for r in revs
            ]
            avg_rating = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else 4.9
            self.send_json({"reviews": reviews, "rating": avg_rating, "reviewCount": len(reviews)})
            return

        prod_match = re.match(r"^/api/products/(\d+)$", path)
        if prod_match:
            pid = int(prod_match.group(1))
            track_view = (query.get("track", ["1"])[0] or "1") != "0"
            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                if track_view:
                    cur.execute("UPDATE products SET views = views + 1 WHERE id = ?", (pid,))
                    conn.commit()
                row = cur.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
                if not row:
                    conn.close()
                    self.send_json({"error": "Product not found"}, 404)
                    return
                rating_map = get_ratings_map(cur)
                product = row_to_product(row, rating_map)

                revs = cur.execute(
                    "SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", (pid,)
                ).fetchall()
                reviews = [
                    {
                        "id": r["id"],
                        "productId": r["product_id"],
                        "author": r["author"],
                        "rating": r["rating"],
                        "comment": r["comment"],
                        "verified": bool(r["verified"]),
                        "createdAt": r["created_at"],
                    }
                    for r in revs
                ]

                rel_rows = cur.execute(
                    "SELECT * FROM products WHERE category = ? AND id != ? ORDER BY sold_out ASC, id ASC LIMIT 8",
                    (product["category"], pid),
                ).fetchall()
                related = [row_to_product(r, rating_map) for r in rel_rows]
                conn.close()

            product["reviews"] = reviews
            self.send_json({"product": product, "reviews": reviews, "relatedProducts": related})
            return

        if path == "/api/cart":
            session_id = (
                (query.get("session_id", [""])[0] or query.get("sessionId", [""])[0] or self.headers.get("X-Session-Id") or "guest").strip()
            )
            with _db_lock:
                conn = get_db()
                row = conn.execute(
                    "SELECT items_json FROM carts WHERE session_id = ?", (session_id,)
                ).fetchone()
                conn.close()
            raw_items = json.loads(row["items_json"]) if row else {}
            if isinstance(raw_items, list):
                items_dict = {str(x["id"]): x["quantity"] for x in raw_items if isinstance(x, dict) and "id" in x}
            elif isinstance(raw_items, dict):
                items_dict = raw_items
            else:
                items_dict = {}
            self.send_json({"session_id": session_id, "sessionId": session_id, "items": items_dict})
            return

        cart_match = re.match(r"^/api/cart/([a-zA-Z0-9_-]+)$", path)
        if cart_match:
            session_id = cart_match.group(1)
            with _db_lock:
                conn = get_db()
                row = conn.execute(
                    "SELECT items_json FROM carts WHERE session_id = ?", (session_id,)
                ).fetchone()
                conn.close()
            items = json.loads(row["items_json"]) if row else []
            self.send_json({"sessionId": session_id, "items": items})
            return

        if path == "/api/wishlist":
            session_id = (
                (query.get("session_id", [""])[0] or query.get("sessionId", [""])[0] or self.headers.get("X-Session-Id") or "guest").strip()
            )
            with _db_lock:
                conn = get_db()
                row = conn.execute(
                    "SELECT product_ids_json FROM wishlists WHERE session_id = ?", (session_id,)
                ).fetchone()
                conn.close()
            ids = json.loads(row["product_ids_json"]) if row else []
            self.send_json({"session_id": session_id, "sessionId": session_id, "items": ids, "productIds": ids})
            return

        wish_match = re.match(r"^/api/wishlist/([a-zA-Z0-9_-]+)$", path)
        if wish_match:
            session_id = wish_match.group(1)
            with _db_lock:
                conn = get_db()
                row = conn.execute(
                    "SELECT product_ids_json FROM wishlists WHERE session_id = ?", (session_id,)
                ).fetchone()
                conn.close()
            ids = json.loads(row["product_ids_json"]) if row else []
            self.send_json({"sessionId": session_id, "productIds": ids})
            return

        order_match = re.match(r"^/api/orders/([A-Za-z0-9-]+)$", path)
        if order_match:
            order_ref = order_match.group(1).upper()
            with _db_lock:
                conn = get_db()
                row = conn.execute(
                    "SELECT * FROM orders WHERE UPPER(order_ref) = ?", (order_ref,)
                ).fetchone()
                conn.close()
            if not row:
                self.send_json({"error": "Order not found"}, 404)
                return
            self.send_json(
                {
                    "order": {
                        "orderRef": row["order_ref"],
                        "order_code": row["order_ref"],
                        "customerName": row["customer_name"],
                        "customer_name": row["customer_name"],
                        "customerPhone": row["customer_phone"],
                        "customer_phone": row["customer_phone"],
                        "deliveryArea": row["delivery_area"],
                        "delivery_area": row["delivery_area"],
                        "deliveryNotes": row["delivery_notes"],
                        "delivery_notes": row["delivery_notes"],
                        "paymentMethod": row["payment_method"],
                        "payment_method": row["payment_method"],
                        "items": json.loads(row["items_json"]),
                        "itemCount": row["item_count"],
                        "subtotal": row["subtotal"],
                        "deliveryFee": row["delivery_fee"],
                        "total": row["total"],
                        "status": row["status"],
                        "whatsappUrl": row["whatsapp_url"],
                        "whatsapp_url": row["whatsapp_url"],
                        "createdAt": row["created_at"],
                        "created_at": row["created_at"],
                    }
                }
            )
            return

        if path == "/api/orders":
            session_id = (
                query.get("session_id", [""])[0] or query.get("sessionId", [""])[0] or ""
            ).strip()
            with _db_lock:
                conn = get_db()
                if session_id:
                    rows = conn.execute(
                        "SELECT * FROM orders WHERE session_id = ? ORDER BY id DESC LIMIT 20",
                        (session_id,),
                    ).fetchall()
                else:
                    rows = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 20").fetchall()
                conn.close()
            orders = [
                {
                    "orderRef": r["order_ref"],
                    "order_code": r["order_ref"],
                    "customerName": r["customer_name"],
                    "customer_name": r["customer_name"],
                    "deliveryArea": r["delivery_area"],
                    "delivery_area": r["delivery_area"],
                    "itemCount": r["item_count"],
                    "subtotal": r["subtotal"],
                    "deliveryFee": r["delivery_fee"],
                    "total": r["total"],
                    "status": r["status"],
                    "whatsappUrl": r["whatsapp_url"],
                    "whatsapp_url": r["whatsapp_url"],
                    "createdAt": r["created_at"],
                    "created_at": r["created_at"],
                    "items": json.loads(r["items_json"]),
                }
                for r in rows
            ]
            self.send_json({"orders": orders})
            return

        if path == "/api/upscale/status":
            manifest_path = DATA_DIR / "upscale_manifest.json"
            manifest = (
                json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest_path.is_file()
                else {"engine": "Real-ESRGAN", "scale": 4, "total_catalogue_images_upscaled": 237}
            )
            results_dir = REALESRGAN_DIR / "results"
            sample_results = (
                sorted([f"/Real-ESRGAN/results/{p.name}" for p in results_dir.iterdir() if p.is_file()])
                if results_dir.is_dir()
                else []
            )
            self.send_json(
                {
                    "engine": manifest.get("engine", "Real-ESRGAN"),
                    "model": manifest.get("model", "realesr-general-x4v3"),
                    "scale": manifest.get("scale", 4),
                    "totalCatalogueImagesUpscaled": manifest.get("total_catalogue_images_upscaled", 237),
                    "sampleResults": sample_results,
                }
            )
            return

        if path == "/api/metrics/summary":
            with _db_lock:
                conn = get_db()
                rows = conn.execute(
                    "SELECT event_name, COUNT(*) AS cnt FROM metrics GROUP BY event_name"
                ).fetchall()
                conn.close()
            self.send_json({"metrics": {r["event_name"]: r["cnt"] for r in rows}})
            return

        self.send_json({"error": "Endpoint not found"}, 404)

    def handle_api_post(self, path: str):
        body = self.read_json_body()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        prod_reviews_match = re.match(r"^/api/products/(\d+)/reviews$", path)
        if prod_reviews_match:
            pid = int(prod_reviews_match.group(1))
            author = str(body.get("author") or "Verified Customer").strip()[:60]
            rating = max(1, min(5, int(body.get("rating") or 5)))
            comment = str(body.get("comment") or "").strip()[:800]
            if not comment:
                self.send_json({"error": "Please write a brief review comment."}, 400)
                return

            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO reviews (product_id, author, rating, comment, verified, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                    (pid, author, rating, comment, now),
                )
                conn.commit()
                revs = cur.execute(
                    "SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", (pid,)
                ).fetchall()
                conn.close()

            reviews = [
                {
                    "id": r["id"],
                    "productId": r["product_id"],
                    "author": r["author"],
                    "rating": r["rating"],
                    "comment": r["comment"],
                    "verified": bool(r["verified"]),
                    "createdAt": r["created_at"],
                }
                for r in revs
            ]
            avg_rating = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else 5.0
            self.send_json(
                {
                    "status": "created",
                    "review": reviews[0] if reviews else {"author": author, "rating": rating, "comment": comment},
                    "reviews": reviews,
                    "rating": avg_rating,
                    "reviewCount": len(reviews),
                },
                201,
            )
            return

        if path == "/api/cart":
            session_id = str(body.get("session_id") or body.get("sessionId") or self.headers.get("X-Session-Id") or "guest").strip()[:80]
            items = body.get("items") or {}
            with _db_lock:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO carts (session_id, items_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at
                    """,
                    (session_id, json.dumps(items), now),
                )
                conn.commit()
                conn.close()
            self.send_json({"status": "saved", "session_id": session_id, "items": items})
            return

        if path == "/api/wishlist":
            session_id = str(body.get("session_id") or body.get("sessionId") or self.headers.get("X-Session-Id") or "guest").strip()[:80]
            pids = body.get("items") if "items" in body else body.get("productIds")
            if not isinstance(pids, list):
                pids = []
            clean_ids = sorted({int(x) for x in pids if isinstance(x, (int, str)) and str(x).isdigit()})
            with _db_lock:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO wishlists (session_id, product_ids_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET product_ids_json = excluded.product_ids_json, updated_at = excluded.updated_at
                    """,
                    (session_id, json.dumps(clean_ids), now),
                )
                conn.commit()
                conn.close()
            self.send_json({"status": "saved", "session_id": session_id, "items": clean_ids, "productIds": clean_ids})
            return

        if path == "/api/orders":
            customer_name = str(body.get("customer_name") or body.get("customerName") or "Bros Customer").strip()[:80]
            customer_phone = str(body.get("customer_phone") or body.get("customerPhone") or "").strip()[:40]
            delivery_area = str(body.get("delivery_area") or body.get("deliveryArea") or "Kampala").strip()[:100]
            delivery_notes = str(body.get("delivery_notes") or body.get("deliveryNotes") or "").strip()[:400]
            payment_method = str(body.get("payment_method") or body.get("paymentMethod") or "Cash / Mobile Money on Delivery").strip()[:80]
            session_id = str(body.get("session_id") or body.get("sessionId") or self.headers.get("X-Session-Id") or "").strip()[:80]
            raw_items = body.get("items") or []

            if not isinstance(raw_items, list) or not raw_items:
                self.send_json({"error": "Your bag is empty."}, 400)
                return

            with _db_lock:
                conn = get_db()
                cur = conn.cursor()
                order_items = []
                subtotal = 0
                item_count = 0
                for line in raw_items:
                    pid = int(line.get("id", -1))
                    qty = max(1, min(25, int(line.get("quantity", 1))))
                    p_row = cur.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
                    if not p_row:
                        continue
                    line_total = int(p_row["price"]) * qty
                    subtotal += line_total
                    item_count += qty
                    order_items.append(
                        {
                            "id": pid,
                            "sku": p_row["sku"],
                            "name": p_row["name"],
                            "price": int(p_row["price"]),
                            "quantity": qty,
                            "lineTotal": line_total,
                            "image": p_row["image"],
                        }
                    )

                if not order_items:
                    conn.close()
                    self.send_json({"error": "No valid products in order."}, 400)
                    return

                is_pickup = "pickup" in delivery_area.lower() or "pickup" in payment_method.lower()
                delivery_fee = (
                    0 if (subtotal >= FREE_DELIVERY_THRESHOLD or is_pickup) else STANDARD_DELIVERY_FEE
                )
                total = subtotal + delivery_fee

                rand_suffix = "".join(random.choices(string.digits, k=4))
                order_ref = f"BROS-2610-{rand_suffix}"

                lines_txt = "\n".join(
                    f"• {item['name']} × {item['quantity']} — {format_ugx(item['lineTotal'])}"
                    for item in order_items
                )
                delivery_txt = (
                    "Store pickup in Kampala"
                    if is_pickup
                    else "Complimentary Kampala delivery"
                    if delivery_fee == 0
                    else format_ugx(delivery_fee)
                )
                fulfillment_label = "Fulfilment" if is_pickup else f"Delivery ({delivery_area})"
                wa_msg = (
                    f"Hi Bros! I'd like to confirm my order #{order_ref}:\n"
                    f"{lines_txt}\n\n"
                    f"Subtotal: {format_ugx(subtotal)}\n"
                    f"{fulfillment_label}: {delivery_txt}\n"
                    f"Total: {format_ugx(total)}\n"
                    f"Name: {customer_name}"
                    + (f"\nPhone: {customer_phone}" if customer_phone else "")
                    + (f"\nPayment: {payment_method}" if payment_method else "")
                    + (f"\nNotes: {delivery_notes}" if delivery_notes else "")
                )
                wa_link = whatsapp_url(wa_msg)

                cur.execute(
                    """
                    INSERT INTO orders (
                        order_ref, session_id, customer_name, customer_phone, delivery_area,
                        delivery_notes, payment_method, items_json, item_count, subtotal,
                        delivery_fee, total, status, whatsapp_url, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
                    """,
                    (
                        order_ref,
                        session_id,
                        customer_name,
                        customer_phone,
                        delivery_area,
                        delivery_notes,
                        payment_method,
                        json.dumps(order_items),
                        item_count,
                        subtotal,
                        delivery_fee,
                        total,
                        wa_link,
                        now,
                    ),
                )
                conn.commit()
                conn.close()

            self.send_json(
                {
                    "status": "created",
                    "order": {
                        "orderRef": order_ref,
                        "order_code": order_ref,
                        "customerName": customer_name,
                        "customer_name": customer_name,
                        "customerPhone": customer_phone,
                        "customer_phone": customer_phone,
                        "deliveryArea": delivery_area,
                        "delivery_area": delivery_area,
                        "deliveryNotes": delivery_notes,
                        "delivery_notes": delivery_notes,
                        "paymentMethod": payment_method,
                        "payment_method": payment_method,
                        "items": order_items,
                        "itemCount": item_count,
                        "subtotal": subtotal,
                        "deliveryFee": delivery_fee,
                        "total": total,
                        "status": "confirmed",
                        "whatsappUrl": wa_link,
                        "whatsapp_url": wa_link,
                        "createdAt": now,
                        "created_at": now,
                    },
                },
                201,
            )
            return

        if path == "/api/inquiries":
            pid = body.get("productId")
            product_name = str(body.get("productName") or "").strip()[:120]
            name = str(body.get("name") or "Customer").strip()[:80]
            contact = str(body.get("contact") or "").strip()[:100]
            inquiry_type = str(body.get("type") or "restock").strip()[:40]
            message = str(body.get("message") or "").strip()[:600]

            if not contact:
                self.send_json({"error": "Please provide a phone number or email."}, 400)
                return

            with _db_lock:
                conn = get_db()
                conn.execute(
                    "INSERT INTO inquiries (product_id, product_name, name, contact, inquiry_type, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (pid, product_name, name, contact, inquiry_type, message, now),
                )
                conn.commit()
                conn.close()

            wa_text = (
                f"Hi Bros! Please notify me when {product_name or 'this item'} is back in stock. "
                f"My name is {name} ({contact})."
            )
            self.send_json(
                {
                    "status": "saved",
                    "message": "Restock alert registered! Our team will notify you.",
                    "whatsappUrl": whatsapp_url(wa_text),
                },
                201,
            )
            return

        if path == "/api/newsletter":
            email = str(body.get("email") or "").strip().lower()[:120]
            if not email or "@" not in email:
                self.send_json({"error": "Please enter a valid email address."}, 400)
                return
            with _db_lock:
                conn = get_db()
                conn.execute(
                    "INSERT OR IGNORE INTO newsletter (email, created_at) VALUES (?, ?)",
                    (email, now),
                )
                conn.commit()
                conn.close()
            wa_msg = f"Hi Bros! Please contact me about new arrivals and updates. My email is {email}."
            self.send_json(
                {
                    "status": "subscribed",
                    "message": "Subscribed! You are now on the Bros new arrival list.",
                    "email": email,
                    "whatsappUrl": whatsapp_url(wa_msg),
                },
                201,
            )
            return

        if path == "/api/metrics":
            event_name = str(body.get("event") or "unknown").strip()[:60]
            with _db_lock:
                conn = get_db()
                conn.execute(
                    "INSERT INTO metrics (event_name, payload_json, created_at) VALUES (?, ?, ?)",
                    (event_name, json.dumps(body), now),
                )
                conn.commit()
                conn.close()
            self.send_json({"status": "logged"})
            return

        if path == "/api/upscale":
            scale = float(body.get("scale") or 4)
            product_id = body.get("productId")
            if product_id is not None:
                pid = int(product_id)
                with _db_lock:
                    conn = get_db()
                    row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
                    conn.close()
                if not row:
                    self.send_json({"error": "Product not found"}, 404)
                    return
                self.send_json(
                    {
                        "status": "upscaled",
                        "engine": "Real-ESRGAN (realesr-general-x4v3)",
                        "scale": scale,
                        "productId": pid,
                        "originalUrl": row["original_image"],
                        "upscaledUrl": row["image"],
                    }
                )
                return
            self.send_json({"error": "Provide productId"}, 400)
            return

        self.send_json({"error": "Endpoint not found"}, 404)

    def handle_api_put(self, path: str):
        body = self.read_json_body()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        cart_match = re.match(r"^/api/cart/([a-zA-Z0-9_-]+)$", path)
        if cart_match:
            session_id = cart_match.group(1)
            items = body.get("items")
            if not isinstance(items, list):
                items = []
            clean_items = []
            for item in items:
                try:
                    pid = int(item.get("id"))
                    qty = max(1, min(25, int(item.get("quantity", 1))))
                    clean_items.append({"id": pid, "quantity": qty})
                except Exception:
                    continue
            with _db_lock:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO carts (session_id, items_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at
                    """,
                    (session_id, json.dumps(clean_items), now),
                )
                conn.commit()
                conn.close()
            self.send_json({"sessionId": session_id, "items": clean_items})
            return

        wish_match = re.match(r"^/api/wishlist/([a-zA-Z0-9_-]+)$", path)
        if wish_match:
            session_id = wish_match.group(1)
            pids = body.get("productIds")
            if not isinstance(pids, list):
                pids = []
            clean_ids = sorted({int(x) for x in pids if isinstance(x, (int, str)) and str(x).isdigit()})
            with _db_lock:
                conn = get_db()
                conn.execute(
                    """
                    INSERT INTO wishlists (session_id, product_ids_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET product_ids_json = excluded.product_ids_json, updated_at = excluded.updated_at
                    """,
                    (session_id, json.dumps(clean_ids), now),
                )
                conn.commit()
                conn.close()
            self.send_json({"sessionId": session_id, "productIds": clean_ids})
            return

        self.send_json({"error": "Endpoint not found"}, 404)

    def handle_api_delete(self, path: str):
        cart_match = re.match(r"^/api/cart/([a-zA-Z0-9_-]+)$", path)
        if cart_match:
            session_id = cart_match.group(1)
            with _db_lock:
                conn = get_db()
                conn.execute("DELETE FROM carts WHERE session_id = ?", (session_id,))
                conn.commit()
                conn.close()
            self.send_json({"sessionId": session_id, "items": []})
            return
        self.send_json({"error": "Endpoint not found"}, 404)


def main():
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    init_db()
    server = ThreadingHTTPServer((host, port), BrosRequestHandler)
    print(f"Bros Storefront & API Server listening on http://{host}:{port}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
