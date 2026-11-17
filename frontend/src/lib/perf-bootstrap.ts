/*
 * Đoạn script khởi tạo chạy trước khi vẽ trang để gắn `data-net` / `data-perf` lên thẻ <html>
 * (giảm hiệu ứng nặng trên máy yếu, mạng chậm).
 *
 * Mô-đun thuần, không phụ thuộc trình duyệt hay alias đường dẫn: được dùng chung bởi `app/layout.tsx`
 * (chèn nội dung script) và `next.config.ts` (tính mã băm SHA-256 cho CSP `script-src`), nên chuỗi script
 * phải là hằng số tĩnh, không chứa dữ liệu động theo từng request.
 */

const NET_DETECT_EXPR =
  '(!n.onLine?"offline":(c&&(c.effectiveType==="2g"||c.effectiveType==="slow-2g"||((c.rtt||0)>=1000&&(c.downlink||10)>0&&(c.downlink||10)<0.5))?"slow":"good"))';

/**
 * Tạo nội dung script khởi tạo. `allowNetOverride` chỉ bật ở môi trường phát triển để thử giao diện
 * mạng yếu qua `?net=slow|offline|good`; trên production tham số `?net=` bị bỏ qua hoàn toàn.
 */
export function buildPerfBootstrapScript(allowNetOverride: boolean): string {
  const head = allowNetOverride
    ? '(function(){try{var d=document.documentElement,sp=new URLSearchParams(location.search),qp=sp.get("perf"),qn=sp.get("net"),n=navigator,c=n.connection;'
    : '(function(){try{var d=document.documentElement,sp=new URLSearchParams(location.search),qp=sp.get("perf"),n=navigator,c=n.connection;';
  const netAssign = allowNetOverride
    ? `var net=(qn==="slow"||qn==="offline"||qn==="good")?qn:${NET_DETECT_EXPR};`
    : `var net=${NET_DETECT_EXPR};`;
  const tail =
    'd.dataset.net=net;if(qp==="lite"||qp==="full"){d.dataset.perf=qp;return;}var l=net!=="good"||(n.hardwareConcurrency>0&&n.hardwareConcurrency<=4)||(n.deviceMemory>0&&n.deviceMemory<=4)||!!(c&&c.saveData)||(typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches);d.dataset.perf=l?"lite":"full";}catch(e){}})();';
  return `${head}${netAssign}${tail}`;
}

/** Nội dung script dùng cho bản build hiện tại (cùng giá trị `NODE_ENV` ở cả lúc dựng trang lẫn lúc tính CSP). */
export const PERF_BOOTSTRAP_SCRIPT = buildPerfBootstrapScript(process.env.NODE_ENV === "development");
