"""360 사진·문 앞 사진 속 사람 얼굴 흐리게 (공개 전 개인정보 보호).

360(등장방형)은 위·아래가 늘어나 얼굴 인식이 잘 안 되므로, 여러 방향의 일반 시야(90°)로 잘라
macOS Vision(scripts/faces.swift)으로 얼굴·상체를 찾고 → 그 영역을 360 원본 좌표로 되돌려 흐리게 한다.
원본은 raw/<폴더>-original/ 에 한 번만 보관하고, 항상 원본에서 다시 만든다(여러 번 돌려도 같음).

사용: python3 scripts/blur-faces.py public/pano [public/door ...]   (썸네일은 public/thumb 다시 생성)
"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIEW = 1024
# (yaw, pitch) — 수평 8방향 + 아래쪽 4방향 + 바로 아래(촬영자)
VIEWS = [(y, 0) for y in range(0, 360, 45)] + [(y, -50) for y in (0, 90, 180, 270)] + [(0, -85)]


def rot(yaw, pitch):
    y, p = np.radians(yaw), np.radians(pitch)
    ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    rx = np.array([[1, 0, 0], [0, np.cos(p), np.sin(p)], [0, -np.sin(p), np.cos(p)]])
    return ry @ rx


def view_dirs(yaw, pitch, xs, ys):
    """시야 이미지 좌표(0~1, 왼쪽 위 기준) → 360 방향 (lon, lat)"""
    f = 0.5 / np.tan(np.radians(45))
    d = np.stack([xs - 0.5, -(ys - 0.5), np.full_like(xs, f)], -1)  # x 오른쪽, y 위, z 앞
    d = d @ rot(yaw, pitch).T
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    return np.arctan2(d[..., 0], d[..., 2]), np.arcsin(np.clip(d[..., 1], -1, 1))


def render_view(eq, yaw, pitch):
    h, w, _ = eq.shape
    g = (np.arange(VIEW) + 0.5) / VIEW
    xs, ys = np.meshgrid(g, g)
    lon, lat = view_dirs(yaw, pitch, xs, ys)
    u = ((lon / (2 * np.pi) + 0.5) * w).astype(int) % w
    v = np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1)
    return eq[v, u]


def detect(paths):
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as f:
        f.write('\n'.join(paths)); lst = f.name
    # FACES_BIN: swiftc로 미리 컴파일한 faces (매번 컴파일하는 swift 실행보다 훨씬 빠름)
    cmd = [os.environ['FACES_BIN']] if os.environ.get('FACES_BIN') else ['swift', os.path.join(ROOT, 'scripts/faces.swift')]
    out = subprocess.run(cmd + [lst], capture_output=True, text=True, check=True).stdout
    res = {}
    for line in out.splitlines():
        p, _, boxes = line.partition('\t')
        res[p] = []
        for b in filter(None, boxes.split(';')):
            kind, nums = b.split(':')
            x, y, bw, bh = map(float, nums.split(','))
            if kind == 'h':  # 상체 → 위쪽 35%가 머리
                y, bh = y + bh * 0.65, bh * 0.35
            # Vision은 왼쪽 아래 기준 → 왼쪽 위 기준, 30% 넉넉하게
            cx, cy = x + bw / 2, 1 - (y + bh / 2)
            res[p].append((cx, cy, bw * 1.3, bh * 1.3))
    os.unlink(lst)
    return res


def blur_regions(im, mask):
    """mask(0~255)인 곳만 강하게 흐림"""
    radius = max(8, im.width // 160)
    blurred = im.filter(ImageFilter.GaussianBlur(radius))
    soft = mask.filter(ImageFilter.GaussianBlur(radius // 2))
    return Image.composite(blurred, im, soft)


def process_pano(src, dst, tmp):
    eq_img = Image.open(src).convert('RGB')
    eq = np.asarray(eq_img)
    h, w, _ = eq.shape
    paths = []
    for k, (yaw, pitch) in enumerate(VIEWS):
        p = os.path.join(tmp, f'v{k}.jpg')
        Image.fromarray(render_view(eq, yaw, pitch)).save(p, quality=90)
        paths.append(p)
    found = detect(paths)
    mask = Image.new('L', (w, h), 0)
    mpx = np.zeros((h, w), np.uint8)
    n = 0
    for k, (yaw, pitch) in enumerate(VIEWS):
        for cx, cy, bw, bh in found.get(paths[k], []):
            n += 1
            g = np.linspace(-0.5, 0.5, 40)
            xs, ys = np.meshgrid(cx + g * bw, cy + g * bh)
            lon, lat = view_dirs(yaw, pitch, xs, ys)
            u = ((lon / (2 * np.pi) + 0.5) * w).astype(int) % w
            v = np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1)
            # 점들 사이 빈틈 메우기 — 점마다 작은 사각형
            r = max(2, int(max(bw, bh) * w / 4 / 40) + 2)
            for uu, vv in zip(u.ravel(), v.ravel()):
                mpx[max(0, vv - r):vv + r, max(0, uu - r):uu + r] = 255
    if n:
        mask = Image.fromarray(mpx)
        eq_img = blur_regions(eq_img, mask)
    eq_img.save(dst, quality=74)
    return n


def process_flat(src, dst, tmp):
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    found = detect([src]).get(src, [])
    if found:
        mask = Image.new('L', im.size, 0)
        m = np.zeros((im.height, im.width), np.uint8)
        for cx, cy, bw, bh in found:
            x0, x1 = int((cx - bw / 2) * im.width), int((cx + bw / 2) * im.width)
            y0, y1 = int((cy - bh / 2) * im.height), int((cy + bh / 2) * im.height)
            m[max(0, y0):y1, max(0, x0):x1] = 255
        im = blur_regions(im, Image.fromarray(m))
    im.save(dst, quality=78)
    return len(found)


def main(dirs):
    log = {}
    for d in dirs:
        d = os.path.abspath(d)
        orig = os.path.join(ROOT, 'raw', os.path.basename(d) + '-original')
        if not os.path.isdir(orig):
            shutil.copytree(d, orig)  # 처음 한 번만 원본 보관
        is_pano = os.path.basename(d).startswith('pano')
        with tempfile.TemporaryDirectory() as tmp:
            for f in sorted(os.listdir(orig)):
                if not f.endswith('.jpg'): continue
                src, dst = os.path.join(orig, f), os.path.join(d, f)
                n = process_pano(src, dst, tmp) if is_pano else process_flat(src, dst, tmp)
                log[f] = n
                if is_pano:
                    if os.path.basename(d) == 'pano': Image.open(dst).resize((512, 256)).save(os.path.join(ROOT, 'public/thumb', f), quality=70)
                print(f, n, flush=True)
    json.dump(log, open(os.path.join(ROOT, 'raw', 'blur-log.json'), 'w'), indent=1)
    print('얼굴 있는 사진', sum(1 for v in log.values() if v), '/', len(log))


if __name__ == '__main__':
    main(sys.argv[1:])
