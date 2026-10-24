"""360 사진 얼굴 블러 (꼼꼼하게) — 이미 만든 360 JPG를 제자리에서 한 번 더 흐리게.

blur-faces.py(90° 시야)는 사진 해상도의 절반으로 찾아서 멀리 있는 작은 사람·안내데스크 직원 등을 놓쳤다.
여기서는 45° 좁은 시야 36방향(원본 해상도와 비슷)으로 얼굴과 '사람 전체'를 찾고, 사람이면 위쪽 30%(머리)를 흐린다.
뒤통수·옆모습도 흐려지지만 놓치는 것보다 낫다. export-hq.py 결과물에 2026-10-20 실제로 적용함.

사용: python3 scripts/blur-strict.py <360 jpg 폴더> [나눔 k/n — 여러 개 동시에]
"""
import importlib.util, os, subprocess, sys, json, tempfile
import numpy as np
from PIL import ImageFile; ImageFile.LOAD_TRUNCATED_IMAGES = True
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('b', os.path.join(HERE, 'blur-faces.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
FOV = 45; VIEW = 1024
TILES = [(y, p) for p in (-30, -8, 14) for y in range(0, 360, 30)]
def dirs(yaw, pitch, xs, ys):
    f = 0.5 / np.tan(np.radians(FOV / 2))
    d = np.stack([xs - 0.5, -(ys - 0.5), np.full_like(xs, f)], -1) @ b.rot(yaw, pitch).T
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    return np.arctan2(d[..., 0], d[..., 2]), np.arcsin(np.clip(d[..., 1], -1, 1))
def render(eq, yaw, pitch):
    h, w, _ = eq.shape; g = (np.arange(VIEW) + 0.5) / VIEW; xs, ys = np.meshgrid(g, g)
    lon, lat = dirs(yaw, pitch, xs, ys)
    return eq[np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1), ((lon / (2 * np.pi) + 0.5) * w).astype(int) % w]
d = sys.argv[1]; k, n = map(int, (sys.argv[2] if len(sys.argv) > 2 else '0/1').split('/'))
files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))[k::n]
log = {}
with tempfile.TemporaryDirectory() as tmp:
    BIN = os.path.join(tmp, 'faces-strict')
    subprocess.run(['swiftc', '-O', os.path.join(HERE, 'faces-strict.swift'), '-o', BIN], check=True)
    for f in files:
        p0 = os.path.join(d, f); img = Image.open(p0).convert('RGB'); eq = np.asarray(img); h, w, _ = eq.shape
        paths = []
        for i, (yaw, pitch) in enumerate(TILES):
            p = os.path.join(tmp, f'{i}.jpg'); Image.fromarray(render(eq, yaw, pitch)).save(p, quality=92); paths.append(p)
        open(os.path.join(tmp, 'l.txt'), 'w').write('\n'.join(paths))
        out = subprocess.run([BIN, os.path.join(tmp, 'l.txt')], capture_output=True, text=True).stdout
        mpx = np.zeros((h, w), np.uint8); cnt = 0
        for line in out.splitlines():
            p, _, bx = line.partition('\t')
            if not bx: continue
            yaw, pitch = TILES[paths.index(p)]
            for box in bx.split(';'):
                kind, nums = box.split(':'); x, y, bw, bh = map(float, nums.split(','))
                if kind == 'h': y, bh = y + bh * 0.7, bh * 0.32
                cx, cy = x + bw / 2, 1 - (y + bh / 2); bw, bh = bw * 1.5, bh * 1.5
                cnt += 1
                g = np.linspace(-0.5, 0.5, 30)
                xs, ys = np.meshgrid(cx + g * bw, cy + g * bh)
                lon, lat = dirs(yaw, pitch, xs, ys)
                u = ((lon / (2 * np.pi) + 0.5) * w).astype(int) % w
                v = np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1)
                r = max(3, int(max(bw, bh) * w * FOV / 360 / 30) + 2)
                for uu, vv in zip(u.ravel(), v.ravel()):
                    mpx[max(0, vv - r):vv + r, max(0, uu - r):uu + r] = 255
        if cnt:
            b.blur_regions(img, Image.fromarray(mpx)).save(p0, quality=95, subsampling=0)
        log[f] = cnt; print(f, cnt, flush=True)
json.dump(log, open(os.path.join(d, f'_블러2차_기록_{k}.json'), 'w'), ensure_ascii=False, indent=1)
