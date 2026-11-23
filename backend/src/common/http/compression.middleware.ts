import { createHash } from "node:crypto";
import { constants as zlibConstants, gzip as zlibGzip } from "node:zlib";
import type { NextFunction, Request, Response } from "express";

const MIN_COMPRESS_BYTES = 1024;
const COMPRESSIBLE_CONTENT_TYPE = /^(?:application\/(?:json|geo\+json|problem\+json)|text\/|image\/svg\+xml)\b/i;

function computeWeakEtag(buf: Buffer): string {
  const digest = createHash("sha1").update(buf).digest("base64url").slice(0, 20);
  return `W/"${buf.byteLength.toString(16)}-${digest}"`;
}

function matchesIfNoneMatch(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(",") : header;
  if (raw.trim() === "*") return true;
  const normalizeWeak = (token: string) => token.trim().replace(/^W\//i, "");
  const target = normalizeWeak(etag);
  for (const part of raw.split(",")) {
    if (normalizeWeak(part) === target) return true;
  }
  return false;
}

function acceptsGzip(header: string | string[] | undefined): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(",") : header;
  for (const part of raw.split(",")) {
    const [encoding, ...params] = part.trim().toLowerCase().split(";");
    if (encoding !== "gzip" && encoding !== "*") continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (qParam) {
      const q = Number.parseFloat(qParam.slice(2));
      if (Number.isNaN(q) || q <= 0) continue;
    }
    if (encoding === "gzip") return true;
  }
  return false;
}

/**
 * Nén bất đồng bộ phản hồi JSON / GeoJSON / văn bản >= 1 KB bằng gzip tích hợp sẵn của Node (`node:zlib`)
 * trên thread pool của libuv để không chặn Event Loop, đồng thời bỏ qua luồng xác thực và tệp nhị phân.
 */
export function apiCompressionMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (
    req.path.startsWith("/api/auth") ||
    req.path.startsWith("/api/uploads") ||
    req.path.startsWith("/api/public/files") ||
    req.path === "/api/notifications/stream"
  ) {
    next();
    return;
  }

  const originalSend = res.send;
  res.send = function compressedSend(this: Response, body?: unknown): Response {
    if (!this.headersSent) {
      this.vary("Accept-Encoding");
      this.vary("Cookie");
    }

    let preparedBuf: Buffer | null = null;
    const isGetOrHead = req.method === "GET" || req.method === "HEAD";
    if (
      !this.headersSent &&
      isGetOrHead &&
      this.statusCode === 200 &&
      !req.headers.range &&
      !this.getHeader("ETag") &&
      (typeof body === "string" || Buffer.isBuffer(body))
    ) {
      preparedBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
      const etag = computeWeakEtag(preparedBuf);
      this.setHeader("ETag", etag);
      if (matchesIfNoneMatch(req.headers["if-none-match"], etag)) {
        this.status(304);
        this.removeHeader("Content-Type");
        this.removeHeader("Content-Length");
        this.removeHeader("Content-Encoding");
        return originalSend.call(this, "");
      }
    }

    if (
      req.method === "HEAD" ||
      req.headers.range ||
      this.headersSent ||
      this.statusCode < 200 ||
      this.statusCode === 204 ||
      this.statusCode === 304 ||
      this.getHeader("Content-Encoding") ||
      !acceptsGzip(req.headers["accept-encoding"]) ||
      (typeof body !== "string" && !Buffer.isBuffer(body))
    ) {
      return originalSend.call(this, body);
    }

    const rawBuffer = preparedBuf ?? (Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"));
    if (rawBuffer.byteLength < MIN_COMPRESS_BYTES) {
      return originalSend.call(this, body);
    }

    let contentType = String(this.getHeader("Content-Type") ?? "");
    if (!contentType && typeof body === "string") {
      contentType = "text/html; charset=utf-8";
      this.setHeader("Content-Type", contentType);
    }

    if (!COMPRESSIBLE_CONTENT_TYPE.test(contentType)) {
      return originalSend.call(this, body);
    }

    this.send = originalSend;
    zlibGzip(
      rawBuffer,
      { level: 4, memLevel: 8, strategy: zlibConstants.Z_DEFAULT_STRATEGY },
      (err, compressed) => {
        if (this.destroyed || this.writableEnded) return;
        if (err || compressed.byteLength >= rawBuffer.byteLength) {
          originalSend.call(this, body);
          return;
        }
        if (!this.headersSent) {
          this.setHeader("Content-Encoding", "gzip");
          this.removeHeader("Content-Length");
        }
        originalSend.call(this, compressed);
      },
    );
    return this;
  };

  next();
}

