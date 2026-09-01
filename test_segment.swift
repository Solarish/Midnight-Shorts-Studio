import Foundation
import CoreImage
import Vision
import AppKit

guard CommandLine.arguments.count > 2 else {
    print("Usage: test_segment <input> <output>")
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard let inputImage = CIImage(contentsOf: URL(fileURLWithPath: inputPath)) else {
    print("Failed to load image")
    exit(1)
}

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8

let handler = VNImageRequestHandler(ciImage: inputImage, options: [:])
try handler.perform([request])

guard let maskPixelBuffer = request.results?.first?.pixelBuffer else {
    print("Failed to get segmentation mask")
    exit(1)
}

let maskImage = CIImage(cvPixelBuffer: maskPixelBuffer)
let scaleX = inputImage.extent.width / maskImage.extent.width
let scaleY = inputImage.extent.height / maskImage.extent.height
let scaledMask = maskImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

guard let blendFilter = CIFilter(name: "CIBlendWithMask") else { exit(1) }
blendFilter.setValue(inputImage, forKey: kCIInputImageKey)
blendFilter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
blendFilter.setValue(scaledMask, forKey: kCIInputMaskImageKey)

guard let outputCI = blendFilter.outputImage else { exit(1) }

let context = CIContext()
guard let cgImage = context.createCGImage(outputCI, from: inputImage.extent) else { exit(1) }
let rep = NSBitmapImageRep(cgImage: cgImage)
guard let pngData = rep.representation(using: .png, properties: [:]) else { exit(1) }
try pngData.write(to: URL(fileURLWithPath: outputPath))
print("Successfully segmented and saved to \(outputPath)")
