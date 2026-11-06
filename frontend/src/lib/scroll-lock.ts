let lockCount = 0;
let savedHtmlOverflow = "";

/**
 * Khóa cuộn ở tầng root (`<html>`) khi mở popup/sheet/modal mà không đặt `overflow: hidden` lên `<body>`.
 * Điều này giúp nội dung đang hiển thị phía sau và thanh header luôn giữ nguyên vị trí, không bị đẩy thụt lên trên.
 */
export function lockRootScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const html = document.documentElement;
  if (lockCount === 0) {
    savedHtmlOverflow = html.style.overflow;
    html.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released || typeof document === "undefined") return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = savedHtmlOverflow;
    }
  };
}

