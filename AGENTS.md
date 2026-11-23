# Quy tắc Thiết kế, Bảo mật, Hiệu năng và Quy trình Kỹ thuật Toàn Dự án (PUC)

Tệp quy tắc gốc này luôn được tự động nạp cho toàn bộ kho mã (`frontend/`, `backend/` và mọi phân hệ con). Mọi yêu cầu từng được người dùng nhắc đi nhắc lại trong quá trình phát triển đã được chuẩn hóa tại đây cùng với `frontend/AGENTS.md` và `backend/AGENTS.md`. Khi đọc hiểu mã nguồn, tạo mới hoặc chỉnh sửa bất kỳ tính năng nào, bắt buộc tự động tuân thủ đầy đủ mà không cần người dùng nhắc lại.

---

## 1. Chống Thiết kế Rập khuôn AI và Kỷ luật Thị giác (Zero AI-Slop Policy)

1. **Cấm dùng icon và emoji vô tội vạ**:
   - Tuyệt đối **không** dùng emoji ở bất kỳ vị trí nào trên giao diện, nút bấm, nhãn trạng thái, thông báo hay văn bản hướng dẫn.
   - Tuyệt đối **không** chèn icon trang trí vào tiêu đề thẻ, tiêu đề mục, nhãn chỉ số thống kê (KPI), thông báo popup/toast, hay nút bấm đã có chữ tiếng Việt rõ nghĩa.
   - Tuyệt đối **không** tạo "hộp icon nền màu pastel" (`36x36` hoặc `40x40` tô nền nhạt bọc icon ở góc thẻ).
   - **Chỉ dùng icon chức năng từ thư mục `public/`** (`PublicIcon`) khi thật sự cần cho điều hướng hoặc tiết kiệm diện tích (nút đóng, chuông thông báo, kính lúp tìm kiếm, máy ảnh quét QR, ẩn/hiện mật khẩu, nút thanh công cụ hẹp kèm `aria-label`). Mũi tên điều hướng/mở rộng chỉ dùng nét mảnh màu xám trung tính đồng bộ màu đường kẻ, không bọc vòng tròn bên ngoài.

2. **Cấm viền màu nhấn, đổi màu viền theo trạng thái và viền `outline` lem nhem**:
   - Tuyệt đối **không** dùng `border-left` hay `border-top` dày màu mè và **không** đổi `border-color` xanh/đỏ/vàng theo trạng thái trên thẻ, popup, toast, hộp cảnh báo, ghi chú hay mục danh sách.
   - Mọi thẻ, popup và thông báo chỉ dùng viền mảnh trung tính đồng nhất `1px solid` (`#d4d4d2`, `#e2e5e3` hoặc `rgba(20, 55, 47, 0.12)`), kết hợp nền tương phản tinh tế và màu chữ ngữ nghĩa.
   - Loại bỏ viền `outline` mặc định gây lem thị giác trên thẻ, thông báo và nút bấm; đồng bộ tỷ lệ đổ bóng tách lớp nhẹ nhất quán giữa các phần tử nổi.

3. **Cấm dấu chấm tròn (`status dot`) và súp nhãn màu cầu vồng**:
   - Tuyệt đối **không** thêm chấm tròn màu hoặc chấm nhấp nháy ở đầu nhãn trạng thái, nhãn phân mục (eyebrow), tiêu đề thẻ hay thông báo.
   - Không biến thông tin định danh/thông số phụ (ngày tháng, diện tích, vai trò, mã lô, số lượng) thành các viên thuốc tô đủ màu trên cùng một hàng; không chèn số đếm `(0)` hay `(N)` gây nhiễu vào tiêu đề mục. Màu ngữ nghĩa (xanh rừng `#15803d`, vàng hổ phách `#9a6712`, đỏ gạch `#b91c1c`) chỉ dành cho trạng thái kiểm định hoặc cảnh báo cần hành động.

4. **Quy chuẩn độ bo góc và phân tách bề mặt phẳng**:
   - **Trang giới thiệu công khai (`LandingPage` / `.lp` / `.sw-*` / `.eh-*`)**: Vuông cạnh tuyệt đối (`border-radius: 0`), không tự ý bo góc bất kỳ khung ảnh, nút bấm, thẻ hay ngăn kéo nào.
   - **Các phân hệ nghiệp vụ khác**: Nút bấm, ô nhập liệu, badge/tag bo góc `4px` đến `6px`; popup, toast, dropdown, hộp thoại, thẻ dữ liệu bo góc `6px` đến `8px` (khối lồng bên trong tuân theo bán kính đồng tâm `R_trong = max(0, R_ngoài - viền - khoảng_lùi)`). Cấm lạm dụng `999px` hoặc `16px+`.
   - Tránh lồng thẻ trắng bên trong thẻ trắng gây chật chội; ưu tiên hiển thị dạng danh sách phẳng phân tách bằng đường kẻ mảnh `1px` (bỏ đường kẻ thừa ở dòng cuối cùng), chỉ khi người dùng bấm vào dòng tóm tắt mới mở chi tiết bên trong.

5. **Nhận diện nút bấm rõ ràng và xác nhận thao tác nguy hiểm**:
   - Mọi nút tương tác (như nút Đăng nhập, Hotline, thao tác chọn ảnh/video, mở bộ lọc) phải có đường viền `1px` hoặc màu nền tương phản rõ ràng để nhìn vào biết ngay có thể bấm được. Với ô chọn ngày hoặc chọn danh mục, bấm vào bất kỳ đâu trong khung ô đều phải mở bảng chọn (không bắt bấm trúng icon nhỏ).
   - Các nút chân thẻ hoặc chân hộp thoại xếp gọn dưới đáy, phân tách bằng đường kẻ dọc mảnh `1px`.
   - Mọi thao tác xóa dữ liệu hoặc thu hồi quyền quan trọng bắt buộc hỏi xác nhận trước, trong đó nút xác nhận xóa dùng nền đỏ chữ trắng rõ nghĩa.

---

## 2. Chữ viết, Ngôn ngữ Cô đọng và Đa ngôn ngữ Chính xác

- **Phông chữ thống nhất toàn hệ thống**: Bắt buộc dùng phông chữ chung **Bai Jamjuree** cho toàn bộ tiêu đề, văn bản, bảng biểu, biểu đồ, nhãn trạng thái và cả chữ gợi ý `::placeholder` trong mọi ô nhập liệu (tuyệt đối không để `placeholder` rơi về phông mặc định khác của trình duyệt).
- **Định dạng con số (`tabular-nums`)**: Mọi mã vùng trồng, mã lô, mã thửa, diện tích, sản lượng, tỷ lệ pha thuốc, ngày cách ly, CCCD, số điện thoại và mốc thời gian bắt buộc bật `font-variant-numeric: tabular-nums`.
- **Bảng màu Swiss Editorial**: Nền sáng sạch (`#ffffff`, `#f7f7f5`, `#f3f7ee`), mực chữ chính `#14372f` hoặc `#121212`, chữ phụ `#5f6d66` / `#5f5f5c`, đường kẻ `1px` sắc nét.
- **Câu chữ cô đọng nhưng tường minh**: Viết ngắn gọn, đi thẳng vào trọng tâm để nông hộ lớn tuổi đọc lướt 2 giây hiểu ngay; tên tab gọn khoảng 2 từ; nút bấm ngắn gọn nhưng không viết tắt tối nghĩa. Cấm dùng các ký tự nối `+`, `·`, `•`, `—` trong câu chữ hiển thị; dùng từ nối tiếng Việt tự nhiên hoặc dấu phẩy, gạch nối ngắn.
- **Cấm lộ thuật ngữ kỹ thuật nội bộ lên giao diện**: Không hiển thị mô tả cơ chế kỹ thuật, tên bảng/cột cơ sở dữ liệu, mã lỗi nội bộ hay thuật ngữ lập trình lên màn hình người dùng cuối (vừa gây khó hiểu cho bà con, vừa tạo cơ sở cho kẻ xấu dò thông tin).
- **Nhãn ngữ cảnh chính xác tuyệt đối**: Đang tra cứu hoặc xử lý đối tượng nào (`lô hàng`, `thùng đóng gói`, `tem trái`, `thửa đất`) thì tiêu đề, trạng thái tải và thông báo phải gọi đúng tên đối tượng đó, không gọi nhầm loại thực thể.
- **Đa ngôn ngữ (`vi`, `en`, `zh`)**: Khi chuyển đổi ngôn ngữ, toàn bộ nhãn giao diện và từ ngữ chung phải được dịch trọn vẹn, tự nhiên theo đúng ngôn ngữ đích, nhưng **giữ nguyên tên riêng tiếng Việt** (họ tên nông hộ, tên Hợp tác xã, địa danh thôn/xã, mã số định danh). Trang truy xuất QR công khai không được phụ thuộc các dịch vụ bị chặn tại Trung Quốc (như Google Fonts hay Google Maps API).

---

## 3. Đa thiết bị (Laptop và Mobile), Chuyển động Mượt và Máy Cấu hình Thấp

- **Kiểm tra song song Laptop và Mobile**: Mọi thay đổi giao diện bắt buộc rà soát bố cục trên cả màn hình máy tính và điện thoại di động trước khi hoàn tất; không để lệch nút trên Laptop hay xô lệch, tràn khung trên Mobile.
- **Tối ưu thao tác trên điện thoại**: Tận dụng tối đa diện tích hiển thị trên màn hình nhỏ, ẩn thanh cuộn dọc thô trên Mobile, và đảm bảo khi bàn phím ảo bật lên không che khuất ô nhập liệu bên dưới hộp thoại/biểu mẫu.
- **Chuẩn hóa Popup, Bottom Sheet và Drawer**: Trên Mobile trượt mượt từ dưới đáy lên (hỗ trợ vuốt xuống để đóng khi ở đầu nội dung và chạm vùng tối bên ngoài để đóng); trên Desktop mở ngăn kéo bên phải hoặc hộp thoại căn giữa cân đối. Tuyệt đối **không** làm giật dịch chuyển trang nền phía sau khi đóng/mở, **không** chớp nháy 2 nhịp, **không** dùng hiệu ứng phóng to `scale()` hay nhấc thẻ gây chói mắt.
- **Nút Quay lại (`Back`) và Tải lại trang (`Reload / F5`)**: Bấm nút Quay lại khi đang mở popup/sheet phải đóng lớp nổi đó trước chứ không thoát thẳng khỏi trang; bấm `F5` / tải lại trang phải giữ nguyên đúng tab và phân vùng người dùng đang làm việc.
- **Hiệu năng trên máy đời cũ ngoài vườn**: Tránh hiệu ứng kính mờ nặng, vòng lặp tính toán ngầm hoặc tải dồn thư viện lớn ngay lúc mở trang; luôn tải lười (`lazy-load`) bản đồ, trình tạo/quét QR và phân vùng quản trị nặng để máy RAM thấp không bị nóng hoặc khựng.

---

## 4. Dữ liệu Thực, Đồng bộ Ngầm Thời gian thực và Hồ sơ Truy xuất Khổ A4

- **Cấm tuyệt đối dữ liệu giả hoặc gán cứng (`hardcode`) số liệu**: Mọi con số thống kê, sản lượng, đối soát trần đầu vụ, phiếu kiểm nghiệm và danh sách hộ tham gia phải lấy trực tiếp từ dữ liệu thực trong cơ sở dữ liệu. Mục nào chưa có dữ liệu thực thì hiển thị trạng thái rỗng trung thực (ví dụ: `0 phiếu`, `Chưa có dữ liệu`).
- **Cơ chế cập nhật thời gian thực ngầm (Silent Realtime Sync)**: Lô hàng, kiểm nghiệm, nhật ký, thông báo và yêu cầu cấp quyền thanh tra thực địa biến động liên tục; các trang đang mở phải tự động đồng bộ dữ liệu mới ngầm ở bên dưới (qua `SSE` kết hợp làm mới êm khi quay lại màn hình) mà không bắt người dùng bấm tải lại trang thủ công và không làm trôi vị trí đang đọc.
- **Ngoại tuyến ngoài vườn (Offline-First) và Toàn vẹn Nhật ký**: Hỗ trợ nông hộ chụp chọn nhiều ảnh/video tại vườn mất sóng lưu an toàn vào `IndexedDB`, tự tối ưu dung lượng và tự đẩy lên máy chủ khi có mạng trở lại. Chặn khai khống nhật ký cho ngày tương lai, ghi nhận đầy đủ ngày thực hiện thực tế cùng thời điểm máy chủ tiếp nhận và lưu vết kiểm toán khi cán bộ sửa hộ.
- **Chuẩn hồ sơ truy xuất QR (`/t/[token]`) trên Khổ giấy A4**:
  - Mã QR chỉ chứa một đường dẫn token ngẫu nhiên không thể đoán lặp (vừa quét bằng camera vừa bấm mở trực tiếp được).
  - Khung hồ sơ truy xuất giữ **đúng tỷ lệ tờ giấy A4** đồng nhất trên cả Laptop, Mobile (thu nhỏ vừa khung điện thoại đúng tỷ lệ A4 để người dùng có thể zoom xem chi tiết) và bản in PDF.
  - Khi vai trò có quyền cao hơn (Doanh nghiệp thu mua, Cơ quan thẩm quyền hoặc Đoàn kiểm tra được duyệt quyền thực địa) xem thêm bảng hộ tham gia, nhật ký và kiểm nghiệm chi tiết khiến nội dung dài ra, hệ thống phải **tự động phân trang thành nhiều tờ A4 liên tiếp** có đánh số trang rõ ràng, không cắt đôi dòng bảng.
  - Bên trong tờ A4 chỉ chứa thuần nội dung hồ sơ minh chứng; mọi thanh công cụ (chuyển ngôn ngữ, nút đăng nhập, gửi yêu cầu cấp quyền thanh tra đột xuất, in hồ sơ) phải đặt bên ngoài khung tờ giấy A4.
  - Bản đồ trên hồ sơ truy xuất hiển thị trực tiếp **ảnh vệ tinh thực tế**, bỏ viền khung con thừa và bỏ nút chuyển bản đồ giao thông.

---

## 5. Bảo mật Mặc định và Phòng thủ Chống Bắt Gói tin / Khai thác API

Mọi biểu mẫu, luồng lưu trữ trình duyệt và endpoint API mới hoặc chỉnh sửa bắt buộc áp dụng đầy đủ các lớp phòng thủ sau:

1. **Chống lộ thông tin nhạy cảm trên giao diện và trình duyệt**:
   - Mọi ô nhập mật khẩu, mã xác thực 2FA/OTP, mã khôi phục, CCCD bắt buộc gắn đủ `autoComplete="off"`, `data-lpignore="true"`, `data-1p-ignore="true"`, `spellCheck={false}` trong `<form autoComplete="off">` để trình duyệt và tiện ích mở rộng không gợi ý lưu mật khẩu trên máy dùng chung.
   - Xóa trắng ngay lập tức các biến `state` chứa mật khẩu, OTP, mật khẩu tạm ngay khi gửi xong, đóng hộp thoại hoặc rời trang (`pagehide`). Khi sao chép mật khẩu tạm hoặc mã dự phòng, bắt buộc dùng cơ chế tự động xóa khay nhớ tạm (`clipboard`) sau 45 giây.
   - Chỉ duy trì phiên lưu trữ dài hạn trên thiết bị cho vai trò nông hộ (`farmer`); các vai trò quản trị, cán bộ, đối tác, thanh tra không lưu thông tin phiên nhạy cảm xuống `localStorage`. Không bao giờ đặt mật khẩu, token hay mã định danh nhạy cảm trên URL query string.
   - Tắt hoàn toàn `productionBrowserSourceMaps` trên bản build chính thức và không bao giờ trả tên cột SQL, mã lỗi `SQLSTATE` hay `stack trace` về trình duyệt.

2. **Chống bắt và sửa gói tin (Anti-Interception / Burp Suite) và Ràng buộc phiên**:
   - Mọi yêu cầu thay đổi dữ liệu (`POST`, `PUT`, `PATCH`, `DELETE`) từ trình duyệt phải đi qua hàm gọi API chuẩn có gắn chữ ký toàn vẹn `X-PUC-Timestamp`, `X-PUC-Nonce`, `X-PUC-Payload-Hash`, `X-PUC-Signature` ràng buộc với cookie `htx_csrf`.
   - Trên máy chủ, tuyệt đối không tắt hoặc đi vòng qua `OriginGuard`, `RequestIntegrityGuard`, `SecurityDefenseService` (tự động thu hồi phiên, tạm khóa cách ly khi phát hiện giả mạo chữ ký/replay và bắn cảnh báo thời gian thực cho Quản trị viên), `JwtAuthGuard` (kiểm tra khớp dấu vân tay thiết bị `Session Binding`) và `@RateLimitTier(...)`.

3. **Phân quyền máy chủ (RBAC + Scope) và Kiểm soát chéo**:
   - Luôn kiểm tra quyền và lọc phạm vi dữ liệu (`village_scope`, `portal_context`, 3 tầng dữ liệu truy xuất `public` / `enterprise` / `authority`) trực tiếp tại máy chủ; DTO bắt buộc bật `whitelist` và `forbidNonWhitelisted`.
   - Duy trì cơ chế kiểm soát quyền lực chéo đối với thao tác trọng yếu (như xóa thành viên khỏi Hợp tác xã cần thông báo và phê duyệt đồng thuận giữa Trưởng và Phó HTX; thông báo toàn HTX đồng bộ minh bạch giữa Trưởng và Phó HTX).

---

## 6. Clean Code, Tối ưu Hiệu năng và Bảo toàn Chức năng

- **Dọn sạch mã dư thừa**: Không để lại tệp mồ côi, hàm/component/type không còn nơi gọi, biến thừa, khối CSS chết hay tệp ảnh sinh nháp sau khi hoàn tất công việc.
- **Không trùng lặp truy vấn và tối ưu Database/Cache**:
  - Trên Frontend: gộp và dùng chung kết quả truy vấn (`src/hooks/use-api.ts`), không kích hoạt truy vấn cần đăng nhập khi chưa có phiên xác thực.
  - Trên Backend: tôn trọng giới hạn kết nối PostgreSQL, cấm truy vấn `N+1` trong vòng lặp, dùng bộ nhớ đệm kiểm tra cấu trúc bảng (`src/common/sql/schema-cache.ts`) và đăng ký mọi bảng mới vào `TABLE_TO_TAGS` của `src/common/cache/app-cache.service.ts`.
- **Nguyên tắc bất khả xâm phạm**: Mọi đợt clean code hay tối ưu hiệu năng phải kiểm tra kỹ từng luồng liên đới để **không làm hỏng hay suy giảm bất kỳ chức năng vốn có nào của hệ thống**.

---

## 7. Cổng Kiểm tra Bắt buộc Trước khi Hoàn tất hoặc Commit (Build, Lint và Test)

Trước khi báo cáo hoàn thành bất kỳ thay đổi mã nguồn nào (và **bắt buộc 100% trước mỗi lần commit**), phải chủ động chạy đầy đủ quy trình xác minh sau mà không đợi người dùng nhắc:

1. **Kiểm tra Frontend (`frontend/`)**:
   - `npx tsc --noEmit` đạt 0 lỗi kiểu tĩnh.
   - `npm run lint` đạt 0 lỗi ESLint.
   - `npm run build` biên dịch thành công toàn bộ các route sản phẩm (ngăn chặn triệt để lỗi gãy build khi triển khai Vercel hoặc Docker).
2. **Kiểm tra Backend (`backend/`)**:
   - `npm run db:migrate` chạy trơn tru (khi có thay đổi SQL migration).
   - `npm run typecheck` và `npm run build` đạt 0 lỗi, xuất sạch thư mục `dist/`.
   - `npm test` vượt qua 100% toàn bộ các bộ kiểm thử chức năng, phân quyền và kiểm thử lỗ hổng bảo mật (`test/*.test.ts`).
3. **Tự rà soát Giao diện và Bảo mật**:
   - Đã loại bỏ hết emoji, icon thừa, `border-left` màu, chấm `dot`, `outline` lem, bo góc sai chuẩn và ký tự nối cấm chưa?
   - Đã căn chỉnh chuẩn trên cả Laptop và Mobile, giữ đúng phông `Bai Jamjuree` (kể cả `placeholder`) và số liệu thực thời gian thực chưa?
   - Có biểu mẫu hay endpoint mới nào thiếu chống lưu mật khẩu, thiếu ký số request, thiếu phân quyền phạm vi hoặc thiếu test bảo mật không?

---

## 8. Quy tắc Quản lý Git, Chia nhỏ Commit và An toàn Kho mã

- **Không tự ý commit/push**: Chỉ tạo commit hoặc đẩy mã lên GitHub khi người dùng yêu cầu rõ ràng.
- **Luôn chia nhỏ commit theo mạch logic khi được yêu cầu commit/push**:
  - Không gom tất cả thay đổi lớn vào một commit duy nhất. Mặc định tách thành các commit nhỏ, rõ nghĩa theo chuẩn Conventional Commits (`feat(...)`, `fix(...)`, `perf(...)`, `refactor(...)`, `docs(...)`) theo thứ tự phụ thuộc an toàn (migration/hạ tầng backend trước, nghiệp vụ API tiếp theo, giao diện frontend sau cùng) rồi mới push.
- **Bảo mật tuyệt đối kho mã Git**:
  - Luôn rà soát `git status` và `git diff --staged` trước mỗi commit.
  - Tuyệt đối không bao giờ đưa lên Git các tệp nhạy cảm hoặc dữ liệu cục bộ: `.env*` (trừ `.env.example` và `.env.prod.example`), `.local-db/`, `uploads/`, `Data_PUC/`, `data_PUC/`, `uiux/`, tài liệu báo giá/hợp đồng nội bộ (`.docx`, `.xlsx`, `.pdf` riêng tư), khóa bí mật, chứng chỉ và thư mục biên dịch (`dist/`, `.next/`).
