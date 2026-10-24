import Foundation
import Vision
// 얼굴 찾기 (예민하게) — scripts/blur-strict.py가 부른다. 얼굴(신뢰도 0.3+) + 전신 사람(0.4+)
// 사용: swiftc -O scripts/faces-strict.swift -o <실행파일> → <실행파일> <이미지 목록 파일>
let list = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
for path in list.split(separator: "\n").map(String.init) where !path.isEmpty {
    let face = VNDetectFaceRectanglesRequest()
    let human = VNDetectHumanRectanglesRequest()
    human.upperBodyOnly = false
    try? VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([face, human])
    var b: [String] = []
    for r in face.results ?? [] where r.confidence > 0.3 { let x = r.boundingBox; b.append(String(format: "f:%.4f,%.4f,%.4f,%.4f", x.minX, x.minY, x.width, x.height)) }
    for r in human.results ?? [] where r.confidence > 0.4 { let x = r.boundingBox; b.append(String(format: "h:%.4f,%.4f,%.4f,%.4f", x.minX, x.minY, x.width, x.height)) }
    print("\(path)\t\(b.joined(separator: ";"))")
}
