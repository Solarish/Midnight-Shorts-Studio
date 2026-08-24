import CoreImage
import Foundation
import Vision

enum CutoutError: LocalizedError {
    case usage
    case cannotLoadInput(String)
    case noPersonDetected
    case cannotCreateFilter

    var errorDescription: String? {
        switch self {
        case .usage:
            return "Usage: person-cutout <input-image> <output-png>"
        case .cannotLoadInput(let path):
            return "Cannot load input image: \(path)"
        case .noPersonDetected:
            return "Apple Vision did not return a person segmentation mask"
        case .cannotCreateFilter:
            return "Cannot create Core Image blend filter"
        }
    }
}

func run() throws {
    guard CommandLine.arguments.count == 3 else { throw CutoutError.usage }
    let inputPath = CommandLine.arguments[1]
    let outputPath = CommandLine.arguments[2]
    let inputURL = URL(fileURLWithPath: inputPath)
    let outputURL = URL(fileURLWithPath: outputPath)

    guard let input = CIImage(
        contentsOf: inputURL,
        options: [.applyOrientationProperty: true]
    ) else {
        throw CutoutError.cannotLoadInput(inputPath)
    }

    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let handler = VNImageRequestHandler(ciImage: input, options: [:])
    try handler.perform([request])

    guard let observation = request.results?.first else {
        throw CutoutError.noPersonDetected
    }

    var mask = CIImage(cvPixelBuffer: observation.pixelBuffer)
    let scaleX = input.extent.width / mask.extent.width
    let scaleY = input.extent.height / mask.extent.height
    mask = mask
        .transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        .cropped(to: input.extent)

    guard let blend = CIFilter(name: "CIBlendWithMask") else {
        throw CutoutError.cannotCreateFilter
    }
    let transparent = CIImage(color: .clear).cropped(to: input.extent)
    blend.setValue(input, forKey: kCIInputImageKey)
    blend.setValue(transparent, forKey: kCIInputBackgroundImageKey)
    blend.setValue(mask, forKey: kCIInputMaskImageKey)
    guard let output = blend.outputImage?.cropped(to: input.extent) else {
        throw CutoutError.cannotCreateFilter
    }

    let context = CIContext(options: [.cacheIntermediates: false])
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    try context.writePNGRepresentation(
        of: output,
        to: outputURL,
        format: .RGBA8,
        colorSpace: colorSpace
    )
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("ERROR: \(error.localizedDescription)\n".utf8))
    exit(1)
}

