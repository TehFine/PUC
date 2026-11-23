<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quy chuẩn Kỹ thuật, Giao diện và Bảo mật Bắt buộc cho `frontend/`

Khi đọc hoặc chỉnh sửa bất kỳ tệp nào trong `frontend/`, bắt buộc kết hợp quy chuẩn gốc tại `../AGENTS.md` với các ràng buộc kỹ thuật trực tiếp dưới đây (luôn giữ nguyên khối `nextjs-agent-rules` ở đầu tệp để `next dev` không làm bẩn cây Git):

### 1. Giao diện, Phông chữ và Đa thiết bị (`src/app/`, `src/components/`)

- **Phông chữ và Con số**: Đảm bảo phông **Bai Jamjuree** áp dụng xuyên suốt mọi thành phần, bao gồm cả `input::placeholder`, `textarea::placeholder`, nhãn biểu đồ SVG và nút bấm; bật `font-variant-numeric: tabular-nums` cho mọi mã định danh, diện tích, sản lượng, ngày giờ.
- **Tài nguyên Icon**: Chỉ sử dụng icon chức năng sẵn có trong `frontend/public/` thông qua `src/components/ui/PublicIcon.tsx`; không chèn emoji, không vẽ hộp icon nền pastel, không dùng viền tròn quanh mũi tên điều hướng, không dùng `border-left` tô màu hay chấm tròn `dot`, và bỏ `outline` mặc định gây lem khi focus/click (thay bằng trạng thái viền/bóng tinh tế đồng bộ).
- **Bo góc đúng phân khu**: Giữ nguyên `border-radius: 0` tuyệt đối trên toàn bộ `LandingPage` (`.lp`, `.sw-*`, `.eh-*`); dùng `4px` đến `6px` cho nút/ô nhập/nhãn và `6px` đến `8px` cho thẻ/popup/modal ở `/portal`, `/admin`, `/login`.
- **Laptop kết hợp Mobile, Nút Back và F5**:
  - Kiểm tra hiển thị trên cả khung nhìn Laptop và Mobile; đảm bảo bàn phím ảo không che ô nhập cuối hộp thoại (`src/lib/keyboard-scroll.ts`).
  - Giữ cơ chế đóng popup/bottom sheet/drawer trước khi rời trang khi người dùng bấm nút Quay lại (`src/lib/back-navigation.ts`), và lưu/khôi phục đúng tab/phân mục hiện hành khi bấm `Reload / F5`.
- **Hồ sơ Truy xuất Khổ A4 (`src/app/t/[token]` và `src/app/trace/[code]/TraceView.tsx`)**:
  - Khung hồ sơ giữ tỷ lệ chuẩn tờ A4 trên cả Desktop, Mobile (co giãn đúng tỷ lệ A4, cho phép zoom) và bản in; tự động chia thành nhiều trang A4 liên tiếp khi dữ liệu mở rộng theo quyền mà không cắt ngang dòng bảng.
  - Mọi nút thao tác (ngôn ngữ `vi`/`en`/`zh`, đăng nhập, gửi yêu cầu cấp quyền thanh tra thực địa, in hồ sơ) đặt ngoài tờ A4. Bản đồ vùng nguồn (`src/app/trace/[code]/CoarseZoneOverviewMap.tsx`) hiển thị ảnh vệ tinh thực tế, không phụ thuộc Google Fonts/Maps bị chặn tại Trung Quốc.

### 2. Gọi API Ký số, Đồng bộ Ngầm và Chống Gọi Lặp (`src/lib/`, `src/hooks/`)

- **Bắt buộc đi qua Client Ký số**: Mọi lệnh gọi API thay đổi dữ liệu (`POST`, `PUT`, `PATCH`, `DELETE`, kể cả `FormData` tải tệp hoặc đồng bộ ngoại tuyến tại `src/lib/offline-sync.ts`) phải dùng `apiFetch` trong `src/lib/api-client.ts` hoặc `buildSignedSecurityHeaders` trong `src/lib/request-security.ts` để đính kèm đầy đủ `X-PUC-Timestamp`, `X-PUC-Nonce`, `X-PUC-Payload-Hash`, `X-PUC-Signature` khớp với cookie `htx_csrf`.
- **Tránh gọi API thừa và 401 vô ích**:
  - Dùng chung cache truy vấn qua `useApi` (`src/hooks/use-api.ts`); không gọi song song cùng một endpoint ở cả component cha và con.
  - Chỉ bật `enabled: true` cho các endpoint cần quyền sau khi trạng thái phiên đăng nhập đã xác định (`Boolean(user)`), tránh bắn request lỗi `401` lúc trang công khai vừa tải.
- **Đồng bộ thời gian thực êm (`SSE`)**: Tận dụng kết nối sự kiện thời gian thực và cơ chế làm mới ngầm khi quay lại tab trong `src/hooks/use-api.ts`, `src/hooks/use-portal.ts`, `src/lib/realtime-notifications.ts` và `TraceView.tsx` để số liệu luôn tự cập nhật mà không cần reload trang.

### 3. Bảo mật Giao diện và Tối ưu Gói Tải (Bundle Performance)

- **Chống lưu mật khẩu và rò rỉ bộ nhớ**:
  - Mọi form đăng nhập, đổi mật khẩu, xác thực 2FA/OTP, cấp tài khoản, nhập CCCD bắt buộc đặt `<form autoComplete="off">` và gắn `autoComplete="off"`, `data-lpignore="true"`, `data-1p-ignore="true"`, `spellCheck={false}` trên từng ô nhạy cảm.
  - Xóa sạch state mật khẩu/OTP/mã khôi phục ngay sau khi gửi hoặc đóng modal và khi sự kiện `pagehide` kích hoạt; tự động xóa khay nhớ tạm (`clipboard`) sau 45 giây khi sao chép mật khẩu tạm hoặc mã dự phòng.
  - Giữ nguyên cấu hình `productionBrowserSourceMaps: false` và bộ header bảo mật CSP/frame-ancestors trong `src/lib/csp.ts` và `next.config.ts`.
- **Tải lười thư viện nặng**: Không `import` tĩnh các thư viện nặng như `leaflet`, `qrcode` hay các phân hệ biểu đồ/bản đồ quản trị ở cấp đầu tệp của màn hình chính; luôn dùng `await import(...)` bên trong `useEffect`/hàm xử lý hoặc `next/dynamic` (`ssr: false`).

### 4. Kiểm tra Bắt buộc Trước khi Hoàn tất hoặc Commit

Mỗi khi sửa mã trong `frontend/`, bắt buộc chạy kiểm tra và đảm bảo không có bất kỳ lỗi nào trước khi kết thúc hoặc tạo commit:

```bash
cd /home/the/PUC/frontend && npx tsc --noEmit && npm run lint && npm run build
```
