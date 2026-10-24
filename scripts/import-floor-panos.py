"""스티칭한 360 jpg → public/pano/<id>.jpg (4096px) + public/thumb/<id>.jpg (512px). macOS sips 사용.

src/data/floor-panos.json 의 src(원본 파일명) → id 로 이름을 바꿔 넣는다. 이미 있으면 건너뜀.
사용: python3 scripts/import-floor-panos.py <스티칭된 jpg 폴더>
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def one(src_dir, row):
    src = os.path.join(src_dir, row['src'] + '.jpg')
    pano = os.path.join(ROOT, 'public/pano', row['id'] + '.jpg')
    thumb = os.path.join(ROOT, 'public/thumb', row['id'] + '.jpg')
    if not os.path.exists(pano):
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '--resampleWidth', '4096', src, '--out', pano], check=True, capture_output=True)
    if not os.path.exists(thumb):
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '--resampleWidth', '512', src, '--out', thumb], check=True, capture_output=True)


def main(src_dir):
    rows = json.load(open(os.path.join(ROOT, 'src/data/floor-panos.json')))
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda r: one(src_dir, r), rows))
    print(len(rows), '장 완료')


if __name__ == '__main__':
    main(sys.argv[1])
