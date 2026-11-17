const CHUNK_RELOAD_STORAGE_KEY = "puc_chunk_reload_ts";
const RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  return (
    name === "ChunkLoadError" ||
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Tải gói mã tách rời (`next/dynamic`) an toàn trước lỗi mạng chập chờn và lệch phiên bản triển khai Vercel:
 * 1. Tự động thử lại tối đa 2 lần ngay trong bộ nhớ nếu sóng di động chập chờn (giữ nguyên khung Skeleton, không văng ra trang lỗi).
 * 2. Nếu gói mã cũ trên Vercel đã bị thay thế sau đợt deploy mới (trả 404 ChunkLoadError), tự tải lại trang êm ái
 *    ngay trên khung chờ hiện tại thay vì chớp màn hình lỗi 1 giây.
 */
export async function lazyChunk<T>(loader: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  const delays = [0, 350, 800];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await waitMs(delays[attempt]);
    }
    try {
      return await loader();
    } catch (err) {
      lastError = err;
      if (!isChunkLoadFailure(err)) {
        throw err;
      }
    }
  }

  if (typeof window !== "undefined" && isChunkLoadFailure(lastError)) {
    // Tuyệt đối không tự động tải lại trang khi điện thoại nông hộ đang mất sóng hoàn toàn ở ngoài rẫy
    // (sẽ làm văng ra màn hình mất mạng của trình duyệt và mất dữ liệu đang nhập).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw lastError;
    }
    try {
      const prev = Number(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) || "0");
      const now = Date.now();
      if (now - prev > RELOAD_COOLDOWN_MS) {
        window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
        window.location.reload();
        // Giữ trạng thái chờ (Skeleton) trong lúc trình duyệt điều hướng tải lại bản mới,
        // tránh chớp màn hình lỗi / 404 trong ~1 giây chuyển tiếp.
        return new Promise<T>(() => {});
      }
    } catch {
      // Nếu sessionStorage bị chặn thì ném lỗi về Error Boundary xử lý.
    }
  }

  throw lastError;
}

