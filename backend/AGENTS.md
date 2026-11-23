# Quy chuẩn Kỹ thuật, Bảo mật API và Hiệu năng Cơ sở dữ liệu cho `backend/`

Khi đọc hoặc chỉnh sửa bất kỳ tệp nào trong `backend/`, bắt buộc kết hợp quy chuẩn gốc tại `../AGENTS.md` với các tiêu chuẩn kiến trúc, bảo mật và hiệu năng máy chủ dưới đây:

---

## 1. Phòng thủ API Đa lớp và Chống Bắt / Sửa Gói tin (`src/auth/`, `src/common/`)

- **Chuỗi Middleware và Guard bảo vệ toàn cục**: Tuyệt đối không vô hiệu hóa hoặc tạo lỗ hổng đi vòng qua chuỗi bảo vệ gồm `SecurityShieldMiddleware` (`src/common/http/security-shield.middleware.ts`), `OriginGuard` (`src/auth/guards/origin.guard.ts`), `RequestIntegrityGuard` (`src/auth/guards/request-integrity.guard.ts`), `JwtAuthGuard` (`src/auth/guards/jwt-auth.guard.ts`), `PermissionsGuard` (`src/auth/guards/permissions.guard.ts`) và `AppThrottlerGuard` (`src/common/throttler/app-throttler.guard.ts`).
- **Toàn vẹn chữ ký Request và Phản ứng chủ động**:
  - Mọi endpoint thay đổi dữ liệu phục vụ ứng dụng web phải được kiểm tra chữ ký `X-PUC-*` gắn với cookie `htx_csrf` và chống phát lại `nonce`.
  - Duy trì cơ chế `SecurityDefenseService` (`src/auth/security-defense.service.ts`): khi phát hiện hành vi dùng proxy (như Burp Suite) sửa payload, phát lại request cũ hoặc quét dò đường dẫn trái phép vượt ngưỡng, hệ thống tự động thu hồi phiên hiện tại, áp trạng thái cách ly tạm thời (`429 SECURITY_QUARANTINED`) và đẩy cảnh báo thời gian thực tới Quản trị viên.
- **Ràng buộc phiên (`Session Binding`) và Cookie an toàn**: Token phiên phải kiểm tra khớp dấu vân tay thiết bị (`User-Agent` / thông tin client rút gọn) tại `JwtAuthGuard`; cookie xác thực luôn giữ `HttpOnly`, `SameSite` chặt và cờ `Secure` theo môi trường sản phẩm.
- **Kiểm tra dữ liệu đầu vào và Che giấu lỗi nội bộ**:
  - Mọi body/query đầu vào phải đi qua DTO có `class-validator` với `ValidationPipe` (`src/common/pipes/validation.pipes.ts`) bật `whitelist: true` và `forbidNonWhitelisted: true`.
  - Bộ lọc `AllExceptionsFilter` (`src/common/errors/all-exceptions.filter.ts`) tuyệt đối không trả mã lỗi `SQLSTATE`, tên bảng/cột PostgreSQL, đường dẫn tệp máy chủ hay `stack trace` ra JSON phản hồi cho client; thông báo lỗi trả về phải ngắn gọn, rõ nghĩa tiếng Việt và an toàn.
- **Giới hạn tần suất (`src/common/throttler/rate-limit.policy.ts`)**: Mọi route mới bắt buộc gắn mức giới hạn tần suất phù hợp (`auth`, `sensitive`, `write`, `public`, `read`), đặc biệt siết chặt ở các luồng đăng nhập, OTP, tải tệp, tra cứu công khai và gửi yêu cầu cấp quyền thanh tra.

---

## 2. Phân quyền Máy chủ (RBAC + Scope) và Kiểm soát Quyền lực Chéo

- **Không bao giờ tin dữ liệu lọc từ Client**: Mọi truy vấn đọc, sửa, xóa bắt buộc áp điều kiện lọc phạm vi thôn/vùng trồng/hộ thành viên ngay trong câu lệnh SQL hoặc tầng Service thông qua `src/common/crud/village-scope.ts` và `src/portal/common/portal-context.ts`.
- **Ba tầng dữ liệu Truy xuất nguồn gốc (`src/traceability/`)**:
  - Luôn phân tách rạch ròi dữ liệu trả về theo 3 cấp độ xác thực: `public` (ẩn thông tin định danh cá nhân nhạy cảm và làm tròn tọa độ khái quát để bảo vệ ranh giới từng hộ), `enterprise` (mở chi tiết vùng nguồn, đối soát định mức đầu vụ, kiểm nghiệm lô) và `authority` / đoàn thanh tra được cấp quyền thực địa hợp lệ (mở hồ sơ hộ tham gia và nhật ký đối chiếu đầy đủ).
- **Kiểm soát chéo cấp Quản trị**: Giữ nghiêm ngặt quy trình phê duyệt đồng thuận giữa Trưởng HTX và Phó HTX đối với các thao tác nhạy cảm (như yêu cầu xóa thành viên khỏi hệ thống tại bảng `member_deletion_requests`), cũng như quyền gửi và nhận thông báo toàn thể đồng bộ hai chiều giữa Trưởng và Phó HTX.

---

## 3. Kỷ luật Kết nối PostgreSQL, Chỉ mục SQL và Bộ nhớ đệm L1

- **Tiết kiệm kết nối Pool (`src/database/`)**:
  - Hạn mức kết nối PostgreSQL trên môi trường triển khai rất chặt (`DB_POOL_MAX` thấp để tránh lỗi `EMAXCONNSESSION`).
  - **Cấm tuyệt đối truy vấn `N+1` trong vòng lặp `for` / `map`**: luôn gộp bằng `JOIN`, `ANY($1::uuid[])` hoặc chèn hàng loạt qua `UNNEST(...)`.
  - Các truy vấn đọc độc lập trong cùng một hàm phải chạy song song bằng `Promise.all([this.db.query(...), ...])` trên pool chung; ngược lại, khi đang giữ một `PoolClient` trong giao dịch (`withTransaction`), các lệnh trên cùng `client` đó phải `await` tuần tự.
- **Kiểm tra cấu trúc bảng và Chỉ mục**:
  - Không gọi lặp `SELECT to_regclass(...)` trực tiếp trong từng request; bắt buộc dùng hàm có bộ nhớ đệm `hasPublicTable()` trong `src/common/sql/schema-cache.ts`.
  - Khi viết điều kiện lọc theo mã (`lot_code`, `plot_code`, `zone_code`), sử dụng biểu thức chuẩn hóa khớp với chỉ mục hàm đã đánh trong `sql/` (ví dụ `upper(btrim(plot_code))`) và tránh bọc `to_jsonb(alias)` lên toàn bộ dòng bảng lớn trong mệnh đề `SELECT`.
- **Đăng ký bảng vào Bộ nhớ đệm L1 (`src/common/cache/app-cache.service.ts`)**:
  - Mỗi khi tạo bảng SQL mới trong `backend/sql/`, **bắt buộc bổ sung tên bảng đó vào từ điển `TABLE_TO_TAGS`** trong `app-cache.service.ts`. Nếu bỏ sót bảng có thao tác ghi (`INSERT`/`UPDATE`/`DELETE`), cơ chế an toàn sẽ xóa trắng toàn bộ L1 cache thay vì chỉ làm mới đúng phân vùng liên quan.

---

## 4. Dữ liệu Thực, Kiểm toán và Sự kiện Thời gian thực (`SSE`)

- Không gán cứng số liệu mẫu trong mã nguồn API; mọi chỉ số tổng hợp, sản lượng lũy kế, hạn mức đầu vụ và kiểm nghiệm phải tính toán chính xác từ dữ liệu thực tế.
- Chặn ngày tương lai đối với nhật ký canh tác nông hộ; lưu đầy đủ thời điểm thực hiện (`entry_on`), thời điểm máy chủ ghi nhận và nhật ký kiểm toán (`audit_logs`) khi cán bộ/quản trị viên thao tác thay đổi hồ sơ.
- Khi phát sinh thay đổi trên lô hàng, phiếu kiểm nghiệm, nhật ký, yêu cầu thanh tra thực địa, thông báo HTX hoặc cảnh báo an ninh, phải phát sự kiện `SSE` tương ứng để giao diện người dùng tự động đồng bộ ngầm tức thì.

---

## 5. Kiểm tra Bắt buộc Trước khi Hoàn tất hoặc Commit

Mỗi khi sửa mã hoặc thêm migration/endpoint trong `backend/`, bắt buộc chạy trọn vẹn chuỗi kiểm tra dưới đây và đảm bảo vượt qua 100% (bao gồm cả bộ test phân quyền, chống giả mạo chữ ký request và lỗ hổng bảo mật trong `backend/test/`):

```bash
cd /home/the/PUC/backend && npm run db:migrate && npm run typecheck && npm run build && npm test
```

