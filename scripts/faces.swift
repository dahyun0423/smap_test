// 얼굴 찾기 (macOS Vision) — scripts/blur-faces.py가 부른다.
// 사용: swift scripts/faces.swift <이미지 목록 파일>  → 줄마다 "경로\tx,y,w,h;..." (0~1, 왼쪽 아래 기준)
import Foundation
import Vision

let list = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
for path in list.split(separator: "\n").map(String.init) where !path.isEmpty {
    let url = URL(fileURLWithPath: path)
    let face = VNDetectFaceRectanglesRequest()
    // 뒤통수·옆모습은 얼굴로 안 잡히니 사람 상체도 같이 찾아 머리 부분만 쓴다
    let human = VNDetectHumanRectanglesRequest()
    human.upperBodyOnly = true
    let handler = VNImageRequestHandler(url: url, options: [:])
    try? handler.perform([face, human])
    var boxes: [String] = []
    for r in face.results ?? [] where r.confidence > 0.5 {
        let b = r.boundingBox
        boxes.append(String(format: "f:%.4f,%.4f,%.4f,%.4f", b.minX, b.minY, b.width, b.height))
    }
    for r in human.results ?? [] where r.confidence > 0.6 {
        let b = r.boundingBox
        boxes.append(String(format: "h:%.4f,%.4f,%.4f,%.4f", b.minX, b.minY, b.width, b.height))
    }
    print("\(path)\t\(boxes.joined(separator: ";"))")
}
