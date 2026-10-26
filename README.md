# HTX Krông Búk – Hệ thống quản lý vùng trồng sầu riêng

Hệ thống giúp Hợp tác xã (HTX) Krông Búk, Đắk Lắk quản lý **mã vùng trồng**, nhật ký chăm sóc và chất lượng sầu riêng để đạt chuẩn xuất khẩu. Cán bộ HTX làm việc trên máy tính, bà con nông hộ dùng ngay trên điện thoại.

## Hệ thống giải quyết việc gì

- **Mỗi vườn có hồ sơ rõ ràng:** hộ nào, thửa nào, ranh giới ở đâu, thuộc mã vùng trồng nào, trồng giống gì.
- **Nhật ký canh tác tập trung:** bón phân, phun thuốc, thu hoạch được ghi lại, thay cho sổ giấy rời rạc.
- **Kiểm soát chất lượng trước khi xuất khẩu:** kết quả kiểm nghiệm, biên bản kiểm tra, vi phạm và danh mục thuốc bảo vệ thực vật bị cấm.
- **Theo dõi nguồn gốc:** thửa đất, nhật ký chăm sóc, kết quả kiểm nghiệm và lô thu hoạch được lưu liên kết với từng hộ trồng.
- **Phân quyền chặt chẽ:** mỗi người chỉ thấy và làm đúng việc của mình; mọi thay đổi dữ liệu đều được ghi lại.

## Ai dùng và làm được gì

| Vai trò | Công việc chính |
|---|---|
| Quản trị viên | Cấp tài khoản, phân quyền, xem lại nhật ký thao tác toàn hệ thống |
| Cán bộ HTX | Duyệt hồ sơ và đăng ký hộ, quản lý nông hộ, thửa đất, danh mục, lô hàng |
| Kiểm tra viên | Kiểm tra vườn, lập biên bản, ghi kết quả kiểm nghiệm, báo vi phạm |
| Cán bộ Thôn | Theo dõi các hộ trong thôn mình, hỗ trợ bà con ghi nhật ký (chỉ thấy dữ liệu thôn mình) |
| Hộ dân | Xem thửa đất, ghi nhật ký, nhận nhắc nhở, gửi hồ sơ trên điện thoại |

## Các màn hình

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang giới thiệu công khai: quy trình, mùa vụ, danh mục thuốc/giống, số liệu tổng hợp, câu hỏi thường gặp. Người đã đăng nhập được chuyển thẳng vào `/admin` hoặc `/portal` |
| `/gioi-thieu` | Cùng nội dung với `/` nhưng không tự chuyển hướng (biểu tượng hệ thống trong `/admin` và `/portal` dẫn về đây) |
| `/login` | Đăng nhập, có ô tích **Hiện mật khẩu** |
| `/register` | Hộ dân tự đăng ký; tài khoản chờ cán bộ HTX duyệt ở mục "Đăng ký hộ" trong `/admin` |
| `/admin` | Khu vực quản trị: Tổng quan · Nông hộ · Vùng trồng (bản đồ) · Duyệt hồ sơ · Đăng ký hộ · Nhật ký · Kiểm nghiệm · Lô hàng · Tập huấn · Báo cáo · Danh mục · Hệ thống |
| `/portal` | Cổng hộ dân: Trang chủ · Thửa đất · Nhật ký · Kiểm tra · Hồ sơ · Kiến thức |

`/landing` được chuyển hướng về `/`.

## Điểm nổi bật

- **Bản đồ vùng trồng:** vẽ và xem ranh giới thửa đất trên bản đồ (Leaflet + PostGIS), tự tính diện tích và phát hiện chồng lấn.
- **Thiết kế cho điện thoại:** giao diện tối ưu cho màn hình nhỏ, chữ và nút lớn dễ bấm cho người lớn tuổi.
- **Chịu được mạng yếu:** tự nhận biết mạng chậm hoặc mất mạng, hiện khung chờ (skeleton) thay vì màn hình trắng, tự thử lại khi tải lỗi.
- **Đăng nhập, đăng ký chia đôi màn hình:** bên giới thiệu, bên biểu mẫu; trên điện thoại có nền ảnh vườn sầu riêng tự chuyển.
- **Bảo mật:** token trong cookie `httpOnly`, khóa tạm khi đăng nhập sai nhiều lần, chống CSRF, giới hạn tần suất, quyền đọc lại từ CSDL ở mỗi yêu cầu. Chi tiết tại [backend/README.md](backend/README.md).

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Giao diện | Next.js 16 (App Router), React 19, TypeScript, Leaflet, Tailwind CSS 4 và CSS riêng cho từng khu vực |
| API | NestJS 11, TypeScript, `pg`, class-validator, JWT, helmet |
| Dữ liệu | PostgreSQL 16 + PostGIS, SQL migration thuần |
| Kiểm thử | Jest + Supertest trên PostgreSQL nhúng (không cần Docker) |

## Cấu trúc thư mục

```
PUC/
├── frontend/           Giao diện Next.js                                   :3000
├── backend/            REST API NestJS + PostgreSQL/PostGIS                :4000
└── docker-compose.yml  PostGIS cho môi trường phát triển
```

## Chạy phát triển

```bash
docker compose up -d db
# Terminal 1
cd backend  && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev
# Terminal 2
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

Không có Docker? Dùng `cd backend && npm install && npm run dev:local` để chạy PostgreSQL nhúng kèm dữ liệu mẫu (bản này không có PostGIS nên các API bản đồ chưa lưu được dữ liệu). Sau khi cập nhật mã nguồn có migration mới, khởi động lại `npm run dev:local` để áp dụng.

Frontend gọi `/api/*` và được `next.config.ts` chuyển tiếp tới `API_URL` (mặc định `http://localhost:4000`). Tài khoản mẫu để đăng nhập thử nằm ở [backend/README.md](backend/README.md).

Kiểm thử backend: `cd backend && npm test`.

> **Lưu ý bảo mật:** các giá trị trong `.env.example` (mật khẩu CSDL, `JWT_ACCESS_SECRET`, `SEED_PASSWORD`) chỉ dùng cho phát triển. Khi triển khai thật phải đặt giá trị riêng, bật `COOKIE_SECURE=true` khi chạy HTTPS và không đưa tệp `.env` lên kho mã.

## Tài liệu chi tiết

- [backend/README.md](backend/README.md): API, phân quyền, bảo mật, cách thêm nhóm dữ liệu mới.
- [frontend/README.md](frontend/README.md): ghi chú về ứng dụng Next.js.
