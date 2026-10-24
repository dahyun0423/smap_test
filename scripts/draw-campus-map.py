"""SMAP 자체 캠퍼스 지도 (학교 VR투어 미니맵 대체용).
학교 미니맵 그림과 같은 틀(1024×684)에 건물을 같은 자리로 따라 그려서, 건물 핀·360 지점 좌표(%)를 그대로 쓴다.
실행: python3 scripts/draw-campus-map.py  →  public/map-ground.svg, public/map-underground.svg
"""
W, H = 1024, 684

# 건물 지붕(윗면) 다각형 + 벽 높이(px). 학교 미니맵을 보고 따라 그린 근사치.
BUILDINGS = {
    '북악관': ([(120, 57), (150, 17), (384, 70), (353, 110)], 55),
    '문예관': ([(355, 110), (378, 94), (470, 122), (448, 150)], 36),
    '본관': ([(200, 190), (238, 146), (420, 186), (394, 228)], 38),
    '대일관·상승관': ([(456, 157), (480, 126), (786, 184), (766, 214)], 34),
    '청운관': ([(778, 214), (796, 182), (898, 232), (882, 252)], 30),
    '혜인관': ([(756, 400), (893, 246), (951, 268), (814, 428)], 42),
    '은주1관': ([(481, 344), (521, 207), (557, 214), (520, 352)], 58),
    '유담관': ([(70, 116), (86, 112), (112, 228), (300, 292), (338, 318), (334, 356), (112, 330)], 52),
    '수인관': ([(515, 352), (541, 344), (756, 446), (736, 470)], 30),
    '은주2관 A': ([(726, 472), (737, 463), (1024, 500), (1024, 532)], 46),
    '은주2관 B': ([(740, 518), (752, 512), (946, 546), (940, 577)], 44),
    '은주2관 C': ([(673, 586), (690, 558), (861, 610), (850, 642)], 44),
    '크리에이티브센터': ([(1004, 380), (1024, 374), (1024, 396), (1004, 402)], 14),
}
ROUND = {'한림관': ((464, 214), 46, 22, 40)}  # 중심, 가로 반지름, 세로 반지름, 높이
FIELDS = {
    '운동장 (스콘스퀘어)': [(552, 250), (606, 247), (842, 290), (758, 432), (540, 402)],
    '풋살장': [(406, 466), (500, 416), (722, 520), (602, 606)],
}
ROADS = [  # (경로, 두께)
    ('M0,104 C60,98 102,104 120,152 C138,204 150,250 248,298 C330,334 352,366 372,452 C388,522 424,604 520,684', 24),
    ('M98,22 C300,40 430,86 560,122 C700,152 860,178 1024,192', 11),
    ('M372,452 C450,470 600,560 660,684', 14),
]
TREES = [(178, 178), (194, 166), (404, 276), (408, 304), (440, 270), (450, 345), (308, 395), (330, 385), (946, 222), (968, 240), (618, 640), (630, 664), (920, 655), (970, 600), (1004, 610)]
# 지하 (제1주차장·제2주차장·연결통로) — 학교 지하 미니맵을 % 위치로 옮김
PARKING = {
    '제1주차장 (지하)': [(55.4, 37.7), (60.1, 36.0), (83.0, 41.3), (74.0, 61.9), (58.1, 53.7)],
    '제2주차장 (유담관 2층)': [(11.0, 39.0), (17.4, 37.7), (33.6, 47.2), (27.3, 64.9), (11.0, 55.4)],
}
TUNNELS = [[(4, 17), (12, 17.7), (41, 27.7), (55.4, 34.2)], [(10.3, 17.7), (13.8, 34.8)], [(30, 61), (42.7, 85.5)]]

C = dict(bg='#EEF2F6', ground='#F5F7FA', road='#DCE2EA', roadEdge='#CBD3DE', top='#FFFFFF', topStroke='#C3CEDC',
         wallS='#D5DDE8', wallE='#E2E8F0', field='#DDEFD6', fieldStroke='#B6DBAA', tree='#CFE5C6', treeDark='#B4D4A8',
         under='#2272EB', underEdge='#194AA6')


def pts(p): return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
def pct(p): return [(x * W / 100, y * H / 100) for x, y in p]


def building(poly, h, faded=False):
    """윗면 + 남·동쪽 벽 (아래로 h만큼). 뒤쪽 벽은 안 보이니 생략."""
    out = []
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        # 바깥쪽 법선이 아래(+y)를 향하는 변만 벽을 그린다 (다각형은 시계 방향)
        nx, ny = (y2 - y1), -(x2 - x1)
        if ny <= 0:
            continue
        col = C['wallS'] if abs(ny) >= abs(nx) else C['wallE']
        out.append(f'<polygon points="{pts([(x1, y1), (x2, y2), (x2, y2 + h), (x1, y1 + h)])}" fill="{col}" stroke="{C["topStroke"]}" stroke-width="1"/>')
    out.append(f'<polygon points="{pts(poly)}" fill="{C["top"]}" stroke="{C["topStroke"]}" stroke-width="1.2"/>')
    g = ''.join(out)
    return f'<g opacity="{0.35 if faded else 1}">{g}</g>'


def round_building(c, rx, ry, h, faded=False):
    (cx, cy) = c
    wall = f'<path d="M{cx - rx},{cy} L{cx - rx},{cy + h} A{rx},{ry} 0 0 0 {cx + rx},{cy + h} L{cx + rx},{cy} Z" fill="{C["wallS"]}" stroke="{C["topStroke"]}"/>'
    top = f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{C["top"]}" stroke="{C["topStroke"]}" stroke-width="1.2"/>'
    return f'<g opacity="{0.35 if faded else 1}">{wall}{top}</g>'


def ensure_cw(poly):
    # 화면 좌표(y 아래)에서 시계 방향이 되게
    s = sum((x2 - x1) * (y2 + y1) for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]))
    return poly if s < 0 else poly[::-1]


def scene(underground=False):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
             f'<title>SMAP 서경대 캠퍼스 {"지하" if underground else "지상"} 지도</title>',
             f'<rect width="{W}" height="{H}" fill="{C["bg"]}"/>',
             f'<path d="M0,120 C120,80 300,40 560,110 C760,160 900,170 {W},180 L{W},{H} L0,{H} Z" fill="{C["ground"]}"/>']
    for d, w in ROADS:
        parts.append(f'<path d="{d}" fill="none" stroke="{C["roadEdge"]}" stroke-width="{w + 3}" stroke-linecap="round"/>')
        parts.append(f'<path d="{d}" fill="none" stroke="{C["road"]}" stroke-width="{w}" stroke-linecap="round"/>')
    for name, poly in FIELDS.items():
        parts.append(f'<polygon points="{pts(poly)}" fill="{C["field"]}" stroke="{C["fieldStroke"]}" stroke-width="2" opacity="{0.35 if underground else 1}"><title>{name}</title></polygon>')
    items = [(min(y for _, y in p), 'b', n, p, h) for n, (p, h) in BUILDINGS.items()]
    items += [(c[1] - ry, 'r', n, (c, rx, ry), h) for n, (c, rx, ry, h) in ROUND.items()]
    for _, kind, name, geo, h in sorted(items, key=lambda t: t[0]):  # 뒤(위)에서 앞(아래)으로
        if kind == 'b':
            parts.append(f'<g><title>{name}</title>{building(ensure_cw(geo), h, underground)}</g>')
        else:
            c, rx, ry = geo
            parts.append(f'<g><title>{name}</title>{round_building(c, rx, ry, h, underground)}</g>')
    if not underground:
        for x, y in TREES:
            parts.append(f'<ellipse cx="{x}" cy="{y + 9}" rx="9" ry="3.5" fill="#000" opacity=".06"/><circle cx="{x}" cy="{y}" r="9" fill="{C["tree"]}" stroke="{C["treeDark"]}"/>')
    else:
        for t in TUNNELS:
            d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pct(t))
            parts.append(f'<path d="{d}" fill="none" stroke="{C["under"]}" stroke-opacity=".75" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><title>지하 연결통로</title></path>')
        for name, poly in PARKING.items():
            parts.append(f'<polygon points="{pts(pct(poly))}" fill="{C["under"]}" fill-opacity=".7" stroke="{C["underEdge"]}" stroke-width="3" stroke-linejoin="round"><title>{name}</title></polygon>')
    parts.append('</svg>')
    return '\n'.join(parts)


if __name__ == '__main__':
    import pathlib
    root = pathlib.Path(__file__).resolve().parent.parent / 'public'
    (root / 'map-ground.svg').write_text(scene(False), encoding='utf-8')
    (root / 'map-underground.svg').write_text(scene(True), encoding='utf-8')
    print('written', root / 'map-ground.svg', root / 'map-underground.svg')
