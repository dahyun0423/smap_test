# 건물 길찾기 CSV(현강 작성: <건물>_nodes.csv · <건물>_edges.csv) → 앱 데이터 (청운관 다음 건물들)
#   python3 scripts/import-building-csv.py <앱 건물 id> "<CSV 폴더>"
#   예) python3 scripts/import-building-csv.py moonye ~/Downloads/문예관_노드_노드연결
#       python3 scripts/import-building-csv.py eunju ~/Downloads/은주1,2관_노드_노드연결   (은주1관·2관이 한 CSV — 건물은 줄마다 building 칸)
# - CSV 지점(node_id)을 앱 사진 id로 잇는다: 드라이브 파일명(floor-panos.json n) 기준, 없으면 아래 EXTRA (예전 JPG360 입구 사진 등)
# - floor-panos.json: 그 건물 사진의 층·이름·대표(엘베앞)를 CSV대로 고친다
# - src/data/csv-<건물>.json: CSV 연결(양방향 한 쌍씩) — floor-panos.ts가 이 건물은 자동 연결 대신 이걸 쓴다
#   같은 두 사진 사이에 엘리베이터·계단이 둘 다 있으면 앱 연결은 엘리베이터 하나로 (앱은 사진 쌍마다 하나), 계단은 also 에 남겨
#   CSV 내보내기 때 현강 CSV처럼 이동 방식별로 한 줄씩 다시 나간다
#   --edges-only: floor-panos.json 은 건드리지 않고 csv-<건물>.json 연결만 다시 만든다
import csv, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGES_ONLY = '--edges-only' in sys.argv
B, SRC = [a for a in sys.argv[1:] if a != '--edges-only'][:2]
SRC = Path(SRC).expanduser()
nfc = lambda s: unicodedata.normalize('NFC', s or '')
BLD = {'문예관': 'moonye', '혜인관': 'hyein', '한림관': 'hanlim', '은주1관': 'eunju1', '은주2관': 'eunju2'}
PREFIX = {'moonye': 'my', 'hyein': 'hy', 'hanlim': 'hl', 'eunju1': 'ej1', 'eunju2': 'ej2'}
NAME = {'eunju': '은주1·2관'}.get(B) or next(k for k, v in BLD.items() if v == B)

# 드라이브 이름과 floor-panos n 이 다르거나, 예전 JPG360 촬영분(campus.ts 지점)인 사진
EXTRA = {
    '문예관_L층_중앙': 's1012_105956',           # floor-panos n: 문예관_L층_로비중앙
    '문예관_L층_로비좌측': 'moonye_1f_in',        # 추정: 폭풍의언덕 쪽 문으로 들어온 로비 (확인 필요)
    '혜인관_1층_계단위_입구_앞': 'hyein_up_front',
    '혜인관_지하1층_계단밑_입구_안': 'hyein_down_in',
    '한림관_3층_은주1관_연결통로계단': 's1012_162820',  # floor-panos n: 한림관_은주1관_연결통로계단
    '한림관_1층_입구': 'hanlim_in',               # 한림관_입구_안 과 같은 드라이브 파일
    '은주1관_5층_한림관연결길': 's1012_170106',     # floor-panos n: 은주2관_5층_한림관연결길 (드라이브에서 이름 바뀜)
}

rows = json.loads((ROOT / 'src/data/floor-panos.json').read_text())
by_drive = {nfc(r.get('n')): r for r in rows}
by_id = {r['id']: r for r in rows}

def title(name, fl, loc):
    loc = re.sub(r'엘베앞·계단/(촬영지점\d)?', '엘베앞 ', loc).replace('엘베앞/계단', '엘베앞').strip()
    if loc.startswith('촬영지점'):
        loc = f"({loc[4:]})"
    for a, z in [('엘베앞', '엘리베이터 앞'), ('복도끝', '복도 끝'), ('중앙계단', '중앙 계단'), ('계단밑_입구_안', '계단 밑 입구 안'),
                 ('계단위_입구_앞', '계단 위 입구 앞'), ('스콘라운지', '스콘 라운지'), ('로비좌측', '로비 왼쪽'), ('_', ' ')]:
        loc = loc.replace(a, z)
    return f"{name} {fl.replace('B', '지하') + ('층' if fl.startswith('B') else '')} {loc}".strip()

ids = {}
moved = []
for x in csv.DictReader(open(SRC / f'{ {"moonye": "munye"}.get(B, B)}_nodes.csv', encoding='utf-8-sig')):
    stem = nfc(x['original_filename']).rsplit('.', 1)[0]
    r = by_drive.get(stem) or by_drive.get(nfc(x['normalized_filename']).rsplit('.', 1)[0]) or by_id.get(EXTRA.get(stem, ''))
    if r is None:  # campus.ts 지점 (이름·층은 그대로)
        ids[x['node_id']] = EXTRA[stem]
        continue
    ids[x['node_id']] = r['id']
    name, loc = nfc(x['building']), nfc(x['location'])
    if name not in BLD:  # '문예관-북악관 연결구간' 같은 구간 이름 → 이 CSV 건물
        name = NAME
    b = BLD[name]
    m = re.search(r'(\d+)층', loc)
    if not x['floor_label'] and not m:  # 건물 앞 야외 사진 — 위치는 그대로, 이름만
        r['t'] = f'{name} {loc}'
        continue
    lab = x['floor_label'] or m[1]  # 층 빈칸: '문예관6층-북악관7층 연결계단' → 6층
    f = 'L층' if lab == 'L' else lab if lab.startswith('B') or lab.endswith('층') else f'{lab}층'
    old = (r['b'], r['f'])
    r.update(b=b, f=f, g=f'{PREFIX[b]}-{f}', t=title(name, f, loc if x['floor_label'] else '북악관 7층 연결계단'))
    r.pop('c', None)
    if x['elevator_group']:
        r['c'] = 1  # 층 대표 = 엘리베이터 앞 (층 버튼·길안내 도착점)
    if old != (b, f):
        moved.append(f"{stem}: {old[0]} {old[1]} → {b} {f}")

pairs = {}
RANK = {'elevator': 0, 'stairs': 1, 'walk': 2}
for e in csv.DictReader(open(SRC / f'{ {"moonye": "munye"}.get(B, B)}_edges.csv', encoding='utf-8-sig')):
    a, b = ids[e['from_node_id']], ids[e['to_node_id']]
    via = e['move_type'].lower()
    k = tuple(sorted((a, b)))
    sec = int(e['time_seconds'] or 0)
    cur = pairs.get(k)
    if cur is None:
        pairs[k] = {'a': a, 'b': b, 'via': via, 'sec': sec}
    elif via != cur['via'] and via not in [x['via'] for x in cur.get('also', [])]:
        if RANK[via] < RANK[cur['via']]:  # 앱 연결은 엘리베이터 > 계단 > 걷기
            cur.setdefault('also', []).append({'via': cur['via'], 'sec': cur['sec']})
            cur.update(via=via, sec=sec)
        else:
            cur.setdefault('also', []).append({'via': via, 'sec': sec})

out = {'source': f'현강 {NAME} CSV (2026-10-21)', 'nodes': ids, 'edges': list(pairs.values())}
(ROOT / f'src/data/csv-{B}.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
if not EDGES_ONLY:
    (ROOT / 'src/data/floor-panos.json').write_text('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')
print(f'{NAME}: 지점 {len(ids)}개, 연결 {len(pairs)}쌍 (이동 방식 둘 이상 {sum(1 for p in pairs.values() if p.get("also"))}쌍)')
for m in moved:
    print('  층 고침', m)
