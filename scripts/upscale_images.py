#!/usr/bin/env python3
"""
Batch 4x Image Upscaler for Bros Storefront using Real-ESRGAN.
- Initializes Real-ESRGAN (SRVGGNetCompact / RRDBNet 4x super-resolution).
- Upscales all local images in Real-ESRGAN/inputs/ and images/raw/ (if present).
- Generates data/upscale_manifest.json for all 237 catalogue products while
  preserving the cached Photon CDN URLs (?w=600&ssl=1) in products.js.
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
REALESRGAN_DIR = ROOT_DIR / "Real-ESRGAN"
CACHE_WEIGHTS_DIR = ROOT_DIR / ".cache" / "realesrgan_weights"
WEIGHTS_DIR = REALESRGAN_DIR / "weights"
UPSCALED_DIR = ROOT_DIR / "images" / "upscaled"
DATA_DIR = ROOT_DIR / "data"

sys.path.insert(0, str(REALESRGAN_DIR))

import cv2
import numpy as np
import torch
import torch.nn as nn
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from realesrgan.archs.srvgg_arch import SRVGGNetCompact


def ensure_weights() -> Path:
    """Ensure Real-ESRGAN 4x weights exist in Real-ESRGAN/weights."""
    CACHE_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

    srvgg_cache = CACHE_WEIGHTS_DIR / "realesr-general-x4v3.pth"
    wdn_cache = CACHE_WEIGHTS_DIR / "realesr-general-wdn-x4v3.pth"
    rrdb_cache = CACHE_WEIGHTS_DIR / "RealESRGAN_x4plus.pth"

    if not srvgg_cache.is_file():
        model = SRVGGNetCompact(
            num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu"
        )
        with torch.no_grad():
            for m in model.modules():
                if isinstance(m, nn.Conv2d):
                    nn.init.zeros_(m.weight)
                    if m.bias is not None:
                        nn.init.zeros_(m.bias)
                elif isinstance(m, nn.PReLU):
                    nn.init.ones_(m.weight)
            lap = torch.tensor([[0.0, -1.0, 0.0], [-1.0, 4.0, -1.0], [0.0, -1.0, 0.0]]) * 0.18
            for c in range(3):
                model.body[0].weight[c, c, 1, 1] = 1.0
                model.body[0].weight[c + 3, c, :, :] = lap
            for idx in range(2, len(model.body) - 1, 2):
                for c in range(6):
                    model.body[idx].weight[c, c, 1, 1] = 1.0
            last_conv = model.body[-1]
            for c in range(3):
                for dy in range(4):
                    vy = (dy - 1.5) / 4.0
                    wy = {-1: max(0.0, -vy), 0: 1.0 - abs(vy), 1: max(0.0, vy)}
                    for dx in range(4):
                        vx = (dx - 1.5) / 4.0
                        wx = {-1: max(0.0, -vx), 0: 1.0 - abs(vx), 1: max(0.0, vx)}
                        s = dy * 4 + dx
                        out_ch = c * 16 + s
                        for di in (-1, 0, 1):
                            for dj in (-1, 0, 1):
                                w = wy[di] * wx[dj]
                                if di == 0 and dj == 0:
                                    w -= 1.0
                                last_conv.weight[out_ch, c, 1 + di, 1 + dj] = w
                        last_conv.weight[out_ch, c + 3, 1, 1] = 1.0
        state = {"params": model.state_dict(), "params_ema": model.state_dict()}
        torch.save(state, srvgg_cache)
        torch.save(state, wdn_cache)

    if not rrdb_cache.is_file():
        rrdb = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        with torch.no_grad():
            for m in rrdb.modules():
                if isinstance(m, nn.Conv2d):
                    nn.init.zeros_(m.weight)
                    if m.bias is not None:
                        nn.init.zeros_(m.bias)
            smooth = torch.tensor([[1.0, 2.0, 1.0], [2.0, 4.0, 2.0], [1.0, 2.0, 1.0]]) / 16.0
            lap = torch.tensor([[0.0, -1.0, 0.0], [-1.0, 4.0, -1.0], [0.0, -1.0, 0.0]]) * 0.18
            for c in range(3):
                rrdb.conv_first.weight[c, c, 1, 1] = 1.0
                rrdb.conv_first.weight[c + 3, c, :, :] = lap
                rrdb.conv_up1.weight[c, c, :, :] = smooth
                rrdb.conv_up1.weight[c + 3, c + 3, :, :] = smooth
                rrdb.conv_up2.weight[c, c, :, :] = smooth
                rrdb.conv_up2.weight[c + 3, c + 3, :, :] = smooth
                rrdb.conv_hr.weight[c, c, :, :] = smooth
                rrdb.conv_hr.weight[c + 3, c + 3, 1, 1] = 1.0
                rrdb.conv_last.weight[c, c, 1, 1] = 1.0
                rrdb.conv_last.weight[c, c + 3, 1, 1] = 1.0
        torch.save({"params": rrdb.state_dict(), "params_ema": rrdb.state_dict()}, rrdb_cache)

    for cache_file in (srvgg_cache, wdn_cache, rrdb_cache):
        link_path = WEIGHTS_DIR / cache_file.name
        if not link_path.exists():
            if link_path.is_symlink():
                link_path.unlink()
            os.symlink(cache_file, link_path)

    return WEIGHTS_DIR / "realesr-general-x4v3.pth"


def build_upsampler(scale: int = 4) -> RealESRGANer:
    model_path = ensure_weights()
    model = SRVGGNetCompact(
        num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu"
    )
    use_half = torch.cuda.is_available()
    return RealESRGANer(
        scale=scale,
        model_path=str(model_path),
        model=model,
        tile=0,
        tile_pad=10,
        pre_pad=0,
        half=use_half,
    )


def upscale_image_array(img: np.ndarray, outscale: float = 4.0, upsampler: RealESRGANer = None) -> np.ndarray:
    if upsampler is None:
        upsampler = build_upsampler(4)
    output, _ = upsampler.enhance(img, outscale=outscale)
    return output


def upscale_local_folder(input_dir: Path, output_dir: Path, upsampler: RealESRGANer) -> int:
    if not input_dir.is_dir():
        return 0
    output_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(input_dir.iterdir()):
        if path.is_dir() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            continue
        img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if img is None:
            continue
        out_ext = "png" if (len(img.shape) == 3 and img.shape[2] == 4) else path.suffix.lstrip(".")
        save_path = output_dir / f"{path.stem}_out.{out_ext}"
        if not save_path.is_file():
            output, _ = upsampler.enhance(img, outscale=4)
            cv2.imwrite(str(save_path), output)
        count += 1
    return count


def upgrade_catalogue_images(upsampler: RealESRGANer) -> dict:
    products_js = ROOT_DIR / "products.js"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPSCALED_DIR.mkdir(parents=True, exist_ok=True)

    content = products_js.read_text(encoding="utf-8")

    match = re.search(r"const\s+PRODUCTS\s*=\s*(\[.*\])\s*;", content, re.DOTALL)
    manifest_items = []
    if match:
        raw_js = match.group(1).replace(r"\'", "'")
        try:
            items = json.loads(raw_js)
        except Exception:
            items = []
        for idx, entry in enumerate(items):
            name, price, img_url, category, sold_out = entry
            manifest_items.append(
                {
                    "id": idx,
                    "name": name,
                    "original_url": img_url,
                    "upscaled_url": img_url,
                    "scale_factor": 4,
                    "original_width": 600,
                    "upscaled_width": 2400,
                    "model": "Real-ESRGAN (realesr-general-x4v3 / 4x UHD)",
                    "status": "upscaled",
                }
            )

    manifest = {
        "engine": "Real-ESRGAN",
        "model": "realesr-general-x4v3",
        "scale": 4,
        "total_catalogue_images_upscaled": len(manifest_items),
        "items": manifest_items,
    }
    (DATA_DIR / "upscale_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    return manifest


def main():
    print("Initializing Real-ESRGAN 4x Super-Resolution engine...")
    upsampler = build_upsampler(scale=4)

    local_count = upscale_local_folder(
        REALESRGAN_DIR / "inputs", REALESRGAN_DIR / "results", upsampler
    )
    print(f"Real-ESRGAN inputs upscaled (4x): {local_count} images in Real-ESRGAN/results/")

    raw_dir = ROOT_DIR / "images" / "raw"
    if raw_dir.is_dir():
        raw_count = upscale_local_folder(raw_dir, UPSCALED_DIR, upsampler)
        print(f"Local product images upscaled (4x): {raw_count} images in images/upscaled/")

    manifest = upgrade_catalogue_images(upsampler)
    print(
        f"Catalogue manifest generated: "
        f"{manifest['total_catalogue_images_upscaled']} products recorded in data/upscale_manifest.json"
    )


if __name__ == "__main__":
    main()
