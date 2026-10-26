# HTX – Hệ thống quản lý vùng trồng sầu riêng

```
PUC/
├── frontend/           Next.js 16 (App Router) – giao diện quản trị      :3000
├── backend/            NestJS + TypeScript + PostgreSQL/PostGIS – REST API :4000
├── docker-compose.yml  PostGIS cho môi trường dev
└── uiux/               Ảnh thiết kế tham chiếu
```

## Chạy phát triển
```bash
docker compose up -d db
# Terminal 1
cd backend  && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev
# Terminal 2
cd frontend && cp .env.example .env.local && npm install && npm run dev
```
Frontend gọi `/api/*` và được `next.config.ts` chuyển tiếp tới `API_URL` (mặc định `http://localhost:4000`).

Các trang: `/` trang giới thiệu công khai (người đã đăng nhập được chuyển thẳng vào `/admin` hoặc `/portal`) · `/gioi-thieu` cùng nội dung nhưng không tự chuyển hướng (biểu tượng hệ thống trong `/admin` và `/portal` dẫn về đây) · `/login` đăng nhập · `/register` hộ dân đăng ký (tài khoản chờ cán bộ HTX duyệt ở mục "Đăng ký hộ" trong `/admin`) · `/admin` giao diện quản trị · `/portal` cổng hộ dân (`/landing` chuyển hướng về `/`). Sau khi cập nhật mã nguồn có migration mới, khởi động lại `npm run dev:local` để áp dụng.

Kiểm thử backend: `cd backend && npm test` (không cần Docker).

Chi tiết: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).
