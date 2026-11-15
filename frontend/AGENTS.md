<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quy tắc Thiết kế Giao diện Bắt buộc (`frontend`)

Mọi trang và thành phần giao diện trong `frontend/src/` (từ trang chủ, cổng tra cứu QR `/t/[token]`, cổng nông hộ `/portal` đến trang quản trị `/admin`, bao gồm cả modal, popup, toast, badge, thẻ và biểu mẫu nhỏ nhất) bắt buộc tuân thủ bộ quy chuẩn thiết kế tại tệp gốc `../AGENTS.md` (luôn được nạp tự động ở cấp kho mã):

- **Không lạm dụng icon/emoji**: Cấm tuyệt đối emoji; cấm chèn icon trang trí vào tiêu đề, thẻ chỉ số, badge, thông báo hay nút đã có chữ rõ nghĩa; cấm dùng hộp icon nền màu pastel.
- **Không viền màu cạnh trái**: Cấm dùng `border-left` dày tô màu kiểu callout trên thẻ, cảnh báo hay danh sách.
- **Không chấm tròn trạng thái (`dot`)**: Cấm đặt dấu chấm tròn hoặc chấm nhấp nháy ở đầu thẻ, nhãn phân mục hay thông báo.
- **Không bo góc quá đà**: Trang giới thiệu công khai (`LandingPage` / `.lp` / `.sw-*` / `.eh-*`) giữ nguyên thiết kế **vuông cạnh tuyệt đối (`border-radius: 0`)**, không tự ý bo góc. Tại các phân hệ nghiệp vụ khác, dùng bo góc sắc gọn `4px` đến `6px` cho nút, ô nhập, badge, toast, popup và `6px` đến `8px` cho hộp thoại, thẻ nghiệp vụ (tuân thủ bán kính đồng tâm cho khối lồng nhau); cấm lạm dụng `999px` (viên thuốc) hoặc bo tròn lớn tràn lan.
- **Phong cách Swiss Editorial cô đọng**: Ưu tiên nền sáng sạch, viền mảnh `1px`, phân cấp chữ rõ ràng, `tabular-nums` cho con số/mã định danh, và câu chữ ngắn gọn, dễ hiểu ngay từ lần đọc đầu tiên.
