// Generates the extension icons.
// Usage: swift tools/make-icons.swift PowerShell.novaextension
import AppKit
import CoreGraphics

let bundle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "PowerShell.novaextension"

func writePNG(_ image: CGImage, to path: String) {
    let rep = NSBitmapImageRep(cgImage: image)
    rep.size = NSSize(width: image.width, height: image.height)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: path))
    print("wrote \(path) (\(image.width)x\(image.height))")
}

func makeContext(_ size: Int) -> CGContext {
    let ctx = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.interpolationQuality = .high
    return ctx
}

// Draws the ">_" prompt in a unit square (0...1), scaled to `size`, with the given color.
func drawPrompt(_ ctx: CGContext, size: CGFloat, color: CGColor, lineWidth: CGFloat, inset: CGFloat) {
    let s = size
    ctx.setStrokeColor(color)
    ctx.setLineWidth(lineWidth * s)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)

    // Chevron ">" (CoreGraphics origin is bottom-left).
    let left = inset * s
    let chevronWidth = 0.27 * s
    let mid = 0.5 * s
    let half = 0.2 * s
    ctx.move(to: CGPoint(x: left, y: mid + half))
    ctx.addLine(to: CGPoint(x: left + chevronWidth, y: mid))
    ctx.addLine(to: CGPoint(x: left, y: mid - half))
    ctx.strokePath()

    // Underscore "_".
    let barY = mid - half
    ctx.move(to: CGPoint(x: left + chevronWidth + 0.09 * s, y: barY))
    ctx.addLine(to: CGPoint(x: s - inset * s, y: barY))
    ctx.strokePath()
}

// Extension icon: rounded square with a blue gradient and a white prompt.
func extensionIcon(_ size: Int) -> CGImage {
    let ctx = makeContext(size)
    let s = CGFloat(size)
    let margin = s * 0.06
    let rect = CGRect(x: margin, y: margin, width: s - 2 * margin, height: s - 2 * margin)
    let path = CGPath(roundedRect: rect, cornerWidth: rect.width * 0.22, cornerHeight: rect.width * 0.22, transform: nil)

    // Soft shadow.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.012), blur: s * 0.03,
                  color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.35))
    ctx.addPath(path)
    ctx.setFillColor(CGColor(red: 0.004, green: 0.141, blue: 0.337, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()

    // Gradient: PowerShell console navy at the bottom to a brighter blue at the top.
    ctx.saveGState()
    ctx.addPath(path)
    ctx.clip()
    let colors = [
        CGColor(red: 0.004, green: 0.141, blue: 0.337, alpha: 1),  // #012456
        CGColor(red: 0.137, green: 0.384, blue: 0.761, alpha: 1),  // #2362C2
    ] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: margin), end: CGPoint(x: 0, y: s - margin), options: [])

    // Subtle top highlight.
    ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.18))
    ctx.setLineWidth(max(1, s * 0.012))
    ctx.addPath(CGPath(roundedRect: rect.insetBy(dx: s * 0.006, dy: s * 0.006),
                       cornerWidth: rect.width * 0.21, cornerHeight: rect.width * 0.21, transform: nil))
    ctx.strokePath()
    ctx.restoreGState()

    drawPrompt(ctx, size: s, color: CGColor(red: 1, green: 1, blue: 1, alpha: 1), lineWidth: 0.085, inset: 0.24)
    return ctx.makeImage()!
}

// Template glyph for debug adapter and task template icons: a black prompt Nova tints.
func templateGlyph(_ size: Int) -> CGImage {
    let ctx = makeContext(size)
    drawPrompt(ctx, size: CGFloat(size), color: CGColor(red: 0, green: 0, blue: 0, alpha: 1), lineWidth: 0.13, inset: 0.12)
    return ctx.makeImage()!
}

writePNG(extensionIcon(128), to: "\(bundle)/extension.png")
writePNG(extensionIcon(256), to: "\(bundle)/extension@2x.png")

let glyphDir = "\(bundle)/Images/powershell"
try! FileManager.default.createDirectory(atPath: glyphDir, withIntermediateDirectories: true)
writePNG(templateGlyph(16), to: "\(glyphDir)/powershell.png")
writePNG(templateGlyph(32), to: "\(glyphDir)/powershell@2x.png")
try! "{\n    \"template\": true\n}\n".write(toFile: "\(glyphDir)/metadata.json", atomically: true, encoding: .utf8)
print("wrote \(glyphDir)/metadata.json")
