// Cuts the bike out of a showroom photo with Apple's Vision subject lifting (macOS 14+), on-device.
// usage: swift tools/cutout.swift <in.jpg> <out.png>
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: swift tools/cutout.swift <in.jpg> <out.png>"); exit(2) }
let input = CIImage(contentsOf: URL(fileURLWithPath: args[1]))!
let handler = VNImageRequestHandler(ciImage: input)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result = request.results?.first else { print("no subject found in \(args[1])"); exit(1) }
let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
let ctx = CIContext()
let out = CIImage(cvPixelBuffer: buffer)
try ctx.writePNGRepresentation(of: out, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
