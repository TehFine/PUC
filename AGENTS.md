# Quy tắc Thiết kế Giao diện và Tiêu chuẩn Kỹ thuật Toàn Dự án (PUC)

Tệp quy tắc gốc này luôn được kích hoạt cho toàn bộ kho mã (`frontend/`, `htx-admin/`, `backend/` và mọi phân hệ con). Khi tạo mới hoặc chỉnh sửa **bất kỳ thành phần giao diện nào dù lớn hay nhỏ** (trang, phân vùng, bảng, thẻ, biểu mẫu, hộp thoại modal, bottom sheet, banner, popup, toast, nhãn trạng thái, trạng thái rỗng), bắt buộc tuân thủ tuyệt đối các quy tắc dưới đây.

---

## 1. Các mẫu thiết kế RẬP KHUÔN CỦA AI bị CẤM TUYỆT ĐỐI (Zero AI-Slop Policy)

1. **Cấm dùng icon và emoji vô tội vạ**:
   - Tuyệt đối **không** dùng emoji (như dấu tích xanh, tia chớp, tên lửa, biểu đồ, cảnh báo, cây cối...) ở bất kỳ vị trí nào trên giao diện, nút bấm, nhãn trạng thái, thông báo hay văn bản hướng dẫn.
   - Tuyệt đối **không** chèn icon trang trí vào tiêu đề thẻ, tiêu đề mục, nhãn chỉ số thống kê (KPI), thông báo popup/toast, hay nút bấm đã có chữ tiếng Việt rõ nghĩa.
   - Tuyệt đối **không** tạo "hộp icon nền màu pastel" (ô vuông/tròn `36x36` hoặc `40x40` tô nền nhạt bọc lấy một icon SVG ở góc trên mỗi thẻ).
   - **Chỉ được dùng icon chức năng** khi thật sự cần thiết cho thao tác điều hướng hoặc tiết kiệm diện tích: nút đóng `×`, mũi tên thu gọn/mở rộng/phân trang, kính lúp trong ô tìm kiếm, con mắt ẩn/hiện mật khẩu, nút mở máy ảnh quét QR, hoặc nút chỉ có icon trên thanh công cụ hẹp (bắt buộc kèm `aria-label`).

2. **Cấm viền màu nhấn và đổi màu viền theo trạng thái trên thẻ, popup, thông báo (`border-left` / `border-top` / `border-color`)**:
   - Tuyệt đối **không** dùng `border-left: 3px solid ...`, `border-left: 4px solid ...`, `border-top: 2px solid ...` hay đổi màu đường viền bao quanh (`border-color: #fecaca` / `#fde68a` / `#bbf7d0` / `#f59e0b`...) trên thẻ thông tin, popup, toast, hộp cảnh báo, hộp xác nhận, ghi chú, mục nhật ký hay thông báo nổi.
   - Thay vào đó, mọi thẻ, popup và thông báo chỉ dùng đường viền mảnh trung tính đồng nhất `1px solid` (`#d4d4d2`, `#e2e5e3` hoặc `rgba(20, 55, 47, 0.12)`), kết hợp độ tương phản nền tinh tế và màu chữ ngữ nghĩa.

3. **Cấm dấu chấm tròn (`status dot`) ở đầu thẻ, nhãn hoặc thông báo**:
   - Tuyệt đối **không** thêm phần tử chấm tròn màu (`<span className="dot" />`, `::before` hình tròn, hoặc chấm nhấp nháy `animate-ping`) ở đầu badge trạng thái, nhãn phân mục (eyebrow), tiêu đề thẻ, hay thông báo popup/toast.
   - Trạng thái phải được truyền đạt trực tiếp bằng từ ngữ ngắn gọn, sắc độ chữ và đường viền mảnh chuẩn xác.

4. **Cấm bo góc quá đà và lạm dụng dáng viên thuốc (`pill` / `999px`)**:
   - Tuyệt đối **không** mặc định dùng `border-radius: 999px` cho thông báo nổi, banner, ô nhập liệu, nút hành động trong hộp thoại hay thẻ tag nhiều chữ.
   - Không áp `border-radius: 16px` đến `24px` tràn lan cho popup, toast, thẻ dữ liệu nhỏ, bảng biểu hay hộp thoại cảnh báo.
   - **Quy chuẩn độ bo góc**:
     - **Trang giới thiệu công khai (`LandingPage` / `.lp` / `.sw-*` / `.eh-*`)**: Mang phong cách kiến trúc lưới Thụy Sĩ **vuông cạnh tuyệt đối (`border-radius: 0`)**; tuyệt đối không tự ý bo góc bất kỳ khung ảnh, nút bấm, thẻ, ngăn kéo hay đường kẻ nào trên trang này.
     - Nút bấm nội khu, ô nhập liệu, nhãn trạng thái (badge/tag) tại các phân hệ nghiệp vụ khác: `4px` đến `6px`.
     - Popup, toast, dropdown, hộp thoại hệ thống, thẻ dữ liệu nghiệp vụ: `6px` đến `8px` (với phần tử lồng bên trong tuân theo công thức đồng tâm `R_trong = max(0, R_ngoài - viền - khoảng_lùi)`).

5. **Cấm "súp nhãn màu cầu vồng" (Rainbow Badge Soup)**:
   - Không biến mọi thông tin phụ (ngày tháng, diện tích, vai trò, mã lô, loại công việc, số lượng) thành các viên thuốc tô đủ màu xanh, tím, cam, vàng trên cùng một hàng.
   - Thông tin định danh và thông số phải hiển thị bằng chữ thuần khiết, dùng `font-variant-numeric: tabular-nums` hoặc khung chữ nhật viền trung tính `1px`. Màu ngữ nghĩa (xanh rừng `#15803d`, vàng hổ phách `#9a6712`, đỏ gạch `#b91c1c`) chỉ dành riêng cho trạng thái kiểm định hoặc cảnh báo cần hành động.

6. **Cấm màu gradient lòe loẹt, bóng mờ giả tạo và hiệu ứng nảy màu mè**:
   - Không dùng dải màu tím-lam-hồng kiểu SaaS AI, các đốm sáng mờ (`blur blob`) trôi nổi phía sau nền, hoặc lạm dụng kính mờ (`backdrop-filter: blur`) dày đặc.
   - Không dùng bóng đổ đậm trên các thẻ nằm tĩnh trong trang; ưu tiên mặt phẳng sạch phân tách bằng đường kẻ mảnh `1px`. Bóng đổ tách lớp nhẹ chỉ dành cho phần tử nổi (modal, popover, banner hệ thống).
   - Không dùng hiệu ứng hover phóng to hay nhấc bổng thẻ (`translateY(-4px) scale(1.02)`). Chuyển trạng thái hover dứt khoát qua màu viền, màu nền nhạt hoặc độ đậm chữ trong `150ms` đến `180ms`.

7. **Cấm bố cục 3 thẻ giống hệt nhau và câu chữ rỗng tuếch kiểu AI**:
   - Tránh xếp các hàng thẻ trắng lặp lại cùng một khuôn (tiêu đề in đậm đi kèm hai dòng mô tả chung chung). Ưu tiên bảng dữ liệu rõ cột, danh mục đánh số thứ tự (`01`, `02`, `03`) khi có trình tự, hoặc bố cục bất đối xứng theo phong cách biên tập báo chí (Swiss Editorial).
   - Không viết câu dẫn giải dài dòng, sáo rỗng ("Giúp bạn quản lý dễ dàng, nhanh chóng và hiệu quả mọi lúc mọi nơi..."). Mọi tiêu đề, mô tả, nút bấm và thông báo lỗi phải cô đọng, đi thẳng vào trọng tâm, để nông hộ, cán bộ xã hay đối tác xuất khẩu đọc lướt một lần là hiểu ngay.

---

## 2. Định hướng Thẩm mỹ Chủ đạo (Swiss Editorial & Nông nghiệp Chính xác)

- **Bảng màu nền tảng**:
  - Nền bề mặt: Trắng tinh `#ffffff`, xám giấy ấm `#f7f7f5` hoặc sương nhạt `#f3f7ee`.
  - Mực chữ chính: Xanh rừng thẫm `#14372f` hoặc than chì `#121212`; chữ phụ `#5f6d66` / `#5f5f5c`; nhãn phụ `#8a968f`.
  - Đường kẻ phân tách: Mảnh `1px` sắc nét (`#e5e7eb`, `#d4d4d2` hoặc `rgba(20, 55, 47, 0.12)`).
- **Phân cấp chữ (Typography)**:
  - Dùng độ tương phản cỡ chữ, độ đậm (`500`, `600`) và khoảng cách dòng để tạo nhịp điệu thị giác thay vì dùng hộp màu hay icon.
  - Nhãn phân loại nhỏ phía trên tiêu đề (eyebrow) viết in hoa gọn gàng, cỡ `11px` đến `12px`, `letter-spacing: 0.06em` đến `0.08em`, không kèm chấm tròn hay icon.
  - Mọi mã số vùng trồng, mã lô, diện tích, khối lượng, tỷ lệ pha thuốc, ngày cách ly và mốc thời gian bắt buộc bật `font-variant-numeric: tabular-nums`.
- **Quy tắc dấu câu và ký tự nối trong toàn bộ câu chữ hiển thị**:
  - Tuyệt đối **không** dùng dấu cộng (`+`), dấu chấm giữa (`·`), dấu đầu dòng tròn (`•`) hoặc gạch ngang dài (`—`) để nối cụm từ trong tiêu đề, nhãn giao diện, thông báo hay văn bản mô tả. Sử dụng từ nối tiếng Việt tự nhiên (`và`, `kết hợp`, `cùng`, `tại`) hoặc dấu phẩy, dấu gạch nối ngắn thông thường khi cần.
- **Căn chỉnh hộp thoại và thông báo ngắn (Modal / Popup / Banner)**:
  - Với popup cảnh báo hoặc xác nhận ngắn: bố cục cân đối, nội dung tối đa 1 tiêu đề ngắn và 1 câu hướng dẫn súc tích, nhóm nút hành động căn giữa rõ ràng, nút chính và nút phụ phân biệt bằng độ tương phản nền đen/xanh đậm và nền trắng viền mảnh.

---

## 3. Danh sách Tự Kiểm tra Bắt buộc trước khi Hoàn tất Bất kỳ Giao diện nào

Trước khi kết thúc chỉnh sửa trên bất kỳ tệp `.tsx`, `.jsx` hay `.css` nào, phải tự rà soát đủ 6 câu hỏi:
1. Có icon SVG trang trí hay emoji nào có thể xóa đi mà người dùng vẫn hiểu trọn vẹn nội dung không? Nếu có, **xóa ngay**.
2. Có thẻ, hộp cảnh báo hay mục danh sách nào đang dùng `border-left` dày màu mè không? Nếu có, **đổi ngay sang viền mảnh `1px` đồng nhất**.
3. Có dấu chấm tròn (`dot`) nào nằm trước trạng thái, tiêu đề hoặc thông báo không? Nếu có, **xóa ngay**.
4. Độ bo góc có bị lạm dụng `999px` hoặc bo tròn quá lớn (`16px+`) trên thành phần nhỏ/vừa không? Nếu có, **đưa về `4px` đến `8px`**.
5. Câu chữ đã cắt bỏ hết từ thừa và ký tự nối cấm, đủ ngắn gọn để đọc hiểu trong 2 giây chưa?
6. Mã nguồn giao diện có vượt qua kiểm tra kiểu tĩnh (`npx tsc --noEmit`) không lỗi hay không?

---

## 4. Quy tắc An toàn Kho mã (Git & Bảo mật)

- Không bao giờ đưa các tệp nhạy cảm hoặc dữ liệu cục bộ lên Git: `.env*` (trừ `.env.example`), `.local-db/`, `uploads/`, `Data_PUC/`, `data_PUC/`, `uiux/`, khóa bí mật và chứng chỉ.
- Chỉ tạo commit hoặc đẩy mã lên GitHub khi người dùng yêu cầu rõ ràng.

