import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer

import server as bros_server


class StorefrontApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cache_dir = Path(cls.temp_dir.name)
        bros_server.CACHE_DIR = cache_dir
        bros_server.DB_PATH = cache_dir / "test.db"
        bros_server.init_db()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), bros_server.BrosRequestHandler)
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_port}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        cls.temp_dir.cleanup()

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "X-Session-Id": "test-session"},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_health_and_catalogue_filters(self):
        status, health = self.request("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["productsCount"], 237)

        status, result = self.request("/api/products?q=tugboat&limit=2")
        self.assertEqual(status, 200)
        self.assertGreater(result["total"], 0)
        self.assertLessEqual(len(result["products"]), 2)

    def test_bad_pagination_values_do_not_drop_connection(self):
        status, result = self.request("/api/products?page=invalid&limit=invalid")
        self.assertEqual(status, 200)
        self.assertEqual(result["page"], 1)
        self.assertEqual(len(result["products"]), 237)

    def test_review_validation(self):
        status, result = self.request(
            "/api/products/0/reviews",
            "POST",
            {"author": "Test shopper", "rating": "invalid", "comment": "Test"},
        )
        self.assertEqual(status, 400)
        self.assertIn("Rating", result["error"])

        status, result = self.request(
            "/api/products/9999/reviews",
            "POST",
            {"author": "Test shopper", "rating": 5, "comment": "Test"},
        )
        self.assertEqual(status, 404)
        self.assertEqual(result["error"], "Product not found")

        status, result = self.request(
            "/api/products/0/reviews",
            "POST",
            {"author": "Test shopper", "rating": 4, "comment": "Works well."},
        )
        self.assertEqual(status, 201)
        self.assertFalse(result["review"]["verified"])

    def test_cart_and_order_round_trip(self):
        status, _ = self.request(
            "/api/cart",
            "POST",
            {"session_id": "test-session", "items": [{"id": 0, "quantity": 2}]},
        )
        self.assertEqual(status, 200)
        status, cart = self.request("/api/cart?session_id=test-session")
        self.assertEqual(status, 200)
        self.assertEqual(cart["items"], {"0": 2})

        status, result = self.request(
            "/api/orders",
            "POST",
            {
                "session_id": "test-session",
                "customer_name": "Test Shopper",
                "customer_phone": "+256700000000",
                "delivery_area": "Kampala",
                "items": [{"id": 0, "quantity": 1}],
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(result["order"]["subtotal"], 110000)
        self.assertEqual(result["order"]["deliveryFee"], 10000)
        self.assertEqual(result["order"]["total"], 120000)

    def test_upscale_rejects_invalid_numbers(self):
        status, result = self.request(
            "/api/upscale", "POST", {"productId": "invalid", "scale": "invalid"}
        )
        self.assertEqual(status, 400)
        self.assertIn("Scale", result["error"])

        status, result = self.request(
            "/api/upscale", "POST", {"productId": 0, "scale": "NaN"}
        )
        self.assertEqual(status, 400)
        self.assertIn("between 1 and 8", result["error"])


if __name__ == "__main__":
    unittest.main()
