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

// Preserve antialiased edges: luminance becomes continuous alpha (no threshold
// and no chroma key), while RGB is fixed to white to prevent dark fringes.
let matrix = CIFilter(name: "CIColorMatrix")!
matrix.setValue(input, forKey: kCIInputImageKey)
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputRVector")
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputGVector")
matrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBVector")
matrix.setValue(CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0), forKey: "inputAVector")
matrix.setValue(CIVector(x: 1, y: 1, z: 1, w: 0), forKey: "inputBiasVector")
guard let output = matrix.outputImage?.cropped(to: input.extent) else { exit(70) }

let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])
try context.writePNGRepresentation(of: output, to: outputURL, format: .RGBA8, colorSpace: colorSpace)
