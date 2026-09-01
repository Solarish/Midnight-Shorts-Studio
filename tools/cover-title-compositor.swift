import AppKit
import Foundation

struct CoverText: Decodable {
    let eyebrow: String
    let title: String
    let subtitle: String
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(("cover-title-compositor: \(message)\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 4 else {
    fail("usage: cover-title-compositor <source.png> <output.png> <text.json>")
}

let sourcePath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let configPath = CommandLine.arguments[3]
guard let source = NSImage(contentsOfFile: sourcePath) else { fail("cannot read source image") }
guard let configData = FileManager.default.contents(atPath: configPath) else { fail("cannot read text config") }
let config: CoverText
do { config = try JSONDecoder().decode(CoverText.self, from: configData) }
catch { fail("invalid text config: \(error.localizedDescription)") }
guard !config.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fail("title is empty") }

let width = 1920
let height = 1080
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else { fail("cannot create output bitmap") }

NSGraphicsContext.saveGraphicsState()
guard let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { fail("cannot create graphics context") }
NSGraphicsContext.current = graphics
graphics.imageInterpolation = .high
source.draw(in: NSRect(x: 0, y: 0, width: width, height: height),
            from: NSRect(origin: .zero, size: source.size),
            operation: .copy,
            fraction: 1)

let gold = NSColor(calibratedRed: 0.86, green: 0.68, blue: 0.27, alpha: 1)
let white = NSColor(calibratedWhite: 0.98, alpha: 1)
let muted = NSColor(calibratedRed: 0.78, green: 0.83, blue: 0.88, alpha: 1)
let textX: CGFloat = 150
let textWidth: CGFloat = 760

// AppKit's drawing origin is bottom-left. The visual top of the title block is
// therefore expressed by high y values here.
gold.setFill()
NSBezierPath(roundedRect: NSRect(x: 108, y: 292, width: 8, height: 496), xRadius: 4, yRadius: 4).fill()
NSBezierPath(rect: NSRect(x: textX, y: 774, width: 94, height: 4)).fill()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .left
paragraph.lineBreakMode = .byWordWrapping
paragraph.lineSpacing = 5

func font(_ name: String, size: CGFloat, weight: NSFont.Weight) -> NSFont {
    NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
}

let eyebrowAttributes: [NSAttributedString.Key: Any] = [
    .font: font("Sukhumvit Set", size: 31, weight: .semibold),
    .foregroundColor: gold,
    .paragraphStyle: paragraph,
    .kern: 0.8
]
NSAttributedString(string: config.eyebrow, attributes: eyebrowAttributes)
    .draw(in: NSRect(x: textX, y: 698, width: textWidth, height: 62))

// Thai line breaking can split a surname at an arbitrary glyph. For long
// person names, prefer the final explicit word boundary before measuring.
let renderedTitle: String = {
    guard config.title.count > 20,
          let boundary = config.title.lastIndex(of: " ") else { return config.title }
    var value = config.title
    value.replaceSubrange(boundary...boundary, with: "\n")
    return value
}()

func titleString(size: CGFloat) -> NSAttributedString {
    NSAttributedString(string: renderedTitle, attributes: [
        .font: font("Sukhumvit Set", size: size, weight: .bold),
        .foregroundColor: white,
        .paragraphStyle: paragraph,
        .kern: -0.5
    ])
}

var titleSize: CGFloat = 72
var title = titleString(size: titleSize)
let maxTitleHeight: CGFloat = 300
while titleSize > 48 {
    let bounds = title.boundingRect(with: NSSize(width: textWidth, height: .greatestFiniteMagnitude),
                                    options: [.usesLineFragmentOrigin, .usesFontLeading])
    if bounds.height <= maxTitleHeight { break }
    titleSize -= 2
    title = titleString(size: titleSize)
}
title.draw(with: NSRect(x: textX, y: 390, width: textWidth, height: maxTitleHeight),
           options: [.usesLineFragmentOrigin, .usesFontLeading])

let subtitleAttributes: [NSAttributedString.Key: Any] = [
    .font: font("Sukhumvit Set", size: 30, weight: .regular),
    .foregroundColor: muted,
    .paragraphStyle: paragraph
]
NSAttributedString(string: config.subtitle, attributes: subtitleAttributes)
    .draw(in: NSRect(x: textX, y: 280, width: textWidth, height: 96))

let brandParagraph = NSMutableParagraphStyle()
brandParagraph.alignment = .left
let brandAttributes: [NSAttributedString.Key: Any] = [
    .font: font("Helvetica Neue", size: 22, weight: .medium),
    .foregroundColor: gold.withAlphaComponent(0.9),
    .paragraphStyle: brandParagraph,
    .kern: 2.4
]
NSAttributedString(string: "PSU  BROADCAST", attributes: brandAttributes)
    .draw(in: NSRect(x: textX, y: 208, width: textWidth, height: 38))

graphics.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else { fail("cannot encode PNG") }
do {
    try FileManager.default.createDirectory(at: URL(fileURLWithPath: outputPath).deletingLastPathComponent(), withIntermediateDirectories: true)
    try png.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
} catch { fail("cannot write output: \(error.localizedDescription)") }
