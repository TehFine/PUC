# Backend – HTX API

NestJS 11 (Express) + TypeScript, PostgreSQL/PostGIS (`pg` thuần + SQL migration), xác thực JWT (cookie httpOnly), phân quyền theo vai trò bằng guard, kiểm tra đầu vào bằng class-validator.

## Chạy

```bash
docker compose up -d db          # ở thư mục gốc (PostGIS)
cp .env.example .env
npm install
npm run db:migrate               # áp dụng db/migrations/*.sql
npm run db:seed                  # dữ liệu mẫu + tài khoản (chỉ khi bảng users còn trống)
npm run dev                      # http://localhost:4000
```

### Chạy không cần Docker / PostgreSQL

```bash
npm install
npm run dev:local                # PostgreSQL nhúng + migrate + seed + API (http://localhost:4000)
```

Dữ liệu lưu ở `backend/.local-db` (xóa thư mục này để làm lại từ đầu). Bản PostgreSQL nhúng **không có PostGIS** nên các API bản đồ `/api/plots*` không lưu được dữ liệu; các tab còn lại hoạt động bình thường. Cần bản đồ đầy đủ thì dùng Docker hoặc cài PostgreSQL + PostGIS rồi chạy theo cách ở trên.

| Script | Mô tả |
|---|---|
| `npm run dev` | `nest start --watch` (cần PostgreSQL + `.env`) |
| `npm run dev:local` | PostgreSQL nhúng + seed + `nest start --watch`, không cần `.env` |
| `npm run build` / `start` | `nest build` / `node dist/main.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest + Supertest trên PostgreSQL nhúng (không cần Docker) |

## Tài khoản mẫu (mật khẩu = `SEED_PASSWORD`)

| Tên đăng nhập | Vai trò |
|---|---|
| `0901234567` | Quản trị viên |
| `0912345678` | Cán bộ HTX |
| `0923456789` | Kiểm tra viên |
| `0934567890`, `0945678901` | Cán bộ Thôn (Thôn 1 / Thôn 2) |
| `0956789012` | Nông dân (đang bị khóa) |
| `0905123456` | Hộ dân – Nguyễn Văn An (vào cổng hộ dân `/portal`) |
| `0912234567` | Hộ dân – Trần Thị Bình (vào cổng hộ dân `/portal`) |

Tài khoản nông dân gắn với một hộ qua `users.household_id` (migration `003_portal.sql` tự liên kết tài khoản có tên đăng nhập trùng số điện thoại của hộ). `npm run db:seed` / `dev:local` luôn bổ sung các tài khoản hộ dân mẫu còn thiếu, kể cả trên CSDL đã seed từ trước.

## Bảo mật

- Access token JWT (15 phút) + refresh token ngẫu nhiên (lưu băm SHA-256, xoay vòng, phát hiện dùng lại), cả hai trong cookie `httpOnly`, `SameSite=Lax`.
- Khóa tạm 15 phút sau 5 lần đăng nhập sai; giới hạn tần suất đăng nhập và toàn API.
- Chống CSRF bằng kiểm tra `Origin` cho request ghi; `helmet`; thông báo lỗi không lộ chi tiết nội bộ.
- Vai trò và trạng thái được đọc lại từ DB ở mỗi request – khóa tài khoản có hiệu lực ngay.
- Mọi thao tác thay đổi dữ liệu ghi vào `audit_logs`.

## API

Danh sách trả `{ data, total, page, pageSize }` (`?page=&pageSize=&q=`); lỗi trả `{ error, code, details? }`.

| Nhóm | Endpoint |
|---|---|
| Xác thực | `POST /api/auth/login`, `/refresh`, `/logout`, `/change-password`; `GET /api/auth/me` |
| Đăng ký hộ dân (công khai, tối đa 5 lần/giờ/IP) | `POST /api/auth/register` tạo tài khoản nông dân ở trạng thái `pending` (chưa đăng nhập được, mã lỗi `ACCOUNT_PENDING`) |
| Duyệt đăng ký (quản trị viên, cán bộ HTX) | `GET /api/registrations`, `GET /api/registrations/households?q=` (hộ chưa có tài khoản), `POST /api/registrations/:id/approve` (`{ householdId }`), `POST /api/registrations/:id/reject` |
| Thửa đất (PostGIS) | `/api/plots*` |
| Cổng hộ dân (chỉ vai trò nông dân, luôn giới hạn theo hộ của tài khoản) | `/api/portal/{overview,plots,journal,spray,lab-tests,schedule,violations,harvest,approvals}`; ghi: `POST /api/portal/{journal,spray,approvals}` |
| CRUD | `households`, `approvals`, `schedule`, `minutes`, `journal`, `violations`, `spray`, `testing`, `harvest`, `training`, `pesticides`, `varieties`, `villages`, `accounts`, `audit-log` (chỉ đọc) |
| Công khai (không cần đăng nhập, chỉ số liệu tổng hợp và danh mục dùng chung, cache 5 phút) | `GET /api/public/overview` (số hộ, thôn, thửa, diện tích), `GET /api/public/catalog` (thuốc BVTV, giống, tập huấn sắp tới), `GET /api/public/villages` (id, tên thôn cho biểu mẫu đăng ký); phục vụ trang giới thiệu `/` |
| Sức khỏe | `GET /api/health` |

Ma trận quyền: [src/auth/permissions.ts](src/auth/permissions.ts), áp dụng bằng `@Authorize(resource, action)`. Cán bộ Thôn chỉ thấy/ghi dữ liệu thôn mình; `accounts` và `audit-log` chỉ quản trị viên.

## Cấu trúc

```
db/migrations/        SQL migration (001 core, 002 PostGIS)
db/seeds/             dữ liệu thửa mẫu
src/main.ts           khởi động; app.setup.ts: helmet, CORS, cookie, giới hạn body (dùng chung với test)
src/app.module.ts     ghép module + guard/pipe/filter toàn cục
src/config/           biến môi trường (class-validator)
src/database/         DatabaseModule (pool pg), migrate, seed, cli
src/auth/             AuthModule, guard (Origin → JWT → quyền), @Public/@Authorize, ma trận quyền
src/audit/            AuditService (ghi audit_logs)
src/common/           CRUD cơ sở (service + controller factory), pipe, filter lỗi, decorator kiểm tra
src/resources/<nhóm>/ mỗi nhóm một module: controller + service + DTO (15 nhóm)
src/plots/            thửa đất (PostGIS) + kết quả đo
tests/                Jest + Supertest (PostgreSQL nhúng)
```

Thêm một nhóm dữ liệu mới: tạo `dto` (class-validator), `service` (kế thừa `BaseCrudService` + cấu hình bảng/cột/tìm kiếm/lọc), `controller` (kế thừa `CrudController(resource, CreateDto, UpdateDto)`), khai báo module trong [resources.module.ts](src/resources/resources.module.ts) và thêm tài nguyên vào ma trận quyền.

> Test dùng PostgreSQL nhúng nên bỏ qua `002_plots.sql` nếu không có PostGIS; các route `/api/plots*` chỉ được test phân quyền và kiểm tra hình học, phần ghi/đọc dữ liệu cần chạy thử với `docker compose`.
> Dự án dùng NestJS 11 (CommonJS). NestJS 12 chuyển các gói lõi sang ESM nên chưa dùng, để tránh vướng Jest.
