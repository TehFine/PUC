import { badRequest } from "../common/errors/app.exception";

/** Trần dung lượng tệp ảnh tĩnh đơn lẻ (5 MB - ảnh từ giao diện chuẩn đã nén còn ~100-250 KB). */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Chiều rộng hoặc chiều cao tối đa cho phép của ảnh (chặn Pixel Bomb). */
export const MAX_IMAGE_DIMENSION_PX = 8192;
/** Tổng số điểm ảnh tối đa cho phép (28 Megapixels - chặn ảnh nén kích thước khung khổng lồ gây tràn RAM trình duyệt). */
export const MAX_IMAGE_TOTAL_PIXELS = 28_000_000;

export interface SanitizedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  strippedMetadata: boolean;
}

function assertSafeDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw badRequest("Tệp hình ảnh bị hỏng hoặc thiếu thông tin kích thước khung hình.");
  }
  if (
    width > MAX_IMAGE_DIMENSION_PX ||
    height > MAX_IMAGE_DIMENSION_PX ||
    width * height > MAX_IMAGE_TOTAL_PIXELS
  ) {
    throw badRequest(
      `Kích thước khung ảnh (${width}x${height}) vượt ngưỡng an toàn cho phép (${MAX_IMAGE_DIMENSION_PX}px). Vui lòng dùng ảnh thông thường.`,
    );
  }
}

/**
 * Đọc cờ xoay ảnh EXIF (Orientation 1..8) nếu có trong phân đoạn APP1 của JPEG
 * để giữ đúng chiều xoay hiển thị mà vẫn xóa sạch 100% GPS, tên máy, số sê-ri, ngày chụp và ảnh thu nhỏ ẩn.
 */
function extractJpegExifOrientation(app1Payload: Buffer): number {
  // app1Payload bắt đầu ngay sau 2 byte độ dài của marker FF E1: "Exif\0\0" + TIFF header
  if (app1Payload.length < 14) return 1;
  if (
    app1Payload[0] !== 0x45 || // E
    app1Payload[1] !== 0x78 || // x
    app1Payload[2] !== 0x69 || // i
    app1Payload[3] !== 0x66 || // f
    app1Payload[4] !== 0x00 ||
    app1Payload[5] !== 0x00
  ) {
    return 1;
  }

  const tiffStart = 6;
  const byteOrder = app1Payload.readUInt16BE(tiffStart);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return 1;

  const readU16 = (offset: number) =>
    littleEndian ? app1Payload.readUInt16LE(offset) : app1Payload.readUInt16BE(offset);
  const readU32 = (offset: number) =>
    littleEndian ? app1Payload.readUInt32LE(offset) : app1Payload.readUInt32BE(offset);

  if (tiffStart + 8 > app1Payload.length) return 1;
  if (readU16(tiffStart + 2) !== 0x002a) return 1;

  const ifdOffset = readU32(tiffStart + 4);
  const ifdPos = tiffStart + ifdOffset;
  if (ifdPos + 2 > app1Payload.length) return 1;

  const entryCount = readU16(ifdPos);
  for (let i = 0; i < entryCount; i += 1) {
    const entryPos = ifdPos + 2 + i * 12;
    if (entryPos + 12 > app1Payload.length) break;
    const tag = readU16(entryPos);
    if (tag === 0x0112) {
      const format = readU16(entryPos + 2);
      if (format === 3) {
        const val = readU16(entryPos + 8);
        if (val >= 2 && val <= 8) return val;
      }
      return 1;
    }
  }
  return 1;
}

/** Tạo phân đoạn APP1 tối giản 36 byte chỉ chứa duy nhất thẻ Orientation (không GPS, không PII). */
function buildMinimalOrientationApp1Segment(orientation: number): Buffer {
  const seg = Buffer.alloc(36);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg.writeUInt16BE(34, 2); // độ dài = 34 byte (từ byte 2 đến hết)
  seg.write("Exif\0\0", 4, "ascii");
  // Big-endian TIFF header tại offset 10
  seg.write("MM", 10, "ascii");
  seg.writeUInt16BE(0x002a, 12);
  seg.writeUInt32BE(8, 14); // IFD0 tại offset +8 (tức byte 18)
  seg.writeUInt16BE(1, 18); // 1 entry duy nhất
  seg.writeUInt16BE(0x0112, 20); // Tag = Orientation
  seg.writeUInt16BE(3, 22); // Type = SHORT
  seg.writeUInt32BE(1, 24); // Count = 1
  seg.writeUInt16BE(orientation, 28); // Value
  seg.writeUInt16BE(0, 30); // Padding
  seg.writeUInt32BE(0, 32); // Next IFD = 0
  return seg;
}

function isSofMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function isSensitiveJpegMetadataMarker(marker: number): boolean {
  // Bóc sạch APP1 (EXIF/GPS/XMP), APP3..APP13 (IPTC/Photoshop/Meta), APP15 và COM (0xFE).
  // Giữ lại APP0 (JFIF - 0xE0), APP2 (ICC_PROFILE - 0xE2) và APP14 (Adobe màu - 0xEE).
  if (marker === 0xe1 || marker === 0xfe || marker === 0xef) return true;
  if (marker >= 0xe3 && marker <= 0xed) return true;
  return false;
}

function sanitizeJpeg(buffer: Buffer): SanitizedImageResult {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw badRequest("Tệp JPEG không hợp lệ.");
  }

  const keptChunks: Buffer[] = [buffer.subarray(0, 2)]; // FF D8 (SOI)
  let pos = 2;
  let width = 0;
  let height = 0;
  let foundSos = false;
  let stripped = false;
  let preservedOrientation = 1;

  while (pos < buffer.length) {
    if (buffer[pos] !== 0xff) {
      throw badRequest("Cấu trúc tệp JPEG không hợp lệ.");
    }
    while (pos < buffer.length && buffer[pos] === 0xff) {
      pos += 1;
    }
    if (pos >= buffer.length) break;

    const marker = buffer[pos]!;
    pos += 1;

    if (marker === 0xd9) {
      // EOI
      keptChunks.push(Buffer.from([0xff, 0xd9]));
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
      keptChunks.push(Buffer.from([0xff, marker]));
      continue;
    }

    if (pos + 2 > buffer.length) {
      throw badRequest("Tệp JPEG bị cắt cụt.");
    }
    const segLen = buffer.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > buffer.length) {
      throw badRequest("Phân đoạn tệp JPEG không hợp lệ.");
    }

    const fullSegStart = pos - 2;
    const fullSegEnd = pos + segLen;

    if (isSofMarker(marker)) {
      if (segLen < 7) {
        throw badRequest("Thông tin khung hình JPEG không hợp lệ.");
      }
      height = buffer.readUInt16BE(pos + 3);
      width = buffer.readUInt16BE(pos + 5);
      assertSafeDimensions(width, height);
    }

    if (marker === 0xda) {
      // SOS: phần dữ liệu điểm ảnh nén kéo dài tới hết tệp
      if (width === 0 || height === 0) {
        throw badRequest("Tệp JPEG thiếu thông tin kích thước khung hình.");
      }
      foundSos = true;
      keptChunks.push(buffer.subarray(fullSegStart));
      break;
    }

    if (isSensitiveJpegMetadataMarker(marker)) {
      stripped = true;
      if (marker === 0xe1 && preservedOrientation === 1) {
        preservedOrientation = extractJpegExifOrientation(buffer.subarray(pos + 2, fullSegEnd));
      }
    } else {
      keptChunks.push(buffer.subarray(fullSegStart, fullSegEnd));
    }

    pos = fullSegEnd;
  }

  if (!foundSos || width === 0 || height === 0) {
    throw badRequest("Tệp JPEG không chứa dữ liệu điểm ảnh hợp lệ.");
  }

  if (!stripped) {
    return { buffer, width, height, strippedMetadata: false };
  }

  if (preservedOrientation >= 2 && preservedOrientation <= 8) {
    // Chèn lại duy nhất cờ xoay 36 byte ngay sau SOI (FF D8)
    keptChunks.splice(1, 0, buildMinimalOrientationApp1Segment(preservedOrientation));
  }

  return {
    buffer: Buffer.concat(keptChunks),
    width,
    height,
    strippedMetadata: true,
  };
}

const STRIPPED_PNG_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "dSIG"]);

function sanitizePng(buffer: Buffer): SanitizedImageResult {
  if (buffer.length < 33) {
    throw badRequest("Tệp PNG quá ngắn hoặc bị hỏng.");
  }

  const keptChunks: Buffer[] = [buffer.subarray(0, 8)];
  let pos = 8;
  let width = 0;
  let height = 0;
  let seenIhdr = false;
  let seenIdat = false;
  let seenIend = false;
  let stripped = false;

  while (pos + 8 <= buffer.length) {
    const chunkLen = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const totalChunkBytes = 12 + chunkLen;
    if (chunkLen > 0x7fffffff || pos + totalChunkBytes > buffer.length) {
      throw badRequest("Cấu trúc tệp PNG bị cắt cụt hoặc không hợp lệ.");
    }

    if (type === "IHDR") {
      if (seenIhdr || chunkLen !== 13) {
        throw badRequest("Header IHDR của tệp PNG không hợp lệ.");
      }
      seenIhdr = true;
      width = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
      assertSafeDimensions(width, height);
    } else if (!seenIhdr) {
      throw badRequest("Tệp PNG thiếu header IHDR ở đầu tệp.");
    }

    if (type === "IDAT") {
      seenIdat = true;
    }

    if (STRIPPED_PNG_CHUNKS.has(type)) {
      stripped = true;
    } else {
      keptChunks.push(buffer.subarray(pos, pos + totalChunkBytes));
    }

    pos += totalChunkBytes;
    if (type === "IEND") {
      seenIend = true;
      break;
    }
  }

  if (!seenIhdr || !seenIdat || !seenIend) {
    throw badRequest("Tệp PNG không đầy đủ dữ liệu hình ảnh.");
  }

  if (!stripped && pos === buffer.length) {
    return { buffer, width, height, strippedMetadata: false };
  }

  return {
    buffer: Buffer.concat(keptChunks),
    width,
    height,
    strippedMetadata: true,
  };
}

function parseWebpDimensions(chunkFourCc: string, payload: Buffer): { width: number; height: number } | null {
  if (chunkFourCc === "VP8X") {
    if (payload.length < 10) return null;
    const width = 1 + payload.readUIntLE(4, 3);
    const height = 1 + payload.readUIntLE(7, 3);
    return { width, height };
  }
  if (chunkFourCc === "VP8 ") {
    if (payload.length < 10) return null;
    // Keyframe start code 0x9d 0x01 0x2a tại byte 3..5
    if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) return null;
    const width = payload.readUInt16LE(6) & 0x3fff;
    const height = payload.readUInt16LE(8) & 0x3fff;
    return { width, height };
  }
  if (chunkFourCc === "VP8L") {
    if (payload.length < 5 || payload[0] !== 0x2f) return null;
    const b1 = payload[1]!;
    const b2 = payload[2]!;
    const b3 = payload[3]!;
    const b4 = payload[4]!;
    const width = 1 + (b1 | ((b2 & 0x3f) << 8));
    const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    return { width, height };
  }
  return null;
}

function sanitizeWebp(buffer: Buffer): SanitizedImageResult {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw badRequest("Tệp WEBP không hợp lệ.");
  }

  const declaredRiffSize = buffer.readUInt32LE(4);
  const riffEnd = Math.min(buffer.length, 8 + declaredRiffSize);
  if (riffEnd < 20) {
    throw badRequest("Tệp WEBP bị hỏng.");
  }

  const keptChunks: Buffer[] = [];
  let pos = 12;
  let width = 0;
  let height = 0;
  let stripped = false;

  while (pos + 8 <= riffEnd) {
    const fourCc = buffer.toString("ascii", pos, pos + 4);
    const chunkSize = buffer.readUInt32LE(pos + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    if (pos + 8 + chunkSize > riffEnd) {
      throw badRequest("Phân đoạn tệp WEBP bị cắt cụt.");
    }

    const payload = buffer.subarray(pos + 8, pos + 8 + chunkSize);
    if (width === 0 && (fourCc === "VP8X" || fourCc === "VP8 " || fourCc === "VP8L")) {
      const dims = parseWebpDimensions(fourCc, payload);
      if (dims) {
        width = dims.width;
        height = dims.height;
        assertSafeDimensions(width, height);
      }
    }

    if (fourCc === "EXIF" || fourCc === "XMP ") {
      stripped = true;
    } else if (fourCc === "VP8X" && payload.length >= 10) {
      // Tắt cờ EXIF (0x08) và XMP (0x04) trên header mở rộng VP8X
      const copy = Buffer.from(buffer.subarray(pos, Math.min(riffEnd, pos + 8 + paddedSize)));
      copy[8] = copy[8]! & ~0x0c;
      keptChunks.push(copy);
    } else {
      const endPos = Math.min(riffEnd, pos + 8 + paddedSize);
      keptChunks.push(buffer.subarray(pos, endPos));
    }

    pos += 8 + paddedSize;
  }

  if (width === 0 || height === 0) {
    throw badRequest("Tệp WEBP thiếu thông tin kích thước khung hình.");
  }

  if (!stripped) {
    return { buffer, width, height, strippedMetadata: false };
  }

  const bodyLen = keptChunks.reduce((sum, c) => sum + c.length, 4); // +4 cho chuỗi "WEBP"
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(bodyLen, 4);
  header.write("WEBP", 8, "ascii");

  return {
    buffer: Buffer.concat([header, ...keptChunks]),
    width,
    height,
    strippedMetadata: true,
  };
}

/**
 * Xác thực kích thước khung hình (chặn Pixel Bomb) và bóc sạch toàn bộ siêu dữ liệu nhạy cảm
 * (EXIF GPS tọa độ nhà riêng, số sê-ri thiết bị, XMP, IPTC, bình luận ẩn) khỏi tệp ảnh trước khi lưu.
 */
export function sanitizeAndValidateImageBuffer(
  buffer: Buffer,
  mimeType: string,
): SanitizedImageResult {
  if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    throw badRequest(
      `Tệp hình ảnh vượt quá giới hạn ${Math.round(MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    );
  }
  if (mimeType === "image/jpeg") return sanitizeJpeg(buffer);
  if (mimeType === "image/png") return sanitizePng(buffer);
  if (mimeType === "image/webp") return sanitizeWebp(buffer);
  throw badRequest("Định dạng ảnh không được hỗ trợ.");
}

