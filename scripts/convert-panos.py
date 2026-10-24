"""360 원본 zip → 웹용 파노라마(public/pano) + 썸네일(public/thumb) 변환.

사용: python3 scripts/convert-panos.py "JPG 360-....zip"
파일명 → ID 매핑은 scripts/pano-map.json 에서 관리한다. (macOS sips 사용)
"""
import json, os, subprocess, sys, unicodedata, zipfile, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANO_W, THUMB_W = 4096, 512

def nfc(s): return unicodedata.normalize("NFC", s)

def main(zip_path):
    mapping = {nfc(k): v for k, v in json.load(open(os.path.join(ROOT, "scripts/pano-map.json"))).items()}
    out_pano = os.path.join(ROOT, "public/pano"); out_thumb = os.path.join(ROOT, "public/thumb")
    os.makedirs(out_pano, exist_ok=True); os.makedirs(out_thumb, exist_ok=True)
    z = zipfile.ZipFile(zip_path)
    seen, missing = set(), []
    with tempfile.TemporaryDirectory() as tmp:
        for info in z.infolist():
            if not info.filename.lower().endswith(".jpg"): continue
            stem = nfc(os.path.splitext(os.path.basename(info.filename))[0])
            pid = mapping.get(stem)
            if not pid: missing.append(stem); continue
            seen.add(pid)
            dst = os.path.join(out_pano, pid + ".jpg")
            if os.path.exists(dst): continue
            src = os.path.join(tmp, pid + ".jpg")
            with open(src, "wb") as f: f.write(z.read(info))
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72",
                            "--resampleWidth", str(PANO_W), src, "--out", dst], check=True, capture_output=True)
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70",
                            "--resampleWidth", str(THUMB_W), src, "--out", os.path.join(out_thumb, pid + ".jpg")],
                           check=True, capture_output=True)
            os.remove(src)
            print("ok", pid)
    unused = set(mapping.values()) - seen
    if missing: print("매핑 없는 파일:", missing)
    if unused: print("zip에 없는 ID:", unused)

if __name__ == "__main__":
    main(sys.argv[1])
