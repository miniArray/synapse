/**
 * SSE Transport for Bun
 *
 * Custom implementation since @modelcontextprotocol/sdk's SSEServerTransport
 * expects Node.js http.ServerResponse, not Bun's Response.
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type JSONRPCMessage,
  JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";

export class BunSSETransport implements Transport {
  private controller: ReadableStreamDefaultController<string> | null = null;
  private closed = false;

  readonly sessionId: string;
  readonly stream: ReadableStream<string>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor() {
    this.sessionId = crypto.randomUUID();

    this.stream = new ReadableStream<string>({
      start: (controller) => {
        this.controller = controller;
        // Send endpoint event with session ID
        // Use relative path so client constructs correct URL through proxies
        controller.enqueue(
          `event: endpoint\ndata: messages?sessionId=${this.sessionId}\n\n`,
        );
      },
      cancel: () => {
        this.closed = true;
        this.onclose?.();
      },
    });
  }

  async start(): Promise<void> {
    // Already started in constructor
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || !this.controller) {
      throw new Error("Transport is closed");
    }

    const data = JSON.stringify(message);
    this.controller.enqueue(`event: message\ndata: ${data}\n\n`);
  }

  async handleMessage(body: unknown): Promise<void> {
    const message = JSONRPCMessageSchema.parse(body);
    this.onmessage?.(message);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.controller?.close();
    this.onclose?.();
  }

  get response(): Response {
    return new Response(this.stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
