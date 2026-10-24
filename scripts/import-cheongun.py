# 청운관 길찾기 CSV(현강 작성: cheongun_nodes.csv · cheongun_edges.csv) → 앱 데이터
#   python3 scripts/import-cheongun.py "<CSV 폴더>"
# - CSV 지점(node_id)을 앱 사진 id로 잇는다: 드라이브 파일명(floor-panos.json n) 기준, 입구 2곳은 기존 사진(pano-map.json)
# - floor-panos.json: 청운관 사진의 층·이름·대표(엘베앞)를 CSV대로 고친다
#   (같은 시간대에 찍혀 '청운관 1층'으로 잘못 묶였던 혜인관 사진 7장도 드라이브 이름대로 혜인관으로 옮긴다)
# - src/data/cheongun.json: CSV 연결(양방향 한 쌍씩) — floor-panos.ts가 청운관은 자동 연결 대신 이걸 쓴다
import csv, json, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1])
nfc = lambda s: unicodedata.normalize('NFC', s or '')

rows = json.loads((ROOT / 'src/data/floor-panos.json').read_text())
by_drive = {nfc(r.get('n')): r for r in rows}
# 드라이브 파일명 오타는 CSV의 normalized_filename 기준으로 같이 찾는다
by_drive.setdefault('청운관_12층_복도끝', by_drive.get('청원관_12층_복도끝'))
pano_map = {nfc(k): v for k, v in json.loads((ROOT / 'scripts/pano-map.json').read_text()).items()}

LOC = {'엘베앞': '엘리베이터 앞', '복도끝': '복도 끝', '중앙': '중앙', '식당앞': '식당 앞', '서점앞': '서점 앞',
       '뷰티샵': '뷰티샵 앞', '뒷길': '뒷길', '뒷길끝': '뒷길 끝'}

ids = {}
for x in csv.DictReader(open(SRC / 'cheongun_nodes.csv', encoding='utf-8-sig')):
    stem = nfc(x['original_filename']).rsplit('.', 1)[0]
    r = by_drive.get(stem) or by_drive.get(nfc(x['normalized_filename']).rsplit('.', 1)[0])
    if r is None:  # 입구 사진 = 예전 JPG360 촬영분
        ids[x['node_id']] = pano_map[f'(청운관){stem}']
        continue
    ids[x['node_id']] = r['id']
    f = 'L층' if x['floor_label'] == 'L' else f"{x['floor_label']}층"
    r.update(b='chungwoon', f=f, g=f'cw-{f}', t=f"청운관 {f} {LOC.get(x['location'], x['location'])}")
    r.pop('c', None)
    if x['elevator_group'] or x['location'] == '중앙':
        r['c'] = 1  # 층 대표 = 엘리베이터 앞 (층 버튼·길안내 도착점)

# 혜인관 사진이 청운관 1층 묶음에 섞여 있던 것 (드라이브 이름이 정답)
for r in rows:
    if r['b'] == 'chungwoon' and nfc(r.get('n')).startswith('혜인관_'):
        _, fl, *rest = nfc(r['n']).split('_')
        r.update(b='hyein', f=fl, g=f'hy-{fl}', t=f"혜인관 {fl} {' '.join(LOC.get(w, w) for w in rest)}")
        r.pop('c', None)
        if rest == ['엘베앞']:
            r['c'] = 1

pairs = {}
for e in csv.DictReader(open(SRC / 'cheongun_edges.csv', encoding='utf-8-sig')):
    a, b = ids[e['from_node_id']], ids[e['to_node_id']]
    pairs.setdefault(tuple(sorted((a, b))), {'a': a, 'b': b, 'via': e['move_type'].lower(), 'sec': int(e['time_seconds'])})

out = {'source': '현강 청운관 CSV (2026-10-20)', 'nodes': ids, 'edges': list(pairs.values())}
(ROOT / 'src/data/cheongun.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
(ROOT / 'src/data/floor-panos.json').write_text('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')
print(f'지점 {len(ids)}개, 연결 {len(pairs)}쌍')
