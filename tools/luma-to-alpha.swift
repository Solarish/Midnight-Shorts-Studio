import Foundation
import CoreImage
import CoreGraphics

guard CommandLine.arguments.count == 3 else {
  FileHandle.standardError.write(Data("usage: luma-to-alpha <input> <output>\n".utf8))
  exit(64)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let input = CIImage(contentsOf: inputURL) else {
  FileHandle.standardError.write(Data("cannot read input image\n".utf8))
  exit(66)
}

let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

// Models occasionally return the matte polarity inverted. Inspect a corner,
// which is reserved for the matte, and normalize it before alpha extraction.
let corner = input.cropped(to: CGRect(x: input.extent.minX, y: input.extent.minY, width: min(32, input.extent.width), height: min(32, input.extent.height)))
let average = CIFilter(name: "CIAreaAverage")!
average.setValue(corner, forKey: kCIInputImageKey)
average.setValue(CIVector(cgRect: corner.extent), forKey: "inputExtent")
var normalized = input
if let averageImage = average.outputImage, let pixel = context.createCGImage(averageImage, from: CGRect(x: 0, y: 0, width: 1, height: 1)), let data = pixel.dataProvider?.data, let bytes = CFDataGetBytePtr(data) {
  let brightness = (Double(bytes[0]) * 0.2126 + Double(bytes[1]) * 0.7152 + Double(bytes[2]) * 0.0722) / 255.0
  if brightness > 0.55 {
    let invert = CIFilter(name: "CIColorInvert")!
    invert.setValue(input, forKey: kCIInputImageKey)
    normalized = invert.outputImage?.cropped(to: input.extent) ?? input
  }
}

// Preserve the complete illustration: luminance becomes continuous alpha so
// filled shapes remain visible instead of being reduced to edge contours.
let matrix = CIFilter(name: "CIColorMatrix")!
matrix.setValue(normalized, forKey: kCIInputImageKey)
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputRVector")
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputGVector")
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBVector")
matrix.setValue(CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0), forKey: "inputAVector")
matrix.setValue(CIVector(x: 1, y: 1, z: 1, w: 0), forKey: "inputBiasVector")
guard let output = matrix.outputImage?.cropped(to: input.extent) else { exit(70) }

try context.writePNGRepresentation(of: output, to: outputURL, format: .RGBA8, colorSpace: colorSpace)
