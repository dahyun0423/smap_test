"""공유용 고화질 360 JPG — .insp 원본 → 8K 스티칭 → 얼굴만 흐리게 → 고화질 저장.

앱용(public/pano, 4K·압축)과 따로, 팀·드라이브 공유용 결과물을 만든다.
stitch-insp.py · blur-faces.py 의 함수를 그대로 쓴다. 이미 만든 파일은 건너뛴다(이어서 돌리기 가능).

사용: python3 scripts/export-hq.py <.insp 폴더> <출력 폴더> [폭=7680] [나눔 k/n — 여러 개 동시에 돌릴 때]
"""
import importlib.util, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(HERE, name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


stitcher, blur = load('stitch-insp'), load('blur-faces')


def blur_pano(src, dst, tmp):
    """blur-faces.process_pano 와 같은 방식, 저장 화질만 높게"""
    eq_img = Image.open(src).convert('RGB')
    eq = np.asarray(eq_img)
    h, w, _ = eq.shape
    paths = []
    for k, (yaw, pitch) in enumerate(blur.VIEWS):
        p = os.path.join(tmp, f'v{k}.jpg')
        Image.fromarray(blur.render_view(eq, yaw, pitch)).save(p, quality=90)
        paths.append(p)
    found = blur.detect(paths)
    mpx = np.zeros((h, w), np.uint8)
    n = 0
    for k, (yaw, pitch) in enumerate(blur.VIEWS):
        for cx, cy, bw, bh in found.get(paths[k], []):
            n += 1
            g = np.linspace(-0.5, 0.5, 40)
            xs, ys = np.meshgrid(cx + g * bw, cy + g * bh)
            lon, lat = blur.view_dirs(yaw, pitch, xs, ys)
            u = ((lon / (2 * np.pi) + 0.5) * w).astype(int) % w
            v = np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1)
            r = max(2, int(max(bw, bh) * w / 4 / 40) + 2)
            for uu, vv in zip(u.ravel(), v.ravel()):
                mpx[max(0, vv - r):vv + r, max(0, uu - r):uu + r] = 255
    if n:
        eq_img = blur.blur_regions(eq_img, Image.fromarray(mpx))
    eq_img.save(dst, quality=95, subsampling=0)
    return n


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 7680
    os.makedirs(dst, exist_ok=True)
    k, n = map(int, (sys.argv[4] if len(sys.argv) > 4 else '0/1').split('/'))
    log_path = os.path.join(dst, f'_얼굴블러_기록_{k}.json' if n > 1 else '_얼굴블러_기록.json')
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.insp'))[k::n]
    with tempfile.TemporaryDirectory() as tmp:
        if not os.environ.get('FACES_BIN') or not os.path.exists(os.environ['FACES_BIN']):
            os.environ['FACES_BIN'] = os.path.join(tmp, 'faces')
            subprocess.run(['swiftc', '-O', os.path.join(HERE, 'faces.swift'), '-o', os.environ['FACES_BIN']], check=True)
        for i, f in enumerate(files, 1):
            out = os.path.join(dst, f[:-5] + '.jpg')
            if os.path.exists(out): continue
            raw = os.path.join(tmp, 'stitched.jpg')
            try:
                stitcher.stitch(os.path.join(src, f), raw, width)
                log[f] = blur_pano(raw, out, tmp)
            except Exception as e:  # 손상·다른 기종 파일은 건너뛰고 기록
                log[f] = f'실패: {e}'
            print(f'{i}/{len(files)}', f, log[f], flush=True)
            json.dump(log, open(log_path, 'w'), ensure_ascii=False, indent=1)
    faces = sum(1 for v in log.values() if isinstance(v, int) and v)
    print('완료', len(log), '장 · 얼굴 흐림', faces, '장 · 실패', sum(1 for v in log.values() if isinstance(v, str)))
