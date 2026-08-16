import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import CoreGraphics

private let targetSampleRate = 24_000.0

private func emitStatus(_ type: String, _ fields: [String: Any] = [:]) {
    var payload = fields
    payload["type"] = type
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let newline = "\n".data(using: .utf8) else { return }
    FileHandle.standardError.write(data)
    FileHandle.standardError.write(newline)
}

@available(macOS 13.0, *)
private final class MacSystemAudioSource: NSObject, SCStreamOutput, SCStreamDelegate {
    private let sampleQueue = DispatchQueue(label: "com.lecscape.system-audio.samples")
    private let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: targetSampleRate,
        channels: 1,
        interleaved: true
    )!
    private var stream: SCStream?
    private var converter: AVAudioConverter?
    private var converterInputFormat: AVAudioFormat?

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        guard let display = content.displays.first(where: {
            $0.frame.origin.x == 0 && $0.frame.origin.y == 0
        }) ?? content.displays.first else {
            throw NSError(
                domain: "LecScapeAudio",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No capturable display was found"]
            )
        }

        let filter = SCContentFilter(
            display: display,
            excludingApplications: [],
            exceptingWindows: []
        )
        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = true
        configuration.sampleRate = Int(targetSampleRate)
        configuration.channelCount = 1
        configuration.excludesCurrentProcessAudio = true
        configuration.queueDepth = 3

        let captureStream = SCStream(
            filter: filter,
            configuration: configuration,
            delegate: self
        )
        try captureStream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
        try await captureStream.startCapture()
        stream = captureStream
        emitStatus("ready", [
            "sampleRate": Int(targetSampleRate),
            "channelCount": 1,
            "format": "pcm16le"
        ])
    }

    func stop() async {
        guard let captureStream = stream else { return }
        try? await captureStream.stopCapture()
        stream = nil
        emitStatus("stopped")
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .audio,
              sampleBuffer.isValid,
              CMSampleBufferDataIsReady(sampleBuffer),
              let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription),
              let inputFormat = AVAudioFormat(streamDescription: streamDescription) else { return }

        let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard frameCount > 0,
              let inputBuffer = AVAudioPCMBuffer(
                pcmFormat: inputFormat,
                frameCapacity: frameCount
              ) else { return }
        inputBuffer.frameLength = frameCount

        let copyStatus = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: inputBuffer.mutableAudioBufferList
        )
        guard copyStatus == noErr else {
            emitStatus("warning", ["message": "Unable to copy audio sample", "status": copyStatus])
            return
        }

        if converter == nil || converterInputFormat != inputFormat {
            converter = AVAudioConverter(from: inputFormat, to: outputFormat)
            converterInputFormat = inputFormat
        }
        guard let converter else {
            emitStatus("warning", ["message": "Unable to create AVAudioConverter"])
            return
        }

        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        let outputCapacity = AVAudioFrameCount(ceil(Double(frameCount) * ratio)) + 32
        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: outputFormat,
            frameCapacity: outputCapacity
        ) else { return }

        var didSupplyInput = false
        var conversionError: NSError?
        let status = converter.convert(to: outputBuffer, error: &conversionError) {
            _, inputStatus in
            if didSupplyInput {
                inputStatus.pointee = .noDataNow
                return nil
            }
            didSupplyInput = true
            inputStatus.pointee = .haveData
            return inputBuffer
        }
        guard status != .error else {
            emitStatus("warning", [
                "message": conversionError?.localizedDescription ?? "Audio conversion failed"
            ])
            return
        }

        let buffers = UnsafeMutableAudioBufferListPointer(outputBuffer.mutableAudioBufferList)
        guard let first = buffers.first,
              let bytes = first.mData,
              first.mDataByteSize > 0 else { return }
        FileHandle.standardOutput.write(
            Data(bytes: bytes, count: Int(first.mDataByteSize))
        )
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emitStatus("error", [
            "code": "CAPTURE_STOPPED",
            "message": error.localizedDescription
        ])
    }
}

@main
private struct LecScapeSystemAudioMain {
    static func main() async {
        guard #available(macOS 13.0, *) else {
            emitStatus("error", [
                "code": "UNSUPPORTED_MACOS",
                "message": "LecScape live capture requires macOS 13 or later"
            ])
            exit(64)
        }

        if !CGPreflightScreenCaptureAccess() && !CGRequestScreenCaptureAccess() {
            emitStatus("permission_required", [
                "code": "SCREEN_RECORDING_PERMISSION_REQUIRED",
                "message": "Allow Screen & System Audio Recording, then restart LecScape"
            ])
            exit(77)
        }

        signal(SIGPIPE, SIG_IGN)
        signal(SIGINT, SIG_IGN)
        signal(SIGTERM, SIG_IGN)

        let audioSource = MacSystemAudioSource()
        do {
            try await audioSource.start()
        } catch {
            emitStatus("error", [
                "code": "CAPTURE_START_FAILED",
                "message": error.localizedDescription
            ])
            exit(1)
        }

        let signalQueue = DispatchQueue(label: "com.lecscape.system-audio.signals")
        let signalLock = NSLock()
        var resumed = false
        var sources: [DispatchSourceSignal] = []
        await withCheckedContinuation { continuation in
            sources = [SIGINT, SIGTERM].map { signalNumber in
                let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: signalQueue)
                source.setEventHandler {
                    signalLock.lock()
                    defer { signalLock.unlock() }
                    guard !resumed else { return }
                    resumed = true
                    continuation.resume()
                }
                source.resume()
                return source
            }
        }
        sources.forEach { $0.cancel() }
        await audioSource.stop()
    }
}
