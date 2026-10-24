"""Insta360 X4 원본(.insp, 양쪽 어안 2장) → 360 등장방형(equirectangular) JPG.

Insta360 Studio 없이 쓰려고 만든 간이 스티칭. 파일 끝(트레일러)에 들어 있는 렌즈 보정값
(통합 카메라 모델: xi·초점거리·중심·왜곡 k1 k2 k3 p1 p2)을 읽어 그대로 투영한다.
두 렌즈 경계는 좁게 섞어서 이음선을 줄인다 (가까운 물체는 시차 때문에 살짝 어긋날 수 있음).

사용: python3 scripts/stitch-insp.py <입력 .insp 또는 폴더> <출력 폴더> [폭=4096]
"""
import os, re, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SENSOR_H = 6000  # 보정값 좌표계: 16000×6000 (렌즈당 8000폭), 저장 이미지는 렌즈당 6000×6000 가운데를 잘라 축소


def lens_params(raw: bytes):
    """'2_xi_fx_fy_cx_cy_r_p_y_tx_ty_tz_k1_k2_k3_p1_p2_16000_6000_71_…' (5계수 버전)"""
    for m in re.finditer(rb'2_(1\.\d+)_([\d._\-]+)', raw):
        v = (m.group(1) + b'_' + m.group(2)).decode().split('_')
        nums = [float(x) for x in v if re.fullmatch(r'-?\d+(\.\d+)?', x)]
        # xi fx fy cx cy · 회전3 · 이동3 · 왜곡5 · 16000 6000 71 = 렌즈당 19개
        if len(nums) >= 38 and nums[17] == 6000 and nums[19 + 17] == 6000:
            return [nums[:16], nums[19:35]]
    raise ValueError('렌즈 보정값을 찾지 못했어요')


def project(p, x, y, z, crop_x, scale):
    xi, fx, fy, cx, cy = p[:5]
    k1, k2, k3, p1, p2 = p[11:16]
    d = z + xi
    mx, my = x / d, y / d
    r2 = mx * mx + my * my
    rad = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2
    mxd = mx * rad + 2 * p1 * mx * my + p2 * (r2 + 2 * mx * mx)
    myd = my * rad + p1 * (r2 + 2 * my * my) + 2 * p2 * mx * my
    return (fx * mxd + cx - crop_x) * scale, (fy * myd + cy) * scale


def bilinear(img, u, v):
    h, w, _ = img.shape
    u = np.clip(u, 0, w - 1.001); v = np.clip(v, 0, h - 1.001)
    x0 = u.astype(np.int32); y0 = v.astype(np.int32)
    fx = (u - x0)[..., None]; fy = (v - y0)[..., None]
    a, b, c, d = (img[y, x].astype(np.float32) for y, x in ((y0, x0), (y0, x0 + 1), (y0 + 1, x0), (y0 + 1, x0 + 1)))
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def stitch(path, out_path, width=4096):
    raw = open(path, 'rb').read()
    front, back = lens_params(raw[-6_000_000:])
    im = np.asarray(Image.open(path).convert('RGB'))  # uint8 그대로 — 메모리 절약
    half = im.shape[1] // 2
    scale = im.shape[0] / SENSOR_H
    L, R = im[:, :half], im[:, half:]
    # 렌즈 중심 cx를 6000폭 crop의 중앙(3000)으로 보고 잘린 시작점 계산 → 렌즈1 ≈1000, 렌즈2 ≈9000
    cx0 = round((front[3] - SENSOR_H / 2) / 1000) * 1000
    cx1 = round((back[3] - SENSOR_H / 2) / 1000) * 1000

    H = width // 2
    lon1 = ((np.arange(width) + 0.5) / width * 2 * np.pi - np.pi).astype(np.float32)
    out = np.empty((H, width, 3), np.uint8)
    for r0 in range(0, H, 128):  # 128줄씩 나눠 계산
        lat1 = (np.pi / 2 - (np.arange(r0, min(r0 + 128, H)) + 0.5) / H * np.pi).astype(np.float32)
        lon, lat = np.meshgrid(lon1, lat1)
        vx = np.cos(lat) * np.sin(lon); vy = -np.sin(lat); vz = np.cos(lat) * np.cos(lon)
        # 앞 렌즈: 카메라가 보는 방향 +z, 뒤 렌즈: -z (좌우 반전)
        u0, v0 = project(front, vx, vy, vz, cx0, scale)
        u1, v1 = project(back, -vx, vy, -vz, cx1, scale)
        blend = np.clip((vz + 0.06) / 0.12, 0, 1)[..., None]  # z=0 근처 ±약3.5°만 섞기
        band = bilinear(L, u0, v0) * blend + bilinear(R, u1, v1) * (1 - blend)
        out[r0:r0 + len(lat1)] = np.clip(band, 0, 255).astype(np.uint8)
    # 정면(yaw 0)이 앞 렌즈 가운데에 오게 — 뷰어 기본 방향과 맞춤
    Image.fromarray(out).save(out_path, quality=88)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 4096
    os.makedirs(dst, exist_ok=True)
    files = sorted(os.listdir(src)) if os.path.isdir(src) else [os.path.basename(src)]
    base = src if os.path.isdir(src) else os.path.dirname(src)
    for f in files:
        if not f.lower().endswith('.insp'): continue
        o = os.path.join(dst, os.path.splitext(f)[0] + '.jpg')
        if os.path.exists(o): continue
        stitch(os.path.join(base, f), o, width)
        print('ok', f)
