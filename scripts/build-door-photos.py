"""「강의실앞사진들」(문 앞 호수판·층 안내판, 2026-10-12~13) → public/door/*.jpg + src/data/door-photos.json

사진 속 호수·이름은 사람이 읽어 아래 표에 적었다. h=호수, n=문에 적힌 이름(학교 데이터와 다르면 현장 이름이 최신).
kind: door(문 앞) · board(층·건물 안내판)
사용: python3 scripts/build-door-photos.py <사진 폴더>
"""
import json, os, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (사진 번호, 건물, 층, 호수, 문에 적힌 이름)
DOORS = [
    # 문예관
    (5713, 'moonye', 12, '1202', '학과사무실'), (5714, 'moonye', 12, '1205', '교수연구실'),
    (5716, 'moonye', 10, '1001', '교수연구실'), (5717, 'moonye', 10, '1002', '실기지도실'),
    (5718, 'moonye', 10, '1003', '교수연구실'), (5719, 'moonye', 10, '1004', '교수연구실'),
    (5720, 'moonye', 10, '1005', ''), (5721, 'moonye', 10, '1006', '조원경 교수'),
    (5722, 'moonye', 9, '904', '이동일 교수'), (5723, 'moonye', 9, '905', '김희균 교수'),
    (5724, 'moonye', 9, '906', '실기지도실'), (5725, 'moonye', 9, '903', '실기지도실'),
    (5726, 'moonye', 9, '902', '교수연구실'), (5727, 'moonye', 9, '907', '실기지도실'),
    (5728, 'moonye', 9, '908', '실기지도실'),
    (5729, 'moonye', 8, '803', '실기강의실'), (5730, 'moonye', 8, '801', '실기강의실'),
    (5731, 'moonye', 8, '804', '실기강의실'), (5732, 'moonye', 8, '802', '실기강의실'),
    (5733, 'moonye', 6, '605', '강의실'), (5734, 'moonye', 6, '601', '강의실'), (5735, 'moonye', 6, '604', '강의실'),
    (5736, 'moonye', 6, '602', '강의실'), (5737, 'moonye', 6, '603', '강의실'),
    (5738, 'moonye', 5, '501', '강의실'), (5739, 'moonye', 5, '502', '강의실'),
    # 청운관 — 학교 데이터엔 5·6층 대부분이 '공실'이지만 현장엔 학과·동아리방이 있음
    (5740, 'chungwoon', 12, '1201', 'UBF'), (5741, 'chungwoon', 12, '1205', '애니뭉 1실'),
    (5742, 'chungwoon', 12, '1204', ''), (5743, 'chungwoon', 12, '1206', '애니뭉 2실'),
    (5744, 'chungwoon', 11, '1109', ''), (5745, 'chungwoon', 11, '1108', ''), (5746, 'chungwoon', 11, '1107', ''),
    (5747, 'chungwoon', 11, '1106', 'WORKERS'),
    (5748, 'chungwoon', 10, '1012', ''), (5749, 'chungwoon', 10, '1011', ''), (5750, 'chungwoon', 10, '1010', ''),
    (5751, 'chungwoon', 10, '1009', 'OCF'), (5752, 'chungwoon', 10, '1008', '인형사'), (5753, 'chungwoon', 10, '1007', 'BULLS'),
    (5754, 'chungwoon', 9, '913', '금융정보공학과'), (5755, 'chungwoon', 9, '912', '물류시스템공학과'),
    (5756, 'chungwoon', 9, '', '전자컴퓨터공학과'), (5757, 'chungwoon', 9, '910', '소프트웨어학과'),
    (5758, 'chungwoon', 9, '909', '소프트웨어학과'), (5759, 'chungwoon', 9, '908', '도시공학과'),
    (5760, 'chungwoon', 8, '817', '경영학부'), (5761, 'chungwoon', 8, '816', '경영학부'),
    (5762, 'chungwoon', 8, '815', '경영학부'), (5763, 'chungwoon', 8, '814', '공공인재학부'),
    (5764, 'chungwoon', 8, '813', '공공인재학부'), (5765, 'chungwoon', 8, '812', ''), (5766, 'chungwoon', 8, '811', ''),
    (5767, 'chungwoon', 6, '615', ''), (5768, 'chungwoon', 6, '614', '광고홍보영상학과'),
    (5769, 'chungwoon', 6, '613', '중앙감사위원회'), (5770, 'chungwoon', 6, '612', '스포츠앤테크놀로지학과'),
    (5771, 'chungwoon', 6, '611', '뷰티테크놀로지학과'), (5772, 'chungwoon', 6, '610', '공연예술학부'),
    (5773, 'chungwoon', 6, '609', '소품실'),
    (5774, 'chungwoon', 5, '517', '인권센터'), (5775, 'chungwoon', 5, '516', '인권상담실'),
    (5776, 'chungwoon', 5, '513', '여학생휴게실'), (5777, 'chungwoon', 5, '511', '융합대학학생회'),
    # 은주1관
    (5791, 'eunju1', 6, '604', '교수연구실'), (5792, 'eunju1', 6, '603', 'Studio 2'),
    (5793, 'eunju1', 6, '605', 'Production Room'), (5794, 'eunju1', 6, '606', 'Studio 3'),
    (5795, 'eunju1', 4, '407', '연습실 1'), (5797, 'eunju1', 4, '408', '연습실 2'), (5798, 'eunju1', 4, '409', '연습실 3'),
    (5799, 'eunju1', 4, '410', '연습실 4'), (5800, 'eunju1', 4, '411', '연습실 5'), (5801, 'eunju1', 4, '412', '연습실 6'),
    (5802, 'eunju1', 4, '413', '연습실 7'), (5803, 'eunju1', 4, '414', '연습실 8'),
    (5804, 'eunju1', 4, '415', '무용예술학과 탈의실'), (5805, 'eunju1', 4, '416', '뮤지컬 프로덕션 룸'),
    (5807, 'eunju1', 2, '202', '도시공학과 실습실'), (5808, 'eunju1', 2, '207', 'CREOS 강의실'),
    (5809, 'eunju1', 1, '', 'NEXT LEARN 기업부설연구소'), (5810, 'eunju1', 1, '102', 'PAPER HOUSE'),
    # 본관
    (5886, 'bonkwan', None, '', '총장실 · 비서실'),
    # 유담관
    (5889, 'yudam', 6, '604', '캠퍼스타운 조성사업단'), (5890, 'yudam', 6, '605', '서경대학교 문화예술센터'),
]
BOARDS = [
    (5710, 'moonye', None, '문예관 층별 안내'), (5711, 'moonye', None, '문예관 층별 안내'),
    (5712, 'moonye', None, '문예관 로비 안내판'), (5778, 'chungwoon', None, '청운관 층별 안내'),
    (5811, 'hanlim', 3, '한림관 층별 안내 (3층)'), (5812, 'hanlim', 14, '한림관 14층 안내도'),
    (5888, 'yudam', None, '유담관 층별 강의실 안내'), (5891, 'yudam', 5, '유담관 층별 안내 (5층)'),
    (5892, 'yudam', 16, '유담관 16층 안내도'),
]


def main(src):
    out_dir = os.path.join(ROOT, 'public/door'); os.makedirs(out_dir, exist_ok=True)
    rows = [{'p': f'IMG_{p}', 'kind': 'door', 'b': b, 'f': f, 'h': h, 'n': n} for p, b, f, h, n in DOORS]
    rows += [{'p': f'IMG_{p}', 'kind': 'board', 'b': b, 'f': f, 'n': n} for p, b, f, n in BOARDS]
    for r in rows:
        dst = os.path.join(out_dir, r['p'] + '.jpg')
        if os.path.exists(dst): continue
        im = ImageOps.exif_transpose(Image.open(os.path.join(src, r['p'] + '.JPG'))).convert('RGB')
        im.thumbnail((1400 if r['kind'] == 'board' else 900,) * 2)
        im.save(dst, quality=78)
    dst = os.path.join(ROOT, 'src/data/door-photos.json')
    open(dst, 'w').write('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')
    print(len(rows), '장 →', dst)


if __name__ == '__main__':
    main(sys.argv[1])
