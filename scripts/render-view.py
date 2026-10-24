"""360 사진 → 휴대폰 화면 비율의 일반 시야 이미지 (피그마 화면 배경·건물 대표 사진용).

사용: python3 scripts/render-view.py <360 jpg> <출력 jpg> [yaw=0] [pitch=0] [가로=780] [세로=1688] [가로시야=75]
"""
import sys
import numpy as np
from PIL import Image


def render(src, dst, yaw=0.0, pitch=0.0, w=780, h=1688, hfov=75.0):
    eq = np.asarray(Image.open(src).convert('RGB'))
    H, W, _ = eq.shape
    f = (w / 2) / np.tan(np.radians(hfov) / 2)
    xs, ys = np.meshgrid(np.arange(w) - w / 2 + 0.5, np.arange(h) - h / 2 + 0.5)
    d = np.stack([xs, -ys, np.full_like(xs, f)], -1)
    y, p = np.radians(yaw), np.radians(pitch)
    ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    rx = np.array([[1, 0, 0], [0, np.cos(p), np.sin(p)], [0, -np.sin(p), np.cos(p)]])
    d = d @ (ry @ rx).T
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    lon, lat = np.arctan2(d[..., 0], d[..., 2]), np.arcsin(np.clip(d[..., 1], -1, 1))
    u = ((lon / (2 * np.pi) + 0.5) * W).astype(int) % W
    v = np.clip(((0.5 - lat / np.pi) * H).astype(int), 0, H - 1)
    Image.fromarray(eq[v, u]).save(dst, quality=85)


if __name__ == '__main__':
    a = sys.argv
    render(a[1], a[2], *(float(x) for x in a[3:5]), *(int(x) for x in a[5:7]), *(float(x) for x in a[7:8]))
