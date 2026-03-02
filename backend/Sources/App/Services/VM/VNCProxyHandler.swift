import Vapor
import NIOCore

public final class VNCProxyHandler: ChannelInboundHandler, @unchecked Sendable {
    public typealias InboundIn = ByteBuffer
    public typealias OutboundOut = ByteBuffer
    
    private let ws: WebSocket
    private let target: String
    private let logger: Logger
    private var isClosed = false

    private var bytesReceived: Int = 0
    private var bytesSent: Int = 0

    public init(ws: WebSocket, logger: Logger, target: String = "unknown") {
        self.ws = ws
        self.logger = logger
        self.target = target
        
        // Listen for WebSocket closure to prevent further writes
        ws.onClose.whenComplete { [weak self] _ in
            self?.isClosed = true
        }
    }

    public func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        // If WebSocket is already closed, don't read more data from TCP
        if isClosed || ws.isClosed {
            return
        }
        
        let buffer = self.unwrapInboundIn(data)
        let readableBytes = buffer.readableBytes
        bytesReceived += readableBytes
        
        // Use synchronous send to preserve strict ordering of VNC frames.
        if let data = buffer.getData(at: 0, length: readableBytes) {
            bytesSent += readableBytes
            
            // Check again before sending
            if !ws.isClosed {
                ws.send(raw: data, opcode: .binary)
            }
        }
    }

    public func errorCaught(context: ChannelHandlerContext, error: Error) {
        logger.error("[VNCProxy] TCP error for \(target): \(error)")
        context.close(promise: nil)
        if !ws.isClosed {
            _ = ws.close(code: .unexpectedServerError)
        }
    }
    
    public func channelInactive(context: ChannelHandlerContext) {
        logger.info("[VNCProxy] TCP connection inactive for \(target). Stats: Rx \(bytesReceived) bytes, Tx \(bytesSent) bytes")
        context.fireChannelInactive()
        if !ws.isClosed {
            _ = ws.close()
        }
    }
}
