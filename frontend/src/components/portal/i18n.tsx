"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PortalLang = "vi" | "zh";

const STORAGE_KEY = "puc-portal-lang";

/**
 * Từ điển đối chiếu toàn diện Tiếng Việt → Tiếng Trung (Giản thể) cho toàn bộ Cổng Xã viên,
 * bao gồm cả giao diện tĩnh lẫn nội dung dữ liệu (tập huấn, thuốc BVTV, phân bón, giống,
 * nhật ký, vi phạm, thu hoạch, phiếu kiểm nghiệm, biển tên vườn, thông báo...).
 */
const EXACT_MAP: Record<string, string> = {
  // ─── Thanh đầu trang & Điều hướng ───
  "HTX Cư Né": "居内合作社 (Cư Né)",
  "HTX CƯ NÉ": "居内合作社 (CƯ NÉ)",
  "HTX Krông Búk": "居内合作社 (Cư Né)",
  "HTX KRÔNG BÚK": "居内合作社 (CƯ NÉ)",
  "Cổng hộ dân": "农户门户",
  "Trang chủ": "首页",
  "Thửa đất": "地块",
  "Nhật ký": "农事日志",
  "Thu hoạch": "采收与溯源",
  "Kiểm nghiệm": "检测与巡检",
  "Kiến thức": "农技知识",
  "Chức năng": "功能导航",
  "Đang kiểm tra phiên đăng nhập…": "正在检查登录状态…",
  "Đang tải trang…": "正在加载页面…",
  "Đang tải bản đồ…": "正在加载地图…",
  "Đang tải dữ liệu": "正在加载数据",
  "Đang tải danh mục…": "正在加载名录…",
  "Đang tải lịch tập huấn...": "正在加载培训计划...",
  "Mở menu điều hướng": "打开导航菜单",
  "Menu điều hướng di động": "移动端导航菜单",
  "Điều hướng": "功能导航",
  "Điều hướng chức năng": "功能导航",
  "Chọn danh mục chức năng": "选择功能模块",
  "Xong": "完成",
  "Danh mục chức năng": "功能目录",
  "Chọn mục cần xem": "请选择要查看的模块",
  "Tổng quan nông hộ và nhắc nhở.": "农户概况与今日待办提醒。",
  "Bản đồ ranh giới các thửa vườn.": "果园地块边界与卫星地图。",
  "Ghi chép canh tác và phun thuốc.": "农事作业与农药施用记录。",
  "Khai báo sản lượng và lô xuất kho.": "采收产量申报与出库批次。",
  "Lịch lấy mẫu và phiếu kiểm định.": "采样计划与实验室检测报告。",
  "Vật tư VietGAP và lớp tập huấn.": "VietGAP农资名录与技术培训。",

  // ─── Tìm kiếm chức năng ───
  "Tìm chức năng": "搜索功能",
  "Bạn muốn làm gì?": "您想办理什么业务？",
  "Gợi ý": "常用推荐",
  "Ghi nhật ký canh tác": "记录农事日志",
  "Nhật ký › Canh tác": "农事日志 › 农事作业",
  "Ghi phun thuốc": "记录施药日志",
  "Nhật ký › Phun thuốc": "农事日志 › 施药记录",
  "Xem nhật ký đã ghi": "查看已记日志",
  "Lịch sử phun thuốc & thời gian cách ly": "施药历史与安全间隔期 (PHI)",
  "Vi phạm & báo đã khắc phục": "违规提醒与整改上报",
  "Khai báo thu hái": "申报果园采收",
  "Thu hoạch › Khai báo": "采收与溯源 › 采收申报",
  "Lô hàng, tem & mã QR": "出库批次、溯源标与二维码",
  "Thu hoạch › Lô hàng": "采收与溯源 › 出库批次",
  "Xem thửa đất trên bản đồ": "在地图上查看地块",
  "Bảng tên vườn & mã QR thửa": "果园标识牌与地块二维码",
  "Kết quả kiểm nghiệm, in phiếu": "检测报告查看与打印/下载PDF",
  "Lịch kiểm tra, lấy mẫu": "田间巡检与采样计划",
  "Lớp tập huấn, đăng ký học": "技术培训班与报名",
  "Kiến thức › Tập huấn": "农技知识 › 技术培训",
  "Thuốc được phép / bị cấm": "允许/禁止使用的农药名录",
  "Kiến thức › Thuốc BVTV": "农技知识 › 植物保护农药",
  "Phân bón khuyến cáo": "推荐使用的肥料名录",
  "Kiến thức › Phân bón": "农技知识 › 肥料管理",
  "Giống sầu riêng": "榴莲品种图鉴",
  "Kiến thức › Giống cây": "农技知识 › 榴莲品种",
  "Trang chủ, nhắc việc": "首页与待办提醒",
  "Xem thông báo từ HTX": "查看合作社通知",
  "Thông báo": "通知",
  "Thông tin tài khoản, hộ": "账户与农户档案信息",
  "Tài khoản": "账户",
  "Đổi mật khẩu": "修改密码",
  "Đổi ngôn ngữ (Tiếng Việt / 中文)": "切换语言 (Tiếng Việt / 中文)",
  "Gọi hỗ trợ, hotline HTX": "联系技术支持与合作社热线",
  "Hỗ trợ": "帮助支持",

  // ─── Hồ sơ tài khoản & Đổi mật khẩu & Thông báo ───
  "Thông tin tài khoản": "账户信息",
  "HỘ THÀNH VIÊN": "社员农户",
  "Hộ thành viên": "社员农户",
  "Số điện thoại": "手机号码",
  "Chưa cập nhật": "未更新",
  "CCCD chủ hộ": "户主身份证号",
  "Địa bàn": "所属区域",
  "Xã Krông Búk": "克容布乡 (Krông Búk)",
  ", Krông Búk": "，克容布 (Krông Búk)",
  "Trưởng thôn": "村长",
  "Trưởng thôn:": "村长：",
  "Trưởng thôn (": "村长（",
  "Quy mô vườn": "果园规模",
  "thửa": "块",
  "thửa ·": "个地块 ·",
  "Thửa": "地块",
  "· Thửa": "· 地块",
  "(Thửa": "（地块",
  "Ngôn ngữ": "界面语言",
  "Trang giới thiệu HTX": "合作社介绍主页",
  "Về trang giới thiệu": "返回介绍页",
  "Về trang giới thiệu HTX Cư Né": "返回居内合作社介绍页",
  "HTX Cư Né – về trang giới thiệu": "居内合作社 – 返回介绍页",
  "Về trang giới thiệu HTX Krông Búk": "返回居内合作社介绍页",
  "HTX Krông Búk – về trang giới thiệu": "居内合作社 – 返回介绍页",
  "Đăng xuất": "退出登录",
  "Thông báo từ HTX": "合作社通知",
  "Bạn có": "您有",
  "thông báo chưa đọc": "条未读通知",
  "Đánh dấu đã đọc hết": "全部标为已读",
  "Đang đánh dấu…": "正在标记…",
  "Hiện chưa có thông báo mới nào từ HTX.": "目前暂无来自合作社的新通知。",
  "Đổi mật khẩu tài khoản": "修改账户密码",
  "Mật khẩu hiện tại": "当前密码",
  "Mật khẩu mới (ít nhất 8 ký tự)": "新密码（至少8位字符）",
  "Nhập lại mật khẩu mới": "确认新密码",
  "Sau khi đổi mật khẩu thành công, hệ thống sẽ đăng xuất để bạn đăng nhập lại bằng mật khẩu mới.":
    "密码修改成功后，系统将自动退出，请使用新密码重新登录。",
  "Mật khẩu mới phải có tối thiểu 8 ký tự.": "新密码长度至少为8个字符。",
  "Xác nhận mật khẩu mới chưa khớp.": "两次输入的新密码不一致。",
  "Mật khẩu mới phải khác mật khẩu hiện tại.": "新密码不能与当前密码相同。",
  "Không đổi được mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.": "密码修改失败，请检查当前密码是否正确。",
  "Hủy": "取消",
  "Hủy bỏ": "取消",
  "Đang cập nhật…": "正在更新…",
  "Lưu mật khẩu mới": "保存新密码",
  "Đóng": "关闭",
  "Đóng (Esc)": "关闭 (Esc)",
  "Đóng chi tiết": "关闭详情",
  "Đã hiểu & Đóng": "已了解并关闭",
  "Đồng ý": "确定",
  "Không": "否",
  "Có": "是",
  "☑ Không": "☑ 否",
  "☐ Có": "☐ 是",
  "Tất cả": "全部",
  "Đang xử lý…": "处理中…",
  "Kéo hoặc vuốt xuống để đóng": "下拉关闭",

  // ─── Trạng thái chuẩn (portal-labels) ───
  "Đủ chuẩn xuất khẩu": "符合出口标准",
  "Đủ chuẩn XK": "符合出口标准",
  "Cần cải thiện": "需整改提升",
  "Chờ duyệt": "待审核",
  "Có vi phạm": "存在违规",
  "Đã duyệt": "已审核通过",
  "Vi phạm": "违规提醒",
  "Định kỳ": "定期检查",
  "Đột xuất": "突击抽查",
  "Phúc tra": "复查验收",
  "Đã xuất": "已出口",
  "Đã giao": "已交付",
  "Đang vận chuyển": "运输中",
  "Đang lấy mẫu": "采样检测中",
  "Đang chờ duyệt": "等待审核",
  "Bị từ chối": "已驳回",
  "Đã hủy": "已取消",
  "Chờ HTX xác nhận": "等待合作社确认",
  "HTX đã xác nhận": "合作社已确认",
  "Chưa kích hoạt": "未激活",
  "Đã kích hoạt": "已激活",
  "Đã thu hồi": "已收回",
  "Đã đăng ký": "已报名",
  "Đã tham dự": "已参加",
  "Đã điểm danh tham dự": "已签到参加",
  "Vắng mặt": "缺席",
  "Đã hủy đăng ký": "已取消报名",
  "Được phép": "允许使用",
  "Được phép sử dụng": "允许使用",
  "Hạn chế": "限制使用",
  "Kiểm soát đặc biệt": "特别管控",
  "Bị cấm": "禁止使用",
  "Bị cấm (GACC)": "严禁使用 (GACC)",
  "Cấm lưu hành": "严禁流通使用",
  "Đạt": "合格",
  "Không đạt": "不合格",
  "Vượt ngưỡng": "超标",
  "Âm tính": "阴性（未检出）",
  "Dương tính": "阳性（检出）",
  "Hôm nay": "今天",
  "Ngày mai": "明天",
  "Hôm qua": "昨天",
  "Sắp diễn ra": "即将开始",
  "Đã diễn ra": "已结束",
  "Đã hoàn thành": "已完成",
  "Cần khắc phục": "需立即整改",
  "Chờ xác nhận": "等待合作社核实",

  // ─── Công việc canh tác ───
  "Tưới nước": "灌溉浇水",
  "Bón phân": "施肥管理",
  "Phun thuốc": "喷施农药",
  "Phun thuốc BVTV": "喷施植保农药",
  "Làm đất & Cải tạo đất": "整地与土壤改良",
  "Xử lý ra hoa & Nuôi đọt": "促花处理与新梢培育",
  "Thụ phấn bổ sung": "人工辅助授粉",
  "Tỉa cành & Tỉa quả non": "修剪枝条与疏果",
  "Bao trái sầu riêng": "榴莲套袋护果",
  "Cắt cỏ": "果园除草",
  "Cắt cỏ & Dọn vườn": "除草与清园管理",
  "Khác": "其他作业",
  "Nước giếng khoan": "深井水灌溉",
  "Cắt thủ công, chu kỳ 45 ngày": "人工除草，周期 45 天",

  // ─── Trang chủ (HomeTab) ───
  "Hộ canh tác sầu riêng VietGAP liên kết Hợp tác xã Cư Né, Đắk Lắk.":
    "多乐省居内合作社 (Cư Né, Đắk Lắk) VietGAP 认证榴莲签约种植户。",
  "Hộ canh tác sầu riêng VietGAP liên kết Hợp tác xã Krông Búk, Đắk Lắk.":
    "多乐省居内合作社 (Cư Né, Đắk Lắk) VietGAP 认证榴莲签约种植户。",
  "Mọi thứ đều ổn. Hiện chưa có việc cần làm ngay.": "一切正常，目前暂无紧急待办事项。",
  "Thông số canh tác": "果园核心指标",
  "Số thửa": "地块数量",
  "Diện tích": "种植面积",
  "Sản lượng": "累计产量",
  "Mã vùng trồng": "注册果园代码 (PUC)",
  "Ghi nhật ký": "记农事日志",
  "Mở nhật ký canh tác để ghi chép hoạt động": "打开农事日志记录田间作业",
  "Nhắc nhở": "待办提醒",
  "Nhắc nhở và nhiệm vụ hôm nay": "今日提醒与待办任务",
  "Xem tất cả": "查看全部",
  "Lịch kiểm tra": "巡检与采样计划",
  "Lịch kiểm tra & lấy mẫu": "田间巡检与采样计划",
  "Hiện chưa có lịch kiểm tra hoặc lấy mẫu nào sắp tới.": "近期暂无田间巡检或采样计划。",
  "Nhấn để xem chi tiết đợt kiểm tra trong tab riêng": "点击查看巡检详情",
  "Lớp tập huấn": "技术培训课程",
  "Lớp tập huấn sắp tới": "近期技术培训班",
  "Lớp tập huấn sắp diễn ra": "即将开课的培训班",
  "Hiện không có lớp tập huấn nào diễn ra trong 10 ngày tới.": "未来10天内暂无培训课程安排。",
  "Nhấn để xem chi tiết khóa tập huấn và đăng ký": "点击查看培训详情并报名",
  "Bấm để xem chi tiết khóa tập huấn và đăng ký": "点击查看培训详情并报名",
  "Bấm để xem thông tin khóa đã học": "点击查看已完成培训详情",
  "Thông tin lớp tập huấn": "培训课程详情",
  "Lấy mẫu": "采样检测",
  "Kiểm tra": "田间检查",
  "Đợt kiểm tra": "巡检批次",
  "Thực địa": "实地核查",
  "Hộ vi phạm": "违规农户",
  "Chưa ghi nhật ký": "未按期记录日志",
  "Chưa ghi nhật ký 7 ngày": "满7天未记录农事日志",
  "Chưa có bản ghi": "暂无记录",
  "Khắc phục vi phạm": "违规项整改",
  "Vi phạm dùng thuốc": "农药使用违规",
  "Vi phạm dùng thuốc BVTV": "植保农药违规使用",
  "Mẫu kiểm nghiệm chưa đạt": "检测样本未达标",
  "Chưa cắm biển vườn": "尚未安装果园标识牌",
  "Lấy mẫu kiểm nghiệm": "实验室检测采样",
  "Phúc tra vi phạm": "违规整改复查",
  "Kiểm tra thực địa": "田间实地检查",
  "Kiểm tra định kỳ VietGAP": "VietGAP定期巡检",
  "Kiểm tra đột xuất": "突击抽检",
  "Từ chối khai báo thu hái": "采收申报被驳回",
  "Định kỳ vùng trồng Thôn 1": "第 1 村种植区定期检查",
  "Kiểm tra định kỳ vùng trồng Thôn 1": "第 1 村种植区定期检查",
  "Tồn dư thuốc BVTV": "植保农药残留检测",
  "Lấy mẫu kiểm nghiệm tồn dư thuốc BVTV": "植保农药残留实验室采样检测",
  "Kiểm tra thực địa Thôn 1": "第 1 村田间实地核查",
  "Kiểm tra thực địa Thôn 4": "第 4 村田间实地核查",
  "Lấy mẫu kiểm nghiệm Thôn 3": "第 3 村检测采样",
  "Phúc tra hộ vi phạm Thôn 5": "第 5 村违规农户复查",
  "Thực địa Thôn 1": "第 1 村实地核查",
  "Thực địa Thôn 3": "第 3 村实地培训",
  "Thực địa Thôn 4": "第 4 村实地核查",
  "Hộ vi phạm Thôn 5": "第 5 村违规农户复查",

  // ─── Tab Thửa đất (PlotsTab, PlotMapModal & GardenSignboardModal) ───
  "Thửa đất của tôi": "我的果园地块",
  "Danh sách thửa đất": "果园地块列表",
  "Bản đồ vùng trồng": "果园卫星地图",
  "Dữ liệu bản đồ thửa đất chưa được bật trên hệ thống. Vui lòng liên hệ cán bộ HTX.":
    "系统尚未启用地块地图数据，请联系合作社管理员。",
  "Chưa có thửa đất nào được ghi nhận cho hộ của bạn. Vui lòng liên hệ cán bộ HTX để được hướng dẫn đăng ký thửa đất.":
    "您的农户名下暂无登记地块，请联系合作社管理员指导办理地块登记。",
  "Bấm vào thẻ để mở bản đồ toàn cảnh thửa đất": "点击卡片打开地块全景地图",
  "Bấm để mở bung toàn cảnh bản đồ thửa đất": "点击展开地块全景地图",
  "Đóng bản đồ (Esc)": "关闭地图 (Esc)",
  "Đóng bản đồ toàn cảnh": "关闭全景地图",
  "Vuốt xuống hoặc bấm để thu gọn thông tin": "下拉或点击收起信息",
  "Vuốt lên để mở rộng hoặc vuốt xuống để tắt": "上滑展开详情，下滑关闭",
  "Thu gọn thông tin": "收起信息",
  "Mở rộng thông tin": "展开信息",
  "Cây thuần thục": "成年结果树",
  "Tự khai báo": "农户自报",
  "Đo thực địa": "实地测绘",
  "Địa chính": "地籍图册",
  "Mẫu": "示范地块",
  "Mở ứng dụng Google Maps để nhận chỉ đường tới tận thửa đất": "打开 Google 地图导航至该地块",
  "Biển QR": "果园铭牌",
  "Biển cắm vườn": "果园标识牌",
  "In bảng tên vườn": "打印果园标识牌",
  "In biển cắm vườn": "打印果园标识牌",
  "Xem và in biển cắm vườn": "查看并打印果园标识牌",
  "Hình 1 - Bước 1: Gắn mã định danh lô canh tác": "图 1 - 步骤 1：安装果园地块溯源标识牌",
  "Bà con in biển này ra khổ A4 hoặc ép plastic chống nước để cắm tại cọc mốc đầu lô đất canh tác.":
    "请将此标识牌按 A4 尺寸打印并进行防水塑封，安装在果园地块入口标桩处。",
  "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM": "越南社会主义共和国",
  "HỢP TÁC XÃ NÔNG NGHIỆP CƯ NÉ – ĐẮK LẮK": "多乐省居内农业合作社 (CƯ NÉ – ĐẮK LẮK)",
  "HỢP TÁC XÃ NÔNG NGHIỆP KRÔNG BÚK – ĐẮK LẮK": "多乐省居内农业合作社 (CƯ NÉ – ĐẮK LẮK)",
  "BIỂN ĐỊNH DANH LÔ CANH TÁC SẦU RIÊNG": "榴莲种植地块溯源标识牌",
  "MÃ SỐ LÔ CANH TÁC:": "地块登记编码：",
  "Mã số vùng trồng (PUC):": "注册果园代码 (PUC)：",
  "Chủ hộ canh tác:": "种植户主：",
  "Diện tích lô:": "地块面积：",
  "Giống sầu riêng:": "榴莲品种：",
  "Năm trồng:": "定植年份：",
  "Quy chuẩn áp dụng:": "执行标准：",
  "VietGAP & Nghị định thư GACC": "VietGAP 标准与海关总署 (GACC) 议定书",
  "QUÉT QR XEM HỒ SƠ LÔ VƯỜN": "扫码查看果园地块档案",
  "Hệ thống truy xuất nguồn gốc nông sản CheckVN · Cục Bảo vệ Thực vật":
    "CheckVN 农产品溯源系统 · 植物保护局认证",
  "NGHIÊM CẤM TỰ Ý THAY ĐỔI BIỂN CẮM RANH GIỚI VÙNG TRỒNG": "严禁擅自移动或更改种植区边界标识牌",
  "Hộ nông dân Krông Búk": "居内合作社社员农户",
  "Hộ nông dân HTX Cư Né": "居内合作社社员农户",
  "Chủ hộ": "户主",
  "Chủ hộ:": "户主：",
  "Diện tích:": "面积：",
  "Giống:": "品种：",
  "Giống": "品种",
  "Năm trồng": "定植年份",
  "Số cây": "果树株数",
  "Vệ tinh": "卫星图",
  "Bản đồ": "街道图",
  "Toàn cảnh": "全景",
  "Chuyển chế độ xem ảnh vệ tinh": "切换至卫星影像视图",
  "Chuyển chế độ xem bản đồ giao thông": "切换至道路地图视图",
  "Số thửa / Tờ bản đồ": "地块号 / 图幅号",
  "· Tờ #": "· 图幅 #",
  "Tọa độ tâm WGS84": "WGS84 中心坐标",
  "Tọa độ tâm thửa": "地块中心坐标",
  "Định vị vệ tinh GPS": "GPS 卫星定位",
  "Chỉ đường Google Maps": "Google 地图导航",
  "Mở trên Google Maps": "在 Google 地图中打开",

  // ─── Tab Nhật ký (DiaryTab) ───
  "Canh tác": "农事作业",
  "Quy tắc VietGAP": "VietGAP 核心准则",
  "Quy chuẩn VietGAP": "VietGAP 标准",
  "Cập nhật đều đặn các việc tưới tiêu, bón phân, tỉa cành, bao trái phục vụ kiểm tra vùng trồng.":
    "定期记录灌溉、施肥、修剪、套袋等农事作业，以备种植区核查。",
  "Ngưng dùng phân thuốc trước ngày thu hoạch đúng thời hạn (PHI) để không vượt tồn dư cho phép.":
    "采收前严格遵守农药安全间隔期 (PHI) 停止用药，确保农残不超标。",
  "Tuyệt đối không dùng chất nhuộm màu (Vàng O), hoạt chất cấm Chlorpyrifos hoặc thuốc chưa cấp phép.":
    "严禁使用工业染色剂（碱性嫩黄 Auramine O）、禁用农药毒死蜱或未获准登记的农药。",
  "Hoạt chất nằm trong danh mục hạn chế hoặc không đạt tiêu chuẩn MRL. Vui lòng tham vấn cán bộ kỹ thuật.":
    "该有效成分属于限制名录或存在 MRL 超标风险，请咨询合作社技术员。",
  "Bà con ghi chép đầy đủ các hoạt động bón phân, tưới nước, tỉa cành định kỳ tối thiểu 7 ngày/lần.":
    "社员农户需定期完整记录施肥、灌溉、修剪等农事作业，至少每7天记录一次。",
  "Tuyệt đối ngừng phun thuốc trước ngày thu hoạch theo đúng số ngày cách ly (PHI) ghi trên nhãn.":
    "采收前必须严格按照农药标签规定的安全间隔期 (PHI) 停止施药。",
  "Chỉ sử dụng thuốc BVTV trong danh mục cho phép; nghiêm cấm hoạt chất cấm theo quy định GACC.":
    "仅限使用允许名录内的植保农药，严禁使用中国海关总署 (GACC) 规定禁用的有效成分。",
  "Hộ của bạn không có cảnh báo hay vi phạm nhật ký nào. Hãy tiếp tục duy trì ghi chép đúng quy chuẩn VietGAP.":
    "您的农户档案目前没有任何违规或预警记录，请继续保持符合 VietGAP 标准的农事记录。",
  "Nhật ký canh tác chưa cập nhật 7+ ngày": "农事日志超过 7 天未更新",
  "Theo quy định HTX, hộ cần ghi nhật ký canh tác tối thiểu 7 ngày/lần. Vui lòng cập nhật sớm.":
    "根据合作社规定，农户需至少每 7 天记录一次农事日志，请尽快补充更新。",
  "Không cập nhật nhật ký canh tác 15+ ngày": "超过 15 天未更新农事日志",
  "Hộ chưa ghi nhật ký kể từ ngày 10/10/2024. Theo quy định HTX, tần suất ghi nhật ký tối thiểu là 7 ngày/lần.":
    "自 10/10/2024 起未记录农事日志。根据合作社规定，最低记录频率为每 7 天一次。",
  "Sử dụng thuốc bị cấm – Carbaryl 80%": "使用禁用农药 – Carbaryl 80%",
  "Phát hiện trong nhật ký phun thuốc ngày 23/10/2024. Carbaryl không nằm trong danh mục được phép sử dụng trên sầu riêng xuất khẩu sang Trung Quốc.":
    "在 23/10/2024 的施药日志中发现。甲萘威 (Carbaryl) 不在出口中国榴莲允许使用的农药名录内。",
  "Tồn dư Chlorpyrifos vượt ngưỡng MRL": "毒死蜱 (Chlorpyrifos) 残留超标 (MRL)",
  "Kết quả kiểm nghiệm mẫu ngày 20/10: Chlorpyrifos = 0.08 mg/kg, vượt ngưỡng GACC (0.05 mg/kg). Cần cách ly thêm 14 ngày.":
    "10月20日样本检测结果：毒死蜱 = 0.08 mg/kg，超出 GACC 限量 (0.05 mg/kg)，需延长隔离期 14 天。",
  "Phát hiện:": "发现日期：",
  "Cập nhật khắc phục": "更新整改报告",
  "Báo đã khắc phục": "上报完成整改",
  "Báo đã khắc phục vi phạm": "提交违规整改报告",
  "Nội dung báo cáo đã khắc phục": "已采取的整改措施说明",
  "Mô tả rõ công việc gia đình đã thực hiện để khắc phục (ví dụ: Đã cập nhật nhật ký canh tác, đã thu gom vỏ bao bì thuốc BVTV về kho chứa...)":
    "请详细说明已采取的整改措施（例如：已补充农事作业记录、已按规定回收农药包装物等）",
  "Vui lòng mô tả biện pháp đã khắc phục.": "请填写已采取的整改措施。",
  "Không gửi được phản hồi khắc phục.": "提交整改报告失败，请重试。",
  "Ảnh minh chứng sau khắc phục (tùy chọn)": "整改后现场照片证明（选填）",
  "Chụp ảnh hoặc tải ảnh minh chứng": "拍摄或上传整改证明照片",
  "Gửi kèm ảnh thực tế giúp cán bộ kiểm tra xác nhận đóng cảnh báo/vi phạm nhanh hơn":
    "附上实地照片有助于合作社技术员更快核实并解除违规预警",
  "Đang gửi báo cáo…": "正在提交报告…",
  "Gửi báo cáo khắc phục": "提交整改报告",
  "Ảnh minh chứng khắc phục của hộ": "农户提交的整改证明照片",
  "QUY TẮC 1 · ĐỊNH KỲ": "规则 1 · 定期记录",
  "Ghi nhật ký 7 ngày/lần": "每7天至少记录一次",
  "QUY TẮC 2 · CÁCH LY": "规则 2 · 安全间隔",
  "Cách ly trước thu hoạch": "严格遵守采前安全间隔期",
  "QUY TẮC 3 · AN TOÀN": "规则 3 · 用药安全",
  "Cấm thuốc ngoài danh mục": "严禁使用名录外禁用农药",
  "Loại nhật ký": "日志类型",
  "Nhật ký canh tác": "农事作业日志",
  "Nhật ký phun thuốc": "施药记录日志",
  "+ Thêm mới": "新增记录",
  "Thêm mới": "新增记录",
  "Thêm ghi chép mới": "新增农事记录",
  "Chưa có nhật ký nào. Bấm “+ Thêm mới” để ghi công việc đầu tiên.":
    "暂无农事日志。点击“新增记录”添加第一条农事作业。",
  "Chưa có nhật ký nào. Bấm “Thêm mới” để ghi công việc đầu tiên.":
    "暂无农事日志。点击“新增记录”添加第一条农事作业。",
  "Bấm để xem chi tiết nhật ký": "点击查看农事日志详情",
  "Chưa có lần phun thuốc nào được ghi.": "暂无施药记录。",
  "Bấm để xem chi tiết phun thuốc": "点击查看施药记录详情",
  "Ghi nhật ký phun thuốc": "记录农药施用日志",
  "Mẹo: ghi thêm nhật ký canh tác “Phun thuốc” để cán bộ đối chiếu theo thửa.":
    "提示：可同时在农事作业中记录“喷施农药”，方便技术员按地块核对。",
  "Chi tiết nhật ký canh tác": "农事作业日志详情",
  "Chi tiết lần phun thuốc": "施药记录详情",
  "Ngày thực hiện": "作业日期",
  "Nhập mã thửa đất": "输入或选择地块编号",
  "Công việc canh tác": "农事作业项目",
  "Ghi chú & Vật tư sử dụng": "作业备注与使用农资",
  "Mô tả công việc (ví dụ: Bón phân hữu cơ vi sinh 5 kg/gốc, tưới ẩm, tỉa cành thông thoáng...)":
    "描述作业内容（例如：每株施用有机微生物肥 5 公斤、灌溉保湿、修剪通风枝条...）",
  "Tọa độ GPS vườn (tùy chọn)": "果园 GPS 坐标（选填）",
  "Chưa định vị (khuyến nghị gắn GPS xác thực tại vườn)": "尚未定位（建议在果园现场获取 GPS 认证）",
  "Lấy vị trí định vị của vườn hiện tại": "获取当前果园 GPS 定位",
  "Thiết bị hoặc trình duyệt không hỗ trợ định vị GPS.": "当前设备或浏览器不支持 GPS 定位。",
  "Chưa cấp quyền vị trí GPS. Bạn vẫn có thể lưu nhật ký không kèm tọa độ.":
    "未授予 GPS 位置权限，您仍可保存不含坐标的农事日志。",
  "Không lấy được tín hiệu GPS hiện tại. Bạn vẫn có thể lưu nhật ký.":
    "无法获取当前 GPS 信号，您仍可直接保存农事日志。",
  "Đang lấy GPS…": "正在获取 GPS…",
  "Cập nhật GPS": "更新 GPS",
  "Định vị vườn": "果园定位",
  "Ảnh chụp hiện trường vườn": "果园现场照片",
  "Chụp ảnh hoặc tải ảnh hiện trường": "拍摄或上传果园现场照片",
  "Bấm để mở máy ảnh hoặc chọn ảnh thực tế tại vườn (tự động nén nhanh)":
    "点击打开相机或选择果园实景照片（自动快速压缩）",
  "Đang tải ảnh & lưu…": "正在上传照片并保存…",
  "Vui lòng chụp ảnh hiện trường trước khi lưu": "保存前请先拍摄或上传现场照片",
  "Vui lòng chọn hoặc nhập mã thửa đất.": "请选择或输入地块编号。",
  "Vui lòng chụp hoặc chọn ảnh hiện trường vườn trước khi lưu.": "保存前请拍摄或选择果园现场照片。",
  "Vui lòng chụp hoặc chọn ảnh hiện trường vườn.": "请拍摄或选择果园现场照片。",
  "Không lưu được nhật ký. Vui lòng thử lại.": "保存日志失败，请重试。",
  "Không lưu được nhật ký phun thuốc.": "保存施药记录失败，请重试。",
  "Lưu nhật ký": "保存日志",
  "Lưu nhật ký phun": "保存施药记录",
  "Lưu lần phun": "保存施药记录",
  "Ngày phun": "施药日期",
  "Tất cả thửa / Toàn vườn": "全部地块 / 全园",
  "Mã thửa (không bắt buộc)": "地块编号（选填）",
  "Loại thuốc": "农药名称",
  "Chọn thuốc": "选择农药",
  "(BỊ CẤM)": "（严禁使用）",
  "Thuốc này nằm trong danh mục bị cấm. Không được dùng cho sầu riêng xuất khẩu. Nếu đã lỡ dùng, bạn vẫn nên ghi lại trung thực và báo cán bộ HTX.":
    "该农药属于严禁使用名录，不得用于出口榴莲。如已误用，请如实记录并立即报告合作社技术员。",
  "Thời gian cách ly:": "安全间隔期：",
  "ngày trước khi thu hoạch.": "天（采收前停止施药）。",
  "ngày": "天",
  "Liều lượng": "使用剂量",
  "Diện tích (ha)": "施药面积 (公顷 ha)",
  "Nơi mua (không bắt buộc)": "购买农资店（选填）",
  "Tên đại lý": "农资经销店名称",
  "Đang lưu…": "正在保存…",
  "Có ảnh hiện trường": "含现场照片",
  "Bản ghi này không có tệp ảnh đính kèm trên máy chủ.": "此记录在服务器上无附加照片文件。",
  "Thửa canh tác": "作业地块",
  "Người ghi chép": "记录人",
  "Cán bộ HTX": "合作社干部",
  "Mã ghi nhận": "记录编号",
  "Tọa độ GPS thực địa": "实地 GPS 坐标",
  "✓ Đã xác thực thực địa": "✓ 已通过实地坐标认证",
  "Nội dung công việc & vật tư sử dụng": "作业内容与使用农资",
  "Không có ghi chú thêm cho lần canh tác này.": "本次农事作业无补充备注。",
  "Xóa bản ghi này (trong 24h)": "删除此记录（24小时内）",
  "Xác nhận xóa bản ghi nhật ký này?": "确认删除这条农事日志记录吗？",
  "Không xóa được bản ghi nhật ký.": "无法删除该日志记录。",
  "Xóa nhật ký": "删除日志",
  "Đạt chuẩn MRL": "符合 MRL 农残标准",
  "Không đạt chuẩn": "未达标",
  "Thuốc cấm": "禁用农药",
  "Liều lượng sử dụng": "施用剂量",
  "Diện tích phun": "施药面积",
  "Cách ly trước thu hoạch (PHI)": "采收前安全间隔期 (PHI)",
  "Ngày thực hiện phun": "施药日期",
  "Nguồn gốc & Đại lý cung cấp": "农资来源与供应经销商",
  "Chưa ghi nhận đại lý cung cấp": "未记录供应经销商",
  "ĐL An Khang – Buôn Ma Thuột": "安康农资经销店 – 邦美蜀",
  "ĐL Nông Tín – Krong Buk": "农信农资经销店 – 克容布",
  "ĐL Minh Phát – Buôn Hồ": "明发农资经销店 – 奔湖",
  "Đáp ứng tiêu chuẩn xuất khẩu VietGAP": "符合 VietGAP 与出口安全标准",
  "Cảnh báo an toàn dư lượng": "农残安全风险预警",

  // ─── Tab Thu hoạch & Tem (StampsTab, FruitStampsView & HarvestLotTicket) ───
  "Quy chuẩn thu hoạch": "采收与品控标准",
  "Bà con nông dân đăng ký ngày dự kiến thu hoạch và sản lượng ước tính trên cổng để HTX bố trí lịch kiểm định.":
    "社员农户在门户登记预计采收日期与预估产量，以便合作社安排品控核验日程。",
  "Cán bộ kỹ thuật HTX cùng Kiểm tra viên KCS trực tiếp về vườn kiểm tra cách ly thuốc BVTV (thời gian PHI) và cân đo phân loại.":
    "合作社技术员与 KCS 品控员直接到果园核查农药安全间隔期 (PHI) 并称重分级。",
  "HTX nghiệm thu xuất khẩu chính ngạch và kích hoạt tem niêm phong điện tử truy xuất nguồn gốc khi đóng gói xuất xưởng.":
    "合作社完成正贸出口验收，并在包装出厂时激活防伪二维码电子溯源封签。",
  "QUY CHUẨN 1 · KHAI BÁO VƯỜN": "标准 1 · 采收申报",
  "Đăng ký ngày cắt & sản lượng dự kiến": "登记预计采果日期与预估产量",
  "QUY CHUẨN 2 · KIỂM ĐỊNH KCS": "标准 2 · KCS 品控检验",
  "Thẩm định tồn dư BVTV & Phân loại quả": "农残安全核验与榴莲果品分级",
  "QUY CHUẨN 3 · CẤP TEM NIÊM PHONG": "标准 3 · 签发溯源封签",
  "Kích hoạt tem niêm phong điện tử": "激活出口防伪二维码溯源标签",
  "Chế độ thu hoạch": "采收管理模式",
  "Khai báo thu hái (": "采收产量申报 (",
  "Khai báo (": "采收申报 (",
  "Lô hàng xuất kho (": "出库批次 (",
  "Lô hàng (": "出库批次 (",
  "Khai báo thu hái tại vườn": "果园采收产量申报",
  "Gửi thông tin sản lượng thu hái để HTX kiểm định chất lượng & xác nhận vào lô xuất khẩu.":
    "提交果园采收产量信息，以便合作社进行品质核验并纳入出口批次。",
  "+ Khai báo mới": "+ 新增采收申报",
  "“+ Khai báo mới”": "“+ 新增采收申报”",
  "Khai báo mới": "新增申报",
  "Chưa có đợt thu hái nào được đăng ký. Bấm": "暂无已登记的采收批次。请点击",
  "để gửi thông tin thu hái cho HTX.": "向合作社提交采收申报。",
  "Lô hàng xuất kho": "出库批次与溯源",
  "Lô hàng & Mã QR": "出库批次与二维码",
  "Chưa có lô thu hoạch nào của hộ bạn được xuất kho.": "您的农户名下暂无已出库的采收批次。",
  "Khai báo đợt thu hái sầu riêng gửi HTX": "向合作社提交本批次榴莲采收申报",
  "Thửa đất canh tác thu hái": "采收地块编号",
  "Ngày cắt trái": "采果日期",
  "Tổng sản lượng (kg)": "总产量 (kg)",
  "Tổng sản lượng:": "总产量：",
  "Loại 1 / VIP (kg)": "一等果 / VIP (kg)",
  "Loại 2 (kg)": "二等果 (kg)",
  "kg · Loại 2:": "kg · 二等果：",
  "Đánh giá chất lượng dự kiến": "预计果品品质等级",
  "Ghi chú gửi Cán bộ HTX": "给合作社干部的备注",
  "Ví dụ: Trái già đủ ngày, cơm vàng, nhờ HTX kiểm định...": "例如：果实成熟度达标、果肉金黄，请合作社安排品控核验...",
  "Vui lòng chọn hoặc nhập mã thửa đất thu hái.": "请选择或输入采收地块编号。",
  "Tổng sản lượng thu hái phải lớn hơn 0 kg.": "采收总产量必须大于 0 公斤。",
  "Khối lượng phân loại không được âm.": "分级重量不能为负数。",
  "Tổng khối lượng Loại 1 (A) và Loại 2 (B) không được vượt quá tổng sản lượng.":
    "一等果 (A) 与二等果 (B) 重量之和不能超过总产量。",
  "Ngày khai báo thu hái không được ở tương lai.": "采收申报日期不能是未来日期。",
  "Có lỗi khi lưu khai báo thu hái.": "保存采收申报时出错。",
  "Không xóa được bản khai báo thu hái.": "无法删除该采收申报记录。",
  "Thu hái đợt 1 vườn sầu riêng Monthong, độ ngọt Brix 32.5, trái đều hộc":
    "第一批金枕 (Monthong) 榴莲采收，甜度 Brix 32.5，果型匀称饱满",
  "Thu hái đợt 2 chuyển giao về nhà đóng gói PHC của HTX":
    "第二批榴莲采收，已移交至合作社 PHC 包装厂",
  "Gửi khai báo thu hái cho HTX": "向合作社提交采收申报",
  "Gửi khai báo thu hái": "提交采收申报",
  "Sầu riêng": "榴莲",
  "Loại 1": "一等果",
  "Loại 1 (VIP)": "一等果 (VIP)",
  "Loại 1 (VIP xuất khẩu)": "一等果（出口 VIP 级）",
  "Loại 2 (Chuẩn)": "二等果（标准级）",
  "Loại 2 (Chuẩn VietGAP)": "二等果（VietGAP 标准级）",
  "Xô / Nội địa": "统果 / 内销",
  "Hàng xô / Tiêu thụ nội địa": "统果 / 国内市场销售",
  "Ảnh lô sầu riêng thu hái tại vườn": "果园采收榴莲现场照片",
  "Chụp ảnh hoặc tải ảnh lô sầu riêng": "拍摄或上传采收榴莲照片",
  "Đính kèm ảnh thực tế giúp cán bộ HTX duyệt xác nhận nhanh hơn":
    "附上实地采收照片有助于合作社干部更快审核确认",
  "Đang gửi khai báo…": "正在提交申报…",
  "Ghi chú của hộ:": "农户备注：",
  "Phản hồi từ HTX:": "合作社回复：",
  "Xóa khai báo": "删除申报",
  "Xác nhận xóa bản khai báo thu hái đang chờ xác nhận này?": "确认删除这条待确认的采收申报吗？",
  "SẦU RIÊNG TƯƠI": "鲜食榴莲",
  "LÔ": "批次",
  "MÃ TRUY XUẤT": "溯源编码",
  "Ngày thu:": "采收日期：",
  "Bấm mở": "点击查看",
  "ĐÃ XUẤT KHO": "已出库",
  "HTX CƯ NÉ · ĐÃ KIỂM TRA": "居内合作社 · 已核验",
  "HTX CƯ NÉ · GIÁM SÁT": "居内合作社 · 全程监管",
  "HTX KRÔNG BÚK · ĐÃ KIỂM TRA": "居内合作社 · 已核验",
  "HTX KRÔNG BÚK · GIÁM SÁT": "居内合作社 · 全程监管",
  "Xuất khẩu TQ": "出口中国",
  "Bấm để mở tem vé chi tiết hoặc dùng máy ảnh quét trực tiếp": "点击打开溯源标签详情或直接扫码核验",
  "Tem điện tử lô hàng": "批次电子溯源标签",
  "Tem hợp lệ": "有效溯源标",
  "Tem điện tử hợp lệ!": "电子溯源标有效！",
  "Lô sầu riêng đã được cấp mã truy xuất nguồn gốc chính thức": "该批次榴莲已获得官方防伪溯源认证编码",
  "MÃ LÔ HÀNG": "批次编码",
  "KHỐI LƯỢNG TỊNH (KLT)": "净重 (KLT)",
  "NGÀY THU HOẠCH": "采收日期",
  "THỊ TRƯỜNG": "目标市场",
  "Trung Quốc": "中国市场",
  "Nội địa": "越南内销",
  "Vùng trồng PUC-KRB-001 · VietGAP": "种植区 PUC-KRB-001 · VietGAP 认证",
  "Quét mã QR để kiểm tra nguồn gốc & nhật ký canh tác": "扫描二维码核验原产地与农事作业日志",
  "Xem toàn bộ hồ sơ truy xuất": "查看完整溯源档案",

  // ─── Tab Kiểm nghiệm & Phiếu kiểm nghiệm A4 (InspectionTab & LabTestCertificateModal) ───
  "Kết quả kiểm nghiệm": "实验室检测结果",
  "Chưa có kết quả kiểm nghiệm nào.": "暂无实验室检测报告。",
  "Bấm để xem chi tiết kết quả kiểm nghiệm": "点击查看检测报告详情与证书",
  "Hiện chưa có lịch kiểm tra nào sắp tới.": "近期暂无巡检或采样安排。",
  "Cán bộ:": "负责干部：",
  "Tải file PDF": "下载 PDF 证书",
  "Tải PDF": "下载 PDF",
  "Tải file PDF phiếu kiểm nghiệm khổ A4 về máy": "下载 A4 实验室检测报告 PDF 文件",
  "Đang tạo PDF…": "正在生成 PDF…",
  "Đang tải…": "下载中…",
  "In": "打印",
  "In phiếu": "打印报告",
  "In phiếu kiểm nghiệm khổ A4": "打印 A4 检测报告",
  "Phiếu kiểm nghiệm điện tử": "电子检测报告证书",
  "Phiếu trả kết quả kiểm nghiệm": "实验室检测结果报告单",
  "Đã ký số & chứng thực": "已数字签名与官方认证",
  "Mã QR xác thực phiếu": "证书防伪验证二维码",
  "PUC · BẢN GỐC CHỨNG THỰC": "PUC · 官方认证正本",
  "SỞ NÔNG NGHIỆP & PHÁT TRIỂN NÔNG THÔN TỈNH ĐẮK LẮK": "多乐省农业与农村发展厅",
  "SỞ NN & PTNT TỈNH ĐẮK LẮK": "多乐省农业与农村发展厅",
  "TRUNG TÂM KIỂM ĐỊNH & KHẢO NGHIỆM CHẤT LƯỢNG NÔNG LÂM THỦY SẢN": "农林水产品质量检验与测试中心",
  "* TT KIỂM ĐỊNH & KHẢO NGHIỆM CL *": "* 质量检验与测试中心 *",
  "Phòng Hóa nghiệm & Kiểm soát Dư lượng BVTV (ISO/IEC 17025:2017 - VILAS 238)":
    "化学分析与农残检测实验室 (ISO/IEC 17025:2017 - VILAS 238)",
  "Số:": "报告编号：",
  "Mã PUC:": "PUC 代码：",
  "· Mã PUC:": "· PUC 代码：",
  "Quét tra cứu gốc": "扫码查验正本",
  "PHIẾU TRẢ KẾT QUẢ KIỂM NGHIỆM": "实验室检测分析报告证书",
  "CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV": "农产品安全质量与植保农药残留检测",
  "(Theo Nghị định thư GACC Lệnh 248/249 & Quy chuẩn Kỹ thuật Quốc gia VietGAP)":
    "（依据中国海关总署 GACC 第 248/249 号令及越南国家 VietGAP 技术规范）",
  "Tên chủ hộ / Cơ sở sản xuất:": "种植户主 / 生产单位：",
  "Tên chủ hộ / Cơ sở SX:": "种植户主 / 生产单位：",
  "Mã số vùng trồng (PUC) / Thửa:": "注册果园代码 (PUC) / 地块：",
  "Mã vùng trồng / Thửa:": "注册果园代码 / 地块：",
  "VN-DLK-0028 · Thửa": "VN-DLK-0028 · 地块",
  "Địa chỉ canh tác:": "种植地址：",
  "Xã Ea Tar, Huyện Cư M'gar, Tỉnh Đắk Lắk": "多乐省克容布 / 居姆加尔种植区 (Đắk Lắk)",
  "Xã Ea Tar, H. Cư M'gar, Đắk Lắk": "多乐省克容布 / 居姆加尔种植区",
  "Đối tượng mẫu thử:": "检测样品名称：",
  "Quả sầu riêng tươi (": "鲜食榴莲果（",
  "Sầu riêng tươi (": "鲜食榴莲（",
  "Đơn vị / Người gửi mẫu:": "送检单位：",
  "Ban Kiểm soát Kỹ thuật HTX Nông nghiệp Ea Tar": "合作社技术品控委员会",
  "Ngày lấy mẫu:": "采样日期：",
  "Đơn vị kiểm nghiệm (Lab):": "检测机构 (Lab)：",
  "Tình trạng mẫu nhận:": "样品接收状态：",
  "Mẫu đại diện nguyên quả, niêm phong kẹp chì mã": "整果代表性样品，铅封完好，封签号",
  "Mẫu đại diện nguyên quả, niêm phong mã": "整果代表性样品，封签号",
  "Yêu cầu kiểm nghiệm:": "检测项目要求：",
  "Phân tích kim loại nặng Cadimi (Cd), Dư lượng BVTV, Hoạt chất cấm Chlorpyrifos, Phẩm nhuộm Vàng O (Auramine O).":
    "重金属镉 (Cd)、多农残筛查、禁用成分毒死蜱 (Chlorpyrifos)、工业染料碱性嫩黄 (Auramine O) 定量分析。",
  "Phương pháp xét nghiệm:": "检测分析方法：",
  "Sắc ký khí & lỏng khối phổ (GC-MS/MS, LC-MS/MS), Quang phổ hấp thụ nguyên tử AAS (AOAC 2007.01, TCVN 7602:2007).":
    "气相/液相色谱-串联质谱法 (GC-MS/MS, LC-MS/MS)、原子吸收光谱法 AAS (AOAC 2007.01, TCVN 7602:2007)。",
  "KẾT QUẢ THỬ NGHIỆM:": "检测分析结果：",
  "TÊN CHỈ TIÊU KIỂM NGHIỆM": "检测指标名称",
  "PHƯƠNG PHÁP THỬ": "检测方法",
  "ĐƠN VỊ": "单位",
  "KẾT QUẢ": "实测结果",
  "NGƯỠNG CHO PHÉP": "限量标准 (MRL)",
  "Hàm lượng Cadimi (Cd)": "重金属镉 (Cd) 含量",
  "Kim loại nặng theo Lệnh 248/249": "重金属限量（GACC 248/249号令）",
  "Tổng dư lượng hóa chất BVTV": "植保农药总残留量",
  "Nhóm Phospho & Cúc tổng hợp": "有机磷与拟除虫菊酯类",
  "Hoạt chất Chlorpyrifos Ethyl": "毒死蜱 (Chlorpyrifos Ethyl)",
  "Danh mục cấm theo TT 10/2024": "第 10/2024 号通知禁用名录",
  "KPH (Cấm tuyệt đối)": "未检出 KPH（绝对禁用）",
  "Chất cấm Vàng O (Auramine O)": "碱性嫩黄 (Auramine O / 染黄剂)",
  "Phẩm nhuộm công nghiệp cấm": "严禁使用的工业染色剂",
  "Phương pháp LC-MS/MS": "液质联用法 LC-MS/MS",
  "Định tính": "定性检测",
  "Âm tính (Cấm tuyệt đối)": "阴性（绝对禁用）",
  "KẾT LUẬN:": "检测结论：",
  "Mẫu sầu riêng ĐẠT TIÊU CHUẨN AN TOÀN VỆ SINH THỰC PHẨM VÀ ĐỦ ĐIỀU KIỆN XUẤT KHẨU CHÍNH NGẠCH SANG THỊ TRƯỜNG TRUNG QUỐC (Theo Lệnh 248/249 GACC & Tiêu chuẩn VietGAP).":
    "该榴莲样品符合食品安全卫生标准，具备正贸出口中国市场资格（符合中国海关总署 GACC 第 248/249 号令及 VietGAP 标准）。",
  "Mã quy trình kiểm nghiệm:": "检测规程编号：",
  "Sử dụng PXN tham chiếu:": "使用参比实验室：",
  "Chú thích:": "备注说明：",
  "Thời điểm trả kết quả:": "报告签发时间：",
  "Người thực hiện phân tích": "检验分析员",
  "(Ký và ghi rõ họ tên)": "（签名并注明全名）",
  "Kỹ thuật viên Phân tích Hóa nghiệm": "化学分析技术员",
  "GIÁM ĐỐC TRUNG TÂM KIỂM NGHIỆM": "检测中心主任",
  "(Ký tên và đóng dấu pháp nhân)": "（法人签名并盖章）",
  "Giám đốc Trung tâm Kiểm nghiệm": "检测中心主任",
  "Mã bảo mật điện tử:": "电子防伪安全码：",
  "Mã bảo mật:": "防伪安全码：",
  "Xác thực trực tuyến tại Cổng Dịch vụ công Quốc gia: puc.mard.gov.vn":
    "国家公共服务门户在线核验：puc.mard.gov.vn",
  "Cổng DVC Quốc gia: puc.mard.gov.vn": "国家公共服务门户：puc.mard.gov.vn",
  "(Tiếp theo Trang 01)": "（续第 01 页）",
  "ĐÁNH GIÁ NGOẠI QUAN & KIỂM DỊCH THỰC VẬT (SPS / LỆNH 248 GACC):":
    "外观品质与植物检疫评估（SPS / GACC 第 248 号令）：",
  "Độ chín & Sinh lý mẫu quả:": "果实成熟度与生理指标：",
  "Đạt chuẩn thu hoạch (Chất khô ≥ 32%)": "符合采收标准（干物质含量 ≥ 32%）",
  "Kiểm dịch sinh vật gây hại:": "检疫性有害生物核查：",
  "KPH (Không có rệp sáp, sâu đục hạt)": "未检出（无介壳虫、榴莲果核螟）",
  "Ngoại quan vỏ & Cuống quả:": "果壳与果柄外观：",
  "Nguyên vẹn, gai đều, không nấm mốc": "果型完整、果刺均匀、无霉变",
  "Truy xuất nhật ký canh tác:": "农事作业日志溯源：",
  "Đồng bộ 100% nhật ký điện tử PUC": "100% 同步 PUC 数字化农事日志",

  // ─── Tab Kiến thức: Tập huấn (LearnTab) ───
  "Tập huấn": "技术培训",
  "Thuốc BVTV": "植保农药",
  "Phân bón": "推荐肥料",
  "Giống cây": "榴莲品种",
  "VietGAP Cơ Bản": "VietGAP 基础规范培训",
  "Tiêu Chuẩn GACC – Xuất Khẩu Trung Quốc": "中国海关总署 (GACC) 出口标准培训",
  "Nhận Diện & Phòng Trừ Sâu Bệnh": "榴莲病虫害识别与综合防治",
  "Hướng Dẫn Dùng Phần Mềm Quản Lý": "PUC 数字化农事日志系统操作指南",
  "Kỹ Thuật Tưới Tiêu Tiết Kiệm": "果园节水滴灌与水分管理技术",
  "Canh Tác Hữu Cơ Sầu Riêng": "榴莲有机生态种植技术",
  "Tiêu chuẩn GACC": "GACC 出口标准",
  "Kỹ thuật phòng trừ": "病虫害防治",
  "Chuyển đổi số PUC": "PUC 数字化管理",
  "Kỹ thuật canh tác": "栽培管理技术",
  "Nông nghiệp hữu cơ": "有机生态农业",
  "Đã kết thúc": "已结束",
  "Đang mở đăng ký": "正在报名中",
  "Đã hết chỗ": "名额已满",
  "Đăng ký tham gia": "立即报名参加",
  "Đang đăng ký…": "正在报名…",
  "Không đăng ký được lớp tập huấn.": "报名培训班失败，请重试。",
  "Không hủy được đăng ký tập huấn.": "取消培训报名失败，请重试。",
  "Hủy đăng ký": "取消报名",
  "Xác nhận hủy đăng ký tham gia lớp tập huấn này?": "确认取消报名参加本次培训班吗？",
  "Đồng ý hủy": "确认取消",
  "Lớp đã đủ sĩ số": "培训班名额已满",
  "Hiện chưa có lớp tập huấn nào sắp diễn ra.": "近期暂无即将开课的培训班。",
  "Khóa tập huấn đã hoàn thành": "已完成的培训课程",
  "Tình trạng ghi danh:": "报名情况：",
  "học viên": "名学员",
  "Thời gian tổ chức": "培训时间",
  "08:00 – 11:30 (Buổi sáng)": "08:00 – 11:30（上午）",
  "Địa điểm tập trung": "培训地点",
  "Hội trường HTX": "合作社礼堂",
  "Hội trường tập trung HTX": "合作社集中培训礼堂",
  "UBND xã Krông Búk": "克容布乡人民委员会礼堂",
  "UBND xã Krong Buk": "克容布乡人民委员会礼堂",
  "Giảng viên phụ trách": "主讲专家",
  "Chuyên gia nông nghiệp": "农业技术专家",
  "Chuyên gia từ BVTV": "植保部门专家",
  "Kỹ sư hệ thống": "系统工程师",
  "Chuyên gia Hữu cơ": "有机农业专家",
  "Cán bộ chuyên môn Chi cục BVTV": "植物保护分局专业干部",
  "Quyền lợi chứng chỉ": "培训证书权益",
  "Cấp chứng nhận VietGAP": "颁发 VietGAP 培训认证",
  "Phục vụ hồ sơ mã vùng trồng": "纳入出口注册果园 (PUC) 档案",
  "Chương trình đào tạo & nội dung thực hành": "培训课程大纲与实操内容",
  "Lưu ý cho bà con xã viên:": "社员参训须知：",
  "Khóa tập huấn tiêu chuẩn canh tác VietGAP cho cây sầu riêng xuất khẩu, đảm bảo an toàn sinh học và truy xuất nguồn gốc.":
    "面向出口榴莲的 VietGAP 标准化种植培训课程，确保生物安全与全程可追溯性。",
  "Quy chuẩn đất đai, nguồn nước và vùng đệm an toàn": "土壤、灌溉水源与安全缓冲带标准",
  "Đánh giá các chỉ tiêu kim loại nặng trong đất, vi sinh vật trong nước tưới và bảo vệ môi trường sinh thái vườn sầu riêng.":
    "评估土壤重金属指标、灌溉水微生物标准，保护榴莲园生态环境。",
  "Hướng dẫn lập và số hóa nhật ký canh tác PUC": "PUC 数字化农事日志填写与管理指南",
  "Thực hành ghi nhận định kỳ 7 ngày/lần các công đoạn bón phân, tưới nước, bao trái và cắt tỉa cành trên điện thoại.":
    "实操练习在手机上每 7 天定期记录施肥、灌溉、套袋与修剪枝条等农事工序。",
  "Thực hành tuân thủ thời gian cách ly thuốc BVTV (PHI)": "严格执行植保农药安全间隔期 (PHI) 实操",
  "Kỹ thuật tính toán ngày thu hoạch an toàn sau lần phun thuốc cuối cùng, đảm bảo dư lượng đạt mức MRL cho phép.":
    "掌握最后一次施药后安全采收日期的推算方法，确保农药残留符合 MRL 标准。",
  "Bà con vui lòng mang theo điện thoại thông minh và sổ ghi chép nhật ký canh tác của gia đình. Ban tổ chức HTX hỗ trợ tài liệu học tập và nước uống miễn phí.":
    "请社员携带智能手机及家庭农事记录本参训。合作社免费提供培训资料与饮用水。",
  "Phổ biến các quy định nghiêm ngặt theo Lệnh 248, 249 của Tổng cục Hải quan Trung Quốc (GACC) đối với sầu riêng tươi xuất khẩu.":
    "深入解读中国海关总署 (GACC) 第 248、249 号令关于鲜食榴莲正贸出口的严格监管规定。",
  "Kiểm soát 6 đối tượng kiểm dịch thực vật bắt buộc": "严格防控 6 类中方关注的植物检疫性有害生物",
  "Nhận diện và biện pháp triệt tiêu rệp sáp, mọt đục cành, ruồi đục quả trước khi đóng gói xuất khẩu.":
    "在出口包装前精准识别并彻底清除粉蚧、枝小蠹、果实蝇等检疫性害虫。",
  "Dán tem điện tử truy xuất nguồn gốc niêm phong quả": "粘贴防伪二维码电子溯源封签",
  "Quy trình kích hoạt tem mã hóa PUC, kiểm tra tính toàn vẹn của mã QR khi container qua cửa khẩu thông quan.":
    "掌握 PUC 加密溯源标签激活流程，确保货柜口岸通关时二维码信息完整可查。",
  "Chuẩn hóa hồ sơ vùng trồng và cơ sở đóng gói": "注册果园 (PUC) 与包装厂 (PHC) 档案标准化",
  "Hoàn thiện biên bản thẩm định KCS, giấy kiểm nghiệm tồn dư Cadimi và chứng thư kiểm dịch thực vật hợp chuẩn.":
    "完善 KCS 品控检验记录、重金属镉 (Cd) 检测报告与植物检疫证书。",
  "Khóa học có giá trị pháp lý bắt buộc đối với tất cả các hộ đã đăng ký mã vùng trồng xuất khẩu sầu riêng chính ngạch sang thị trường Trung Quốc.":
    "本课程为所有已登记对华正贸出口注册果园代码 (PUC) 社员农户的必修合规培训。",
  "Kỹ thuật nhận biết sớm các bệnh hại nguy hiểm trên cây sầu riêng (Phytophthora, thán thư, mọt đục thân) và biện pháp sinh học phòng ngừa.":
    "榴莲重大病虫害（疫霉流胶病、炭疽病、天牛/小蠹虫）早期诊断与生物综合防治技术。",
  "Nhận diện sớm nấm Phytophthora gây xì mủ thối thân": "早期识别引起树干流胶腐烂的疫霉菌 (Phytophthora)",
  "Phát hiện vết thâm vỏ, nứt thân ứa mủ vàng và kỹ thuật cạo quét thuốc gốc đồng xử lý triệt để mầm bệnh.":
    "识别树皮暗斑、裂皮流黄胶症状，掌握刮除病斑并涂抹铜制剂彻底灭菌技术。",
  "Nguyên tắc luân phiên hoạt chất và thời gian cách ly": "有效成分轮换使用原则与安全间隔期管理",
  "Tránh sâu rầy kháng thuốc, tuyệt đối không dùng hoạt chất cấm (Chlorpyrifos, Carbaryl, Vàng O) theo danh mục BVTV.":
    "防止害虫产生抗药性，绝对禁止使用植保禁用名录成分（毒死蜱、甲萘威、碱性嫩黄等）。",
  "Thực hành tại vườn mẫu mô hình nông hộ": "示范果园现场田间实操教学",
  "Kỹ sư hướng dẫn tỉa cành tạo tán thông thoáng, khử trùng dụng cụ cắt tỉa và xử lý gốc mùa mưa.":
    "农业工程师现场指导修剪通风树冠、修剪工具消毒与雨季树盘防病处理。",
  "Tập trung tại vườn mẫu Thôn 3 lúc 7:45 sáng. Bà con nên mặc trang phục làm vườn gọn gàng, ủng và nón lá để tiện di chuyển thực địa.":
    "早上 7:45 在第 3 村示范果园集合。建议穿着轻便田间劳作服与胶靴，方便实地观摩操作。",
  "Hướng dẫn chi tiết cách cài đặt, đăng nhập và sử dụng hệ thống số hóa nhật ký canh tác PUC Krông Búk trên điện thoại.":
    "详细指导如何在手机上安装、登录并使用居内合作社 PUC 数字化农事日志管理系统。",
  "Hướng dẫn chi tiết cách cài đặt, đăng nhập và sử dụng hệ thống số hóa nhật ký canh tác PUC HTX Cư Né trên điện thoại.":
    "详细指导如何在手机上安装、登录并使用居内合作社 PUC 数字化农事日志管理系统。",
  "Cài đặt & đăng nhập tài khoản nông hộ": "农户账户安装与登录指引",
  "Kích hoạt tài khoản theo số điện thoại đã cấp mã, quản lý thông tin thửa đất và phân quyền thành viên trong hộ.":
    "使用已登记手机号激活账户，查看地块档案并管理家庭成员填报权限。",
  "Thao tác ghi nhật ký canh tác có đính kèm GPS": "附带 GPS 定位与现场照片的农事日志填报操作",
  "Cách nhập thông tin phun thuốc, bón phân, chụp ảnh hiện trường và gửi đề xuất cập nhật diện tích.":
    "学习录入施药、施肥记录，拍摄果园现场照片及提交地块信息更新申请。",
  "Tra cứu lịch kiểm tra và kết quả kiểm nghiệm Lab": "查询田间巡检计划与实验室检测报告",
  "Nhận thông báo lịch thanh tra định kỳ, kết quả phân tích chỉ tiêu an toàn và danh mục thuốc BVTV được phép.":
    "接收定期巡检通知、查看农残与重金属安全检测结果及允许使用的植保农药名录。",
  "Bà con chuẩn bị điện thoại thông minh còn pin trên 50%, có kết nối 4G/Wifi. Đội ngũ kỹ sư CNTT sẽ hỗ trợ cài đặt tận tay cho từng bà con.":
    "请携带电量充足（50%以上）并连接 4G/Wi-Fi 的智能手机，IT 工程师将一对一现场协助安装设置。",
  "Chương trình tập huấn nâng cao năng lực canh tác, chất lượng nông sản và ứng dụng khoa học kỹ thuật cho nông dân HTX Cư Né.":
    "面向居内合作社农户的栽培管理提升、果品质量控制与现代农业科技应用培训。",
  "Chương trình tập huấn nâng cao năng lực canh tác, chất lượng nông sản và ứng dụng khoa học kỹ thuật cho nông dân HTX Krông Búk.":
    "面向居内合作社农户的栽培管理提升、果品质量控制与现代农业科技应用培训。",
  "Tổng quan tiêu chuẩn kỹ thuật & quy định mới": "最新农业技术标准与出口监管规定概述",
  "Cập nhật các chính sách, quy chuẩn mới nhất của ngành nông nghiệp về canh tác và tiêu thụ sầu riêng.":
    "更新农业部门关于榴莲标准化种植与出口销售的最新政策与技术规范。",
  "Hướng dẫn thực hành các kỹ thuật trọng tâm": "核心栽培管理技术实操指南",
  "Từng bước thao tác kỹ thuật chuẩn xác theo sổ tay khuyến nông của tỉnh Đắk Lắk.":
    "依据多乐省农技推广手册，逐步讲解标准化田间管理操作。",
  "Hỏi đáp & trao đổi trực tiếp cùng chuyên gia": "专家现场答疑与互动交流",
  "Giải đáp thắc mắc về sâu bệnh, dinh dưỡng cây trồng và thủ tục liên kết chuỗi giá trị.":
    "现场解答关于病虫害防治、果树营养管理及合作社产销对接流程的疑问。",
  "Khóa tập huấn mở cửa tự do cho toàn thể thành viên HTX và bà con nông dân trong vùng trồng liên kết.":
    "本培训班面向合作社全体社员及签约种植区农户免费开放。",

  // ─── Tab Kiến thức: Thuốc BVTV (LearnTab) ───
  "Danh mục thuốc BVTV": "植物保护农药名录",
  "Tìm theo tên thuốc, hoạt chất hoặc hãng...": "按农药名称、有效成分或生产商搜索...",
  "Tìm kiếm thuốc bảo vệ thực vật": "搜索植物保护农药",
  "Xóa từ khóa tìm kiếm": "清除搜索词",
  "Lọc theo trạng thái thuốc": "按农药监管状态筛选",
  "Bấm để xem chi tiết thuốc BVTV": "点击查看植保农药详情",
  "Không tìm thấy thuốc phù hợp với tiêu chí lọc.": "未找到符合筛选条件的农药。",
  "Chi tiết thuốc BVTV": "植物保护农药详情",
  "Nhà sản xuất:": "生产企业：",
  "Hàm lượng:": "含量规格：",
  "Công dụng chính": "主要防治功效",
  "Đối tượng phòng trừ & Bệnh hại": "防治对象与靶标病虫害",
  "Thời điểm khuyến nghị:": "建议施用时期：",
  "Hướng dẫn sử dụng & Liều lượng pha phun": "使用说明与稀释喷施剂量",
  "Liều lượng khuyến cáo:": "推荐剂量：",
  "Thông số kỹ thuật & Tiêu chuẩn": "技术参数与安全标准",
  "Hoạt chất chính": "主要有效成分",
  "Thời gian cách ly (PHI)": "安全间隔期 (PHI)",
  "Không áp dụng": "不适用",
  "Ngừng phun trước khi thu hoạch": "采收前停止施药天数",
  "Mức dư lượng tối đa (MRL)": "最大残留限量 (MRL)",
  "Chuẩn VietGAP & Nghị định thư GACC": "VietGAP 标准与海关总署 (GACC) 议定书",
  "Tình trạng kiểm soát": "监管状态",
  "Thông tư 10/2024/TT-BNNPTNT": "农业部第 10/2024/TT-BNNPTNT 号通知",
  "Quy định canh tác an toàn sinh học VietGAP": "VietGAP 生物安全种植规范",
  "Cảnh báo kiểm soát dư lượng nghiêm ngặt": "严格管控农残限量预警",
  "Cảnh báo đỏ: Nghiêm cấm tuyệt đối": "红色警告：绝对严禁使用",
  "Nguyên tắc an toàn & bảo vệ môi trường": "安全施药与环境保护准则",
  "Trang bị đầy đủ khẩu trang, kính chắn giọt bắn, găng tay và ủng bảo hộ khi pha chế và phun thuốc.":
    "配药和喷药时必须穿戴防护口罩、护目镜、手套及防护靴。",
  "Không phun ngược hướng gió, không phun vào những ngày nắng gắt trên 35°C hoặc khi trời sắp có mưa.":
    "严禁逆风喷药，避免在高于 35°C 的高温烈日或降雨前施药。",
  "Vỏ chai, bao bì sau khi dùng phải súc rửa 3 lần, thu gom về đúng bể chứa rác nguy hại của thôn/xã.":
    "使用后的农药瓶袋须清洗 3 次，并统一收集至村/乡专用危废回收池。",
  "Ức chế tổng hợp chitin, ngăn cản côn trùng lột xác, làm ung trứng và triệt tiêu lứa rầy non tiếp theo.":
    "抑制几丁质合成，阻碍害虫蜕皮并使虫卵失活，有效阻断下一代若虫繁殖。",
  "Rầy phấn trắng (rầy bông sầu riêng)": "榴莲木虱（白粉虱）",
  "Rầy xanh (rầy nhảy hại đọt non)": "绿小叶蝉（危害嫩梢）",
  "Rệp sáp bông & rệp sáp trái non": "花期与幼果粉蚧",
  "Rệp dính, rệp sáp giả": "盾蚧与假粉蚧",
  "Phun khi rầy non mới nở (tuổi 1–3) hoặc giai đoạn cây nhú đọt non, mở lá bàng, mắt cua":
    "在低龄若虫（1–3龄）初孵期，或果树抽发新梢、花芽露白（蟹眼期）时喷施",
  "Pha 100 – 150 ml cho phuy 200 lít nước (10 – 15 ml / bình 25 lít)":
    "每 200 升水桶兑药 100 – 150 毫升（每 25 升喷雾器兑 10 – 15 毫升）",
  "Lượng nước phun 400 – 600 lít/ha tùy theo độ lớn tán cây sầu riêng.":
    "每公顷喷液量 400 – 600 升，视榴莲树冠大小调整。",
  "Phun ướt đều 2 mặt lá, ngọn non và chùm quả nơi rầy rệp đang trú ẩn.":
    "均匀喷湿叶片正反两面、嫩梢及幼果簇等害虫栖息部位。",
  "Thuốc ức chế lột xác nên đạt hiệu lực diệt trừ triệt để nhất sau 3 – 5 ngày.":
    "蜕皮抑制剂在施药后 3 – 5 天达到最佳彻底杀灭效果。",
  "Luân phiên hoặc phối hợp hoạt chất khi mật độ rầy trưởng thành cao để cắt đứt vòng đời sâu hại.":
    "成虫密度高时建议轮换或复配不同作用机理药剂，以阻断害虫世代周期。",
  "Trừ sâu sinh học phổ rộng chiết xuất từ xạ khuẩn, tác động vị độc & tiếp xúc, thấm sâu cực nhanh vào biểu bì lá.":
    "源自放线菌的广谱生物杀虫杀螨剂，具胃毒和触杀作用，能迅速渗透进入叶片表皮。",
  "Nhện đỏ hại lá (mặt dưới lá)": "叶螨 / 红蜘蛛（危害叶背）",
  "Bọ trĩ (bù lạch hại hoa và đọt non)": "蓟马（危害花蕾与嫩梢）",
  "Sâu đục trái non & cuống trái": "幼果与果柄蛀果螟",
  "Sâu vẽ bùa trên lá non": "嫩叶潜叶蛾",
  "Phun sớm khi nhện đỏ chớm xuất hiện mùa khô hoặc giai đoạn cây nhú đọt, chùm hoa non":
    "旱季红蜘蛛初发期，或新梢萌发、幼花簇期及早喷施",
  "Pha 15 – 25 ml cho bình 25 lít nước (150 – 200 ml cho phuy 200 lít)":
    "每 25 升水兑药 15 – 25 毫升（每 200 升水桶兑 150 – 200 毫升）",
  "Chỉnh béc phun sương thật mịn, phun kỹ và ướt đều mặt dưới lá và các đọt non.":
    "调细雾化喷头，重点均匀喷透叶片背面及嫩梢。",
  "Phun vào lúc sáng sớm (khi ráo sương) hoặc chiều mát; tránh phun lúc nắng gắt vì hoạt chất dễ bị quang hóa phân hủy.":
    "在清晨露水干后或傍晚凉爽时喷施，避免烈日高温下光解失效。",
  "Không phun quá 2 lần liên tiếp cùng một hoạt chất trong một vụ canh tác để tránh nhện đỏ kháng thuốc.":
    "同一生长季内请勿连续使用同一有效成分超过 2 次，以防红蜘蛛产生抗药性。",
  "Ngừng phun trước khi thu hoạch tối thiểu 7 ngày để đảm bảo dư lượng an toàn VietGAP.":
    "采收前至少提前 7 天停止施药，确保符合 VietGAP 农残安全标准。",
  "Thuốc lưu dẫn nội hấp cực mạnh (hai chiều), hấp thu nhanh qua rễ và tán lá, bảo vệ toàn diện các cơi đọt non mới bung.":
    "强效双向内吸传导药剂，经根系与叶片快速吸收，全面保护新抽嫩梢。",
  "Rầy nhảy (rầy xanh hại sầu riêng)": "榴莲木虱与小绿叶蝉",
  "Bọ trĩ gây cháy bìa lá non": "引起嫩叶焦边的蓟马",
  "Rệp sáp đọt non & rệp vảy": "嫩梢粉蚧与盾蚧",
  "Bọ xít muỗi chích hút cuống hoa": "刺吸花柄的盲蝽",
  "Phun phòng ngừa khi cây bắt đầu nhú mắt cua hoặc vừa bung đọt non mới":
    "在花芽露白（蟹眼期）或新梢刚萌发时进行预防性喷施",
  "Pha 20 – 30 g cho bình 25 lít nước (hoặc 100 g cho phuy 200 lít nước)":
    "每 25 升水兑药 20 – 30 克（或每 200 升水桶兑 100 克）",
  "Phun ướt đều tán lá, thân cành và những nơi côn trùng chích hút ẩn nấp.":
    "均匀喷施树冠叶片、枝干及刺吸式害虫隐蔽处。",
  "Thuốc có tính nội hấp di chuyển khắp thân cây, bảo vệ được cả những đọt non mọc sau khi phun.":
    "药剂具优良内吸传导性，可保护施药后新长出的嫩梢。",
  "Không phun trực tiếp khi sầu riêng đang bung hoa nở rộ (xả nhụy) để bảo vệ ong mật thụ phấn.":
    "榴莲盛花授粉期请勿直接喷药，以保护授粉蜜蜂。",
  "Thời gian cách ly an toàn tối thiểu 14 ngày trước khi thu hoạch theo tiêu chuẩn xuất khẩu GACC.":
    "按 GACC 出口标准，采收前安全间隔期至少为 14 天。",
  "Thuốc trừ sâu sinh học thế hệ mới diệt sâu miệng nhai kháng thuốc, tác động tiếp xúc và vị độc cực mạnh, an toàn xuất khẩu.":
    "新一代生物源杀虫剂，高效防治抗性咀嚼式口器害虫，具强触杀和胃毒作用，符合出口安全要求。",
  "Sâu đục quả (sâu đục trái sầu riêng)": "榴莲蛀果螟（果核螟）",
  "Sâu đục cuống hoa & cuống trái": "花柄与果柄钻蛀害虫",
  "Sâu ăn bông & sâu cắn phá gai": "食花虫与啃食果刺害虫",
  "Sâu lông, sâu róm hại tán lá": "危害树冠叶片的毛虫类",
  "Phun khi sâu non mới xuất hiện (tuổi 1–2) hoặc thời điểm định kỳ trái bằng quả trứng gà":
    "在低龄幼虫（1–2龄）初见期，或幼果鸡蛋大小时定期喷施防治",
  "Pha 15 – 20 ml cho bình 25 lít nước (150 – 200 ml cho phuy 200 lít nước)":
    "每 25 升水兑药 15 – 20 毫升（每 200 升水桶兑 150 – 200 毫升）",
  "Phun ướt đẫm và kỹ vào bề mặt chùm trái non, kẽ trái, cuống trái nơi sâu hay đẻ trứng và đục vào.":
    "重点喷透幼果簇表面、果缝及果柄等害虫产卵和钻蛀部位。",
  "Phun sớm khi sâu non chưa đục sâu vào bên trong cơm sầu riêng để đạt hiệu quả 100%.":
    "在幼虫尚未钻入果肉内部前及早喷施，以达到最佳防治效果。",
  "Kết hợp tỉa bớt trái méo, tạo chùm trái thông thoáng và bao trái đúng thời điểm để hạn chế sâu tấn công.":
    "结合疏除畸形果、保持果簇通风并适时套袋，减少害虫侵袭。",
  "Thời gian cách ly ngắn (5 – 7 ngày), phù hợp cho các đợt xử lý bảo vệ trái trước thu hoạch.":
    "安全间隔期短（5 – 7 天），适合采收前护果阶段使用。",
  "Thuốc trừ sâu gốc lân hữu cơ tác động tiếp xúc, vị độc và xông hơi cực mạnh. NẰM TRONG DANH MỤC KIỂM SOÁT ĐẶC BIỆT CỦA BỘ NN-PTNT.":
    "有机磷类杀虫剂，具触杀、胃毒和熏蒸作用。属于农业部特别严控名录药剂。",
  "Rệp sáp rễ & rệp đất": "根粉蚧与地下害虫",
  "Tuyến trùng hại rễ tơ sầu riêng": "危害榴莲须根的根结线虫",
  "Mối hại gốc và cổ rễ": "危害树干基部与根颈的白蚁",
  "Mọt đục cành già mùa khô": "旱季钻蛀老枝的小蠹虫",
  "Chỉ dùng tưới vùng gốc rễ khi dịch hại bùng phát nghiêm trọng ngoài tầm kiểm soát sinh học":
    "仅限在地下害虫严重爆发且生物防治无法控制时用于灌根处理",
  "Pha 200 – 250 ml cho phuy 200 lít nước (tưới 5 – 10 lít dung dịch/gốc)":
    "每 200 升水兑药 200 – 250 毫升（每株灌根 5 – 10 升药液）",
  "TUYỆT ĐỐI CẤM PHUN LÊN TRÁI VÀ TÁN LÁ SẦU RIÊNG XUẤT KHẨU vì nguy cơ tồn dư vượt ngưỡng MRL của Hải quan GACC.":
    "绝对禁止喷施于出口榴莲果实与树冠叶片，以免农残超出中国海关 (GACC) MRL 限量。",
  "Chỉ được phép tưới xử lý vùng rễ khi có văn bản hướng dẫn và giám sát của cán bộ kỹ thuật HTX.":
    "必须在合作社技术员书面指导与现场监督下，方可用于根部土壤处理。",
  "Ngừng sử dụng tối thiểu 21 ngày trước thu hoạch; bắt buộc kiểm nghiệm mẫu đất và quả trước khi cấp phép xuất khẩu.":
    "采收前至少提前 21 天停止使用；出口前必须对土壤和果实样品进行实验室农残检测。",
  "HOẠT CHẤT ĐỘC HẠI BỊ CẤM HOÀN TOÀN THEO NGHỊ ĐỊNH THƯ GACC VÀ THÔNG TƯ 10/2024/TT-BNNPTNT.":
    "根据中国海关总署 (GACC) 议定书及越南农业部第 10/2024/TT-BNNPTNT 号通知，该高风险成分已被完全禁止使用。",
  "Hoạt chất độc thần kinh Carbamate bị cấm tuyệt đối": "绝对禁用的氨基甲酸酯类神经毒性成分",
  "Cấm dùng trên sầu riêng và mọi loại cây ăn trái xuất khẩu": "严禁在榴莲及所有出口果树上使用",
  "GACC đình chỉ ngay mã vùng trồng nếu phát hiện tồn dư": "一旦检出残留，GACC 将立即暂停注册果园代码资格",
  "Nghiêm cấm tuyệt đối ở mọi giai đoạn sinh trưởng của cây": "在果树所有生长阶段均绝对禁用",
  "0 g (TUYỆT ĐỐI KHÔNG SỬ DỤNG)": "0 克（绝对禁止使用）",
  "Cấm mua bán, tàng trữ và sử dụng trong toàn bộ vùng trồng được cấp mã số PUC.":
    "在获得 PUC 代码的整个种植区内严禁购买、存放和使用。",
  "Mọi lô hàng sầu riêng phát hiện tồn dư Carbaryl sẽ bị Hải quan cửa khẩu từ chối thông quan và tịch thu tiêu hủy.":
    "任何检出甲萘威 (Carbaryl) 残留的榴莲批次将被口岸海关拒绝通关并依法销毁。",
  "Bà con nông hộ sử dụng hoạt chất cấm sẽ bị đình chỉ tư cách xã viên HTX và thu hồi mã vùng trồng liên kết.":
    "违规使用禁用成分的农户将被暂停合作社社员资格并收回注册果园联结代码。",
  "Đặc trị sâu hại và côn trùng chích hút theo danh mục BVTV được phép sử dụng.":
    "按允许使用的植保名录防治害虫及刺吸式口器昆虫。",
  "Sâu đục thân": "钻心虫 / 天牛",
  "Rầy chích hút": "刺吸式叶蝉/木虱",
  "Bọ trĩ": "蓟马",
  "Nhện đỏ": "红蜘蛛 / 叶螨",
  "Phun theo đúng hướng dẫn trên nhãn thuốc và đảm bảo thời gian cách ly PHI":
    "严格按照农药标签说明喷施，并遵守采前安全间隔期 (PHI)",
  "Pha theo tỷ lệ khuyến cáo in trên nhãn bao bì sản phẩm": "按产品包装标签推荐比例稀释",
  "Trang bị đầy đủ đồ bảo hộ khi pha chế và phun thuốc.": "配药与施药时请穿戴齐全防护装备。",
  "Phun ướt đều tán lá vào sáng sớm hoặc chiều mát.": "在清晨或傍晚凉爽时均匀喷施树冠叶片。",
  "Tuân thủ nghiêm ngặt thời gian cách ly trước thu hoạch (PHI).": "严格遵守采收前安全间隔期 (PHI)。",
  "Map Pacific / Cục BVTV": "Map Pacific / 植物保护局登记",
  "Đạt chuẩn đăng ký": "符合登记标准",
  "Thuốc nằm trong danh mục được phép sử dụng phòng trừ sâu rầy trên sầu riêng. Bà con cần tuân thủ đúng liều lượng khuyến cáo, ghi chép nhật ký phun và đảm bảo đủ thời gian cách ly trước ngày thu hoạch.":
    "该药剂属于允许在榴莲上使用的植保名录。请严格遵守推荐剂量、记录施药日志并确保采收前安全间隔期达标。",
  "Hoạt chất có nguy cơ tồn dư kéo dài. Chỉ sử dụng khi dịch hại bùng phát mạnh và có sự đồng ý của cán bộ kỹ thuật HTX hoặc Chi cục Trồng trọt & BVTV.":
    "该成分残留期较长，仅限在虫害严重爆发且经合作社技术员或植保部门同意后使用。",
  "Hoạt chất Carbaryl đã bị Hải quan Trung Quốc (GACC) và Bộ Nông nghiệp & PTNT cấm hoàn toàn. Bất kỳ lô hàng nào phát hiện tồn dư sẽ bị tiêu hủy và đình chỉ mã vùng trồng.":
    "甲萘威 (Carbaryl) 已被中国海关总署 (GACC) 和越南农业部完全禁用。任何检出残留的批次将被销毁并暂停种植区代码。",

  // ─── Tab Kiến thức: Phân bón (LearnTab) ───
  "Danh mục phân bón": "推荐肥料名录",
  "NPK đa lượng": "大量元素 NPK",
  "Trung vi lượng": "中微量元素",
  "Cải tạo đất & Rễ": "土壤改良与促根",
  "Kiểm soát Clo": "含氯严控类",
  "Tìm theo tên phân bón, thành phần dinh dưỡng hoặc hãng...": "按肥料名称、养分成分或品牌搜索...",
  "Tìm kiếm phân bón": "搜索肥料",
  "Lọc theo phân loại phân bón": "按肥料类别筛选",
  "Bấm để xem chi tiết phân bón": "点击查看肥料详情",
  "Không tìm thấy phân bón phù hợp với tiêu chí lọc.": "未找到符合筛选条件的肥料。",
  "Chi tiết phân bón": "肥料产品详情",
  "Hữu cơ vi sinh": "有机微生物肥",
  "Khoáng NPK cao cấp": "优质 NPK 复合肥",
  "Trung vi lượng qua lá": "叶面中微量元素肥",
  "Vi sinh & Rễ": "微生物菌剂与促根肥",
  "Khuyến khích VietGAP": "VietGAP 推荐使用",
  "VietGAP khuyến khích": "VietGAP 推荐使用",
  "Cảnh báo: Không sử dụng": "警告：严禁使用",
  "Giai đoạn cây trồng & Hiệu quả trọng tâm": "适用物候期与核心肥效",
  "Thời điểm bón khuyến nghị:": "建议施肥时期：",
  "Thành phần / Công thức": "养分成分 / 配方",
  "Hàm lượng dinh dưỡng đăng ký": "登记养分含量",
  "Phương thức bón": "施用方式",
  "Bón theo hình chiếu mép tán": "沿树冠滴水线环施",
  "Định mức sử dụng": "推荐施用定额",
  "Chuẩn VietGAP Krông Búk": "居内合作社 VietGAP 标准",
  "Chuẩn VietGAP HTX Cư Né": "居内合作社 VietGAP 标准",
  "Tiêu chuẩn áp dụng": "执行标准",
  "VietGAP & Hữu cơ GACC": "VietGAP 与 GACC 有机标准",
  "Nghiêm cấm theo GACC": "按 GACC 标准严禁使用",
  "Bộ Nông nghiệp & PTNT": "越南农业与农村发展部",
  "Nguyên tắc canh tác an toàn sinh học": "生物安全施肥准则",
  "Phân chuồng bón cho sầu riêng bắt buộc phải được ủ hoai mục bằng nấm Trichoderma tối thiểu 45 ngày.":
    "施用于榴莲的农家肥必须使用木霉菌 (Trichoderma) 充分腐熟发酵至少 45 天。",
  "Không bón phân hóa học sát gốc cây; rải phân theo mép tán nơi có nhiều đầu rễ tơ hút dinh dưỡng nhất.":
    "切勿贴近树干基部施用化肥；应沿树冠滴水线（须根吸收最活跃区域）均匀撒施。",
  "Sau khi bón phân hạt cần tưới nước nhẹ để phân tan dần, tránh bón vào lúc trời nắng gắt làm bốc hơi đạm.":
    "施用颗粒肥后应适量浇水促溶，避免在烈日高温时施肥导致氮素挥发流失。",
  "Hữu cơ Vi sinh Đất Mẹ 70% OM": "大地之母 70% OM 有机微生物肥",
  "Chất hữu cơ: 70% · Axit Humic: 12% · Nấm Trichoderma: 1×10⁶ CFU/g":
    "有机质: 70% · 腐殖酸: 12% · 木霉菌 (Trichoderma): 1×10⁶ CFU/g",
  "Công ty CP Nông Nghiệp Xanh Đất Mẹ": "大地之母绿色农业股份公司",
  "5 – 10 kg/gốc/lần (Tùy tuổi cây)": "5 – 10 公斤/株/次（视树龄而定）",
  "Bón gốc theo mép tán lá": "沿树冠滴水线环状沟施",
  "Sau thu hoạch & đầu mùa mưa": "采果后修剪期与雨季初期",
  "Phân bón hữu cơ vi sinh cao cấp chuyên dùng cho sầu riêng, cung cấp dinh dưỡng thiết yếu và tăng cường hệ vi sinh đất.":
    "榴莲专用高含量有机微生物肥，补充全面有机养分并激活土壤有益微生物菌群。",
  "Cải tạo đất tơi xốp, kích hoạt vi sinh vật bản địa có lợi và tái tạo mạng lưới rễ tơ sau vụ thu hoạch.":
    "疏松改良土壤，激活本土有益微生物，并在采收后快速恢复须根吸收网络。",
  "Phục hồi sau thu hoạch": "采后树势恢复",
  "Tái tạo rễ tơ": "促进新须根萌发",
  "Đất tơi xốp phì nhiêu": "疏松培肥土壤",
  "Kháng nấm hại rễ": "拮抗根部病原真菌",
  "Bón vào đầu mùa mưa hoặc ngay sau khi dọn vườn sau thu hoạch": "在雨季初期或采果清园后立即施用",
  "5 – 10 kg/gốc rải đều theo mép tán lá, xới nhẹ lấp đất và tưới đủ ẩm.":
    "每株 5 – 10 公斤沿树冠滴水线撒施，浅翻覆土并浇透水。",
  "NPK 12-12-17+TE Gốc Sunfat (Bio-Agri)": "硫酸钾型 NPK 12-12-17+TE 复合肥 (Bio-Agri)",
  "Đạm (N): 12% · Lân (P₂O₅): 12% · Kali Sunfat (K₂SO₄): 17% · TE (Bo, Mg, Zn)":
    "氮 (N): 12% · 磷 (P₂O₅): 12% · 硫酸钾 (K₂SO₄): 17% · 微量元素 (硼、镁、锌)",
  "0.8 – 1.5 kg/cây/đợt nuôi trái": "0.8 – 1.5 公斤/株/壮果期",
  "Rải đều quanh tán & tưới đẫm nước": "沿树冠外围均匀撒施并浇透水",
  "Giai đoạn nuôi trái non & thúc trái lớn": "幼果发育期与果实膨大期",
  "Dinh dưỡng khoáng cân đối 100% gốc Kali Sunfat không chứa Clo, giúp cơm vàng óng, dày cơm và đạt chuẩn xuất khẩu GACC.":
    "100% 纯硫酸钾型无氯均衡矿质营养，促果肉金黄饱满、干物质高，符合 GACC 出口品质标准。",
  "Cung cấp dinh dưỡng đa lượng cân đối 100% gốc Sunfat (SOP không Clo), nuôi múi vàng óng, ráo cơm và nâng độ ngọt Brix.":
    "提供 100% 硫酸钾型（无氯 SOP）均衡大量元素，令果肉金黄干爽并显著提升 Brix 甜度。",
  "Nuôi trái non 40-80 ngày": "40–80天幼果膨大",
  "Cơm vàng óng dày múi": "果肉金黄肥厚",
  "Tăng độ ngọt Brix": "提升 Brix 糖度",
  "Không sượng cơm (Gốc SOP)": "防生肉/水包子（纯硫酸钾）",
  "Chuẩn GACC xuất khẩu": "符合 GACC 出口标准",
  "Giai đoạn trái lớn nhanh đến trước thu hoạch 20 ngày": "果实快速膨大期至采前 20 天",
  "0.8 – 1.5 kg/cây chia làm 2-3 lần bón rải đều quanh tán, tưới ẩm ngay sau bón.":
    "每株 0.8 – 1.5 公斤，分 2–3 次沿树冠滴水线撒施，施后立即浇水保湿。",
  "Phân bón lá Canxi Bo Sữa Bo Amino Kẽm": "钙硼氨基酸锌乳态叶面肥",
  "Canxi (CaO): 12% · Bo hữu hiệu: 35.000 ppm · Kẽm (Zn): 15.000 ppm · Amino Acid: 10%":
    "钙 (CaO): 12% · 有效硼: 35,000 ppm · 锌 (Zn): 15,000 ppm · 氨基酸: 10%",
  "Pha 750ml cho 400 – 600 lít nước": "750 毫升兑水 400 – 600 升",
  "Phun ướt đều 2 mặt lá & chùm hoa/trái": "均匀喷施叶片正反面及花穗/幼果簇",
  "Nhú mắt cua, trước xả nhụy & trái non 3-7 tuần": "花芽露白期、谢花前及谢花后 3–7 周幼果期",
  "Đặc trị rụng hoa, tăng tỷ lệ đậu trái, chống nứt gai, dai cuống và hỗ trợ trái lớn nhanh đồng đều.":
    "有效防止生理落花落果，提高座果率，强健果柄、防裂刺裂果，促进幼果均匀膨大。",
  "Chống rụng hoa và trái non, tăng sức sống hạt phấn, dẻo dai cuống trái và ngăn ngừa nứt gai, thối đít trái.":
    "防止落花落果，增强花粉活力，强健果柄韧性，预防裂刺与果顶腐烂。",
  "Chống rụng hoa sinh lý": "防生理落花落果",
  "Tăng đậu trái chùm": "提高成串座果率",
  "Dai cuống dẻo trái": "强健果柄防落果",
  "Chống nứt gai, teo trái": "防裂刺与畸形果",
  "Dưỡng lá xanh dày": "叶片浓绿肥厚",
  "Giai đoạn nhú mắt cua, trước và sau khi xả nhụy, trái non 3-7 tuần tuổi":
    "花芽露白期、谢花前后及谢花后 3–7 周幼果期",
  "Pha 750ml với 400 – 600 lít nước, phun sương ướt đều tán lá và chùm bông/trái.":
    "750 毫升兑水 400 – 600 升，细雾均匀喷湿树冠叶片与花穗/幼果。",
  "Gói Axit Humic Đậm Đặc & Trichoderma (Duri-Root)": "高浓缩腐殖酸与木霉菌护根剂 (Duri-Root)",
  "Axit Humic: 85% · Axit Fulvic: 10% · Kali hữu hiệu: 10% · Trichoderma: 2×10⁹ CFU/g":
    "腐殖酸: 85% · 黄腐酸: 10% · 有效钾: 10% · 木霉菌: 2×10⁹ CFU/g",
  "1 kg pha 500 – 800 lít nước tưới gốc": "1 公斤兑水 500 – 800 升灌根",
  "Tưới vùng rễ tơ hoặc hòa qua hệ thống nhỏ giọt": "浇灌须根区或通过滴灌系统施用",
  "Kích rễ đầu vụ & phục hồi sau đợt bệnh": "季初促根萌发与病后树势恢复",
  "Kích rễ phát triển cực mạnh, cải thiện độ phì nhiêu của đất và đối kháng nấm bệnh Phytophthora gây xì mủ.":
    "强力刺激新根发育，改善土壤肥力，有效拮抗引起流胶腐烂的疫霉菌 (Phytophthora)。",
  "Kích thích ra rễ cực mạnh, giải độc phèn đất, ức chế nấm Phytophthora và Fusarium gây thối rễ xì mủ.":
    "强力促发新须根，降解土壤酸害盐害，抑制引起根腐流胶的疫霉菌与镰刀菌。",
  "Kích rễ tơ bung đọt": "促发须根与抽梢",
  "Giải độc phèn & hữu cơ": "改良土壤酸害",
  "Đối kháng nấm xì mủ": "拮抗流胶疫霉菌",
  "Hạ phèn cân bằng pH đất": "调节平衡土壤 pH",
  "Đầu mùa mưa, khi cây nhú đọt non hoặc khi phục hồi cây suy kiệt":
    "雨季初期、新梢萌发期或弱树复壮期",
  "Hòa 1 kg vào 500 – 800 lít nước, tưới 10 – 15 lít dung dịch quanh gốc vùng rễ tơ.":
    "1 公斤兑水 500 – 800 升，每株围绕须根区浇灌 10 – 15 升水溶肥液。",
  "NPK 20-20-15+TE Đầu Trâu Chuyên Đọt": "牛头牌 NPK 20-20-15+TE 促梢专用肥",
  "Đạm (N): 20% · Lân (P₂O₅): 20% · Kali (K₂O): 15% · Vi lượng Bo, Kẽm, Đồng":
    "氮 (N): 20% · 磷 (P₂O₅): 20% · 钾 (K₂O): 15% · 微量元素硼、锌、铜",
  "Công ty CP Phân bón Bình Điền": "平田肥料股份公司 (Bình Điền)",
  "0.5 – 1.0 kg/cây/đợt cơi đọt": "0.5 – 1.0 公斤/株/每次抽梢期",
  "Bón gốc khi đất ẩm sau cơn mưa": "雨后土壤湿润时环施于根部",
  "Giai đoạn bung cơi đọt & cơi lá mới": "新梢萌发与展叶壮梢期",
  "Cung cấp đạm và lân cao giúp cơi đọt bung mập khỏe, phiến lá dày bóng, tăng diện tích quang hợp nuôi cây sung mãn.":
    "高氮高磷配方促新梢粗壮齐发、叶片厚绿油亮，增强光合作用以培植健壮树势。",
  "Thúc cây bung cơi đọt mập khỏe đồng loạt, lá xanh bóng dồi dào diệp lục, tích lũy dinh dưỡng nuôi thân cành sung mãn.":
    "促进新梢整齐粗壮萌发，叶片厚绿富含叶绿素，积累养分培育健壮结果母枝。",
  "Nuôi cơi đọt sung mãn": "培育健壮新梢",
  "Phiến lá to xanh dày": "叶片宽大浓绿",
  "Phát triển cành cấp 1-2": "促进一二级结果枝发育",
  "Chuẩn bị lực làm bông": "储备促花成花营养",
  "Đầu mỗi đợt cơi đọt mới hoặc sau khi tỉa cành tạo tán": "每次新梢萌发初期或修剪整形后",
  "Bón 0.5 – 1.0 kg/cây khi đất có độ ẩm tốt, bón theo mép tán lá.":
    "在土壤湿润时沿树冠滴水线每株施用 0.5 – 1.0 公斤。",
  "Kali Clorua (KCl / Muối Ớt Đỏ) — Cảnh báo cấm": "氯化钾 (KCl / 红钾肥) — 严禁使用警告",
  "Kali (K₂O): 60% · Hàm lượng Clo (Cl⁻): > 45%": "氧化钾 (K₂O): 60% · 氯离子 (Cl⁻) 含量: > 45%",
  "Nhập khẩu Belarus / Canada": "白俄罗斯 / 加拿大进口",
  "0 kg/cây (Tuyệt đối không dùng cho sầu riêng)": "0 公斤/株（榴莲绝对禁止使用）",
  "CẤM SỬ DỤNG CHO CÂY SẦU RIÊNG": "严禁用于榴莲树",
  "Nghiêm cấm tuyệt đối ở mọi thời điểm": "所有生长阶段均绝对禁用",
  "Hàm lượng Clo cực cao gây sượng múi, nhão cơm, cháy chóp lá và tích tụ muối hại đất; bị cấm trong tiêu chuẩn VietGAP sầu riêng.":
    "高氯含量会导致榴莲果肉积水生硬（水包子）、果肉软烂、叶尖焦枯及土壤盐渍化；VietGAP 榴莲标准严禁使用。",
  "CẢNH BÁO NGUY HIỂM: Ion Clo (Cl⁻) làm tích nước tế bào múi gây sượng cơm hoàn toàn, cháy rìa lá và chai cứng đất.":
    "高危警告：氯离子 (Cl⁻) 会导致果肉细胞积水引发严重生肉、叶缘焦枯及土壤板结。",
  "Cảnh báo sượng múi cực nặng": "警告：引发严重果肉生硬",
  "Cháy chóp lá, rụng lá": "引发叶尖焦枯与落叶",
  "GACC từ chối thông quan": "GACC 品质不达标拒收",
  "Nghiêm cấm trên sầu riêng": "榴莲种植严禁使用",
  "CẤM SỬ DỤNG trong toàn bộ chu kỳ sinh trưởng của sầu riêng": "在榴莲整个生长周期内严禁使用",
  "TUYỆT ĐỐI KHÔNG DÙNG. Thay thế bằng Kali Sunfat (K₂SO₄) hoặc phân bón lá hữu cơ.":
    "绝对禁用！请改用硫酸钾 (K₂SO₄) 或有机钾叶面肥。",
  "Cảnh báo đỏ: Nghiêm cấm bón phân chứa Clo trên sầu riêng": "红色警告：榴莲严禁施用含氯肥料",
  "Khuyến khích canh tác hữu cơ bền vững VietGAP": "VietGAP 可持续有机生态种植推荐",
  "Quy chuẩn bón phân cân đối & Quản lý dinh dưỡng": "均衡施肥与果树营养管理规范",
  "Phân Kali đỏ (KCl) chứa hàm lượng ion Clorua trên 45% làm tế bào cơm sầu riêng ngậm nước, gây hiện tượng sượng cơm, nhão thịt và làm chua đất. Toàn bộ sầu riêng phục vụ xuất khẩu bắt buộc phải dùng Kali Sunfat (K2SO4).":
    "红钾肥（氯化钾 KCl）含氯量超过 45%，会导致榴莲果肉细胞滞水引发“水包子”生肉、果肉软烂及土壤酸化。所有出口榴莲必须使用硫酸钾 (K₂SO₄)。",
  "Khuyến khích tăng cường bón phân hữu cơ vi sinh và Axit Humic hàng năm giúp đất tơi xốp, kích thích giun đất và vi sinh vật đối kháng tự nhiên bảo vệ bộ rễ sầu riêng bền lực qua nhiều mùa vụ.":
    "建议每年增施有机微生物肥与腐殖酸，疏松土壤并促进蚯蚓及天然拮抗微生物繁殖，长效保护榴莲根系健康。",
  "Bón phân đúng thời điểm sinh trưởng của cây, kết hợp tưới đủ ẩm. Bắt buộc ghi chép ngày bón, tên phân và khối lượng vào Cổng nhật ký điện tử PUC Krông Búk.":
    "按果树物候期精准施肥并配合适量灌溉。必须在居内合作社 PUC 数字化农事门户完整记录施肥日期、肥料名称与用量。",
  "Bón phân đúng thời điểm sinh trưởng của cây, kết hợp tưới đủ ẩm. Bắt buộc ghi chép ngày bón, tên phân và khối lượng vào Cổng nhật ký điện tử PUC HTX Cư Né.":
    "按果树物候期精准施肥并配合适量灌溉。必须在居内合作社 PUC 数字化农事门户完整记录施肥日期、肥料名称与用量。",

  // ─── Tab Kiến thức: Giống sầu riêng (LearnTab) ───
  "Danh mục giống sầu riêng": "榴莲栽培品种名录",
  "Xuất khẩu chủ lực": "主力出口品种",
  "Bản địa chất lượng": "优质本土品种",
  "Nhập khẩu cao cấp": "高端引进品种",
  "Giống xuất khẩu chủ lực": "主力出口品种",
  "Giống bản địa chất lượng cao": "优质本土品种",
  "Giống nhập khẩu cao cấp": "高端引进品种",
  "Giống mới tiềm năng": "潜力新品种",
  "Tìm theo tên giống, xuất xứ hoặc đặc tính cơm...": "按品种名称、原产地或果肉特性搜索...",
  "Tìm kiếm giống sầu riêng": "搜索榴莲品种",
  "Lọc theo phân loại giống sầu riêng": "按榴莲品种类别筛选",
  "Bấm để xem chi tiết giống sầu riêng": "点击查看榴莲品种详情",
  "Không tìm thấy giống sầu riêng phù hợp với tiêu chí lọc.": "未找到符合筛选条件的榴莲品种。",
  "Chi tiết giống sầu riêng": "榴莲品种详情",
  "Xuất xứ:": "原产地：",
  "· Mã giống:": "· 品种代码：",
  "Thái Lan": "泰国",
  "Thái Lan (Thuần hóa tại Tây Nguyên & Nam Bộ)": "泰国（已在越南西原及南部驯化栽培）",
  "Malaysia": "马来西亚",
  "Malaysia (Vùng Penang)": "马来西亚（槟城）",
  "Việt Nam": "越南",
  "Việt Nam (Lai tạo bởi ông Sáu Ri - Vĩnh Long)": "越南（永隆省 Sáu Ri 选育）",
  "Bình Phước – Việt Nam": "越南平福省",
  "Tiền Giang – Việt Nam": "越南前江省",
  "Sầu riêng Monthong (Dona)": "金枕榴莲 Monthong (Dona)",
  "Sầu riêng Ri 6": "干尧榴莲 (Ri 6)",
  "Sầu riêng Musang King (D197)": "猫山王榴莲 Musang King (D197)",
  "Sầu riêng Black Thorn (D200 - Gai Đen)": "黑刺榴莲 Black Thorn (D200)",
  "Black Thorn (D200 - Gai Đen)": "黑刺榴莲 Black Thorn (D200)",
  "Dona (Ri 7)": "金枕 Dona (Ri 7)",
  "Đặc tính chất lượng nổi bật": "核心品质特性",
  "Đặc điểm hình thái & Nhận diện quả": "果实形态与识别特征",
  "Màu sắc cơm & Múi:": "果肉颜色与果瓣：",
  "Tỷ lệ hạt lép & Độ ngọt Brix:": "扁核率与甜度 (Brix)：",
  "Thông số nông học & Năng suất": "农艺指标与产量表现",
  "Trọng lượng trái": "单果重量",
  "Chuẩn loại 1 xuất khẩu": "出口一等果标准",
  "Thời gian sinh trưởng": "果实发育期",
  "Từ ngày xả nhụy đến cắt già": "从谢花至成熟采收",
  "Năng suất bình quân": "平均公顷产量",
  "Giai đoạn kinh doanh ổn định": "盛果期稳定产量",
  "Tiềm năng thị trường": "市场潜力",
  "Xuất khẩu số 1 TQ": "对华出口第一品种",
  "Giá bán vượt trội": "高端溢价品种",
  "Tiêu thụ nội địa mạnh": "内销与出口畅销",
  "Được thị trường ưa chuộng": "高端市场热门品种",
  "Chuẩn xuất khẩu GACC & VietGAP": "符合 GACC 与 VietGAP 出口标准",
  "Khuyến khích mở rộng vùng trồng": "推荐扩大注册种植区品种",
  "Kỹ thuật canh tác & Chăm sóc giống sầu riêng": "品种栽培管理技术要点",
  "Mật độ & Khoảng cách trồng:": "种植密度与株行距：",
  "Kỹ thuật thụ phấn bổ sung:": "人工辅助授粉技术：",
  "Quy trình tỉa hoa & Nuôi trái:": "疏花疏果与壮果规程：",
  "Lưu ý sinh lý & Phòng sượng cơm:": "生理特性与防生肉/水包子要点：",
  "Khuyến cáo đăng ký Mã số vùng trồng (PUC) xuất khẩu": "出口注册果园代码 (PUC) 认证规范建议",
  "Vàng ngà (kem sáng)": "浅金黄色（奶油色）",
  "Vàng ươm đậm (mỡ gà óng ả)": "深金黄色（油亮饱满）",
  "Vàng nghệ đậm (đặc trưng)": "深姜黄色（猫山王特征色）",
  "Cam đỏ đậm (hồng điều bắt mắt)": "橙红色（黑刺特征色）",
  "Vàng sáng": "亮金黄色",
  "Vàng đậm, cơm dày hạt lép": "金黄浓郁、肉厚核扁",
  "Hạt lép > 85%": "扁核率 > 85%",
  "Hạt lép > 80%": "扁核率 > 80%",
  "Hạt lép 75 – 80%": "扁核率 75 – 80%",
  "Hạt lép dẹp 90 – 95%": "扁核率 90 – 95%",
  "Hạt lép 80 – 85%": "扁核率 80 – 85%",
  "32 – 35% (Ngọt thanh béo ngậy)": "32 – 35%（清甜醇厚）",
  "34 – 38% (Ngọt đậm đà, béo ngậy)": "34 – 38%（浓甜香醇）",
  "38 – 42% (Ngọt béo sâu, hậu đắng nhẹ)": "38 – 42%（浓郁甘甜、微苦回甘）",
  "36 – 40% (Béo ngậy sánh mịn như mousse)": "36 – 40%（绵密顺滑如慕斯）",
  "Giống sầu riêng xuất khẩu số 1 sang thị trường Trung Quốc theo Nghị định thư GACC. Trái thon dài, vỏ mỏng vàng đồng, cơm dày vàng ngà, hạt lép trên 85%.":
    "根据 GACC 议定书对华正贸出口第一大主力品种。果型修长、果壳薄呈古铜黄色、果肉肥厚浅金黄、扁核率超 85%。",
  "Thị trường xuất khẩu chính ngạch ưa chuộng nhất, chiếm 75% kim ngạch sầu riêng Việt Nam":
    "正贸出口最受欢迎品种，占越南榴莲出口总额的 75%",
  "Quả hình bầu dục hoặc quả lê thon dài, cuống to và cứng cáp": "果实呈椭圆形或修长梨形，果柄粗壮结实",
  "Gai nhọn, dày, mật độ gai phân bố đồng đều từ cuống đến đáy": "果刺尖锐密集，从果柄至果底分布均匀",
  "Vỏ quả mỏng 1.0 – 1.2 cm, chuyển từ xanh sang vàng đồng khi chín": "果壳薄（1.0 – 1.2 厘米），成熟时由青转古铜黄",
  "Tỷ lệ cơm đạt 32 – 35% trọng lượng trái, thịt ráo không dính tay": "出肉率达 32 – 35%，果肉干爽不粘手",
  "8m × 8m hoặc 9m × 9m (120 – 150 cây/ha)": "8m × 8m 或 9m × 9m（每公顷 120 – 150 株）",
  "Bắt buộc thụ phấn nhân tạo bổ sung lúc 18h00 – 20h30 để quả tròn đều 5 hộc, chống méo hộc":
    "须在晚间 18:00 – 20:30 进行人工辅助授粉，确保五室果瓣匀称饱满、防偏果",
  "Bắt buộc thụ phấn nhân tạo bổ sung lúc 18h00 – 20h30 để quả tròn đều 5 hộc":
    "须在晚间 18:00 – 20:30 进行人工辅助授粉，确保五室果瓣匀称饱满",
  "Tỉa hoa làm 3 đợt, tỉa trái làm 2 đợt; cây 6–8 năm chỉ tuyển giữ 60–80 quả đều đẹp nhất":
    "分 3 次疏花、2 次疏果；6–8 年树龄每株精选保留 60–80 个端正优质果",
  "Tỉa hoa làm 3 đợt, tỉa trái làm 2 đợt; cây 6–8 năm giữ 60–80 quả đều đẹp nhất":
    "分 3 次疏花、2 次疏果；6–8 年树龄每株保留 60–80 个优质果",
  "Dễ bị thối đít quả và nứt gai vào mùa mưa; cần bón đủ Canxi-Bo định kỳ, cấm dùng phân Kali đỏ (KCl)":
    "雨季易发果顶腐烂与裂刺；需定期补充钙硼肥，严禁使用氯化钾（红钾肥 KCl）",
  "Cần bón đủ Canxi-Bo định kỳ, cấm dùng phân Kali đỏ (KCl)": "需定期补充钙硼营养，严禁使用氯化钾 (KCl)",
  "Giống sầu riêng bản địa xuất sắc. Quả thuôn tròn đều, cơm vàng óng ánh như tơ, hạt lép 75 – 80%, vị ngọt đậm đà béo thơm đặc trưng.":
    "越南优质本土品种。果型椭圆匀称，果肉金黄油亮，扁核率 75 – 80%，香甜浓郁。",
  "Tiêu thụ nội địa cực mạnh và xuất khẩu quả tươi rất được ưa chuộng nhờ mùi vị đậm đà":
    "凭借浓郁香气与口感，在国内市场及鲜果出口市场均极受欢迎",
  "Tiêu thụ nội địa cực mạnh và xuất khẩu quả tươi rất được ưa chuộng":
    "国内市场与鲜果出口均极为畅销",
  "Quả dáng thuôn tròn cân đối, rãnh múi phân định rõ ràng 5 hộc": "果型椭圆匀称，五室果瓣沟槽分明",
  "Gai to, thưa, nở phẳng khi trái đẫy đà chuẩn bị chín": "果刺粗大稀疏，果实饱满临近成熟时刺距展平",
  "Vỏ mỏng, khi chín giữ màu vàng xanh tự nhiên, đáy quả nhọn nhẹ": "果壳薄，成熟时呈自然青黄色，果底微尖",
  "Cơm vàng đậm bóng mịn, dẻo quánh, hạt lép nhiều, khô ráo": "果肉深黄油亮、软糯干爽、扁核率高",
  "8m × 8m (150 cây/ha), cây phát triển tán dù phân cành thấp": "8m × 8m（每公顷 150 株），树冠伞形、分枝较低",
  "Thụ phấn nhân tạo giúp đậu đều 5 hộc, hạn chế rụng sinh lý": "人工辅助授粉有助五室均匀座果，减少生理落果",
  "Tỉa bớt cành tăm, giữ chùm hoa ở vị trí 1/3 cành tính từ thân chính ra":
    "疏除细弱枝，保留主干向外 1/3 枝段处的健壮花穗",
  "Dễ bị sượng nước (cháy múi) nếu thừa đạm lúc quả lớn; tuyệt đối không dùng phân Kali đỏ (KCl)":
    "膨果期氮肥过多易引起果肉积水生硬；绝对禁止使用氯化钾 (KCl)",
  "Dễ bị sượng nước nếu thừa đạm lúc quả lớn; tuyệt đối không dùng phân Kali đỏ (KCl)":
    "膨果期氮肥过多易引起果肉生硬；绝对禁止使用氯化钾 (KCl)",
  "Phân khúc siêu cao cấp, giá bán cao gấp 2 – 3 lần sầu riêng thông thường":
    "超高端精品品种，收购均价为普通榴莲的 2 – 3 倍",
  "Đáy quả có biểu tượng ngôi sao 5 cánh màu nâu phẳng rõ rệt": "果底具明显的五角星形褐色平坦标志",
  "Cuống phẳng, có vòng khấc ngăn cách cuống và thân trái rõ rệt": "果柄连接处有明显环状凸起分界",
  "Gai hình kim tự tháp dẹt, tương đối phẳng và cách xa nhau": "果刺呈扁金字塔形，间距较宽",
  "Hạt cực nhỏ, dẹt như lá bài; tỷ lệ cơm sử dụng đạt trên 90%": "果核极扁小，可食果肉率达 90% 以上",
  "9m × 9m (120 cây/ha); cây ưa độ ẩm nhưng cực kỳ kỵ úng nước":
    "9m × 9m（每公顷 120 株）；喜湿润但极忌根部积水",
  "Bắt buộc thụ phấn chéo bằng phấn hoa Ri6 hoặc Monthong để tăng tỷ lệ đậu trái":
    "须采用 Ri6 或金枕花粉进行异花授粉以提高座果率",
  "Chỉ giữ quả dạng cân đối, loại bỏ sớm các quả có rãnh méo hoặc cuống teo":
    "仅保留端正果型，及早疏除偏果或果柄细弱果",
  "Chỉ giữ quả dạng cân đối, loại bỏ sớm các quả có rãnh méo": "仅保留端正果型，及早疏除畸形偏果",
  "Thích hợp thu hoạch khi trái chín rụng tự nhiên hoặc cắt già ở độ chín trên 90%":
    "适合自然熟落采收或在成熟度达 90% 以上时采剪",
  "Thích hợp thu hoạch khi trái chín ở độ già trên 90%": "适合在成熟度达 90% 以上时采收",
  "Giống sầu riêng quý hiếm đỉnh cao đang được nhân rộng tại Việt Nam. Điểm nhận diện là chóp gai có màu nâu đen và đáy lõm tròn. Cơm màu đỏ cam bắt mắt, vị béo thơm kem custard, ngọt thanh tao không gắt cổ.":
    "正在越南推广的名贵高端品种。特征为刺尖呈黑褐色、果底圆形凹陷，果肉橙红诱人，口感如奶油卡仕达般绵密香甜。",
  "Giống sầu riêng quý hiếm đỉnh cao đang được nhân rộng tại Việt Nam. Điểm nhận diện là chóp gai có màu nâu đen và đáy lõm tròn, cơm màu đỏ cam bắt mắt.":
    "正在越南推广的名贵高端品种，刺尖呈黑褐色、果底圆凹，果肉呈诱人橙红色。",
  "Xu hướng tiêu dùng cao cấp mới, được thị trường Trung Quốc và Singapore săn đón":
    "高端消费新趋势，深受中国与新加坡高端市场追捧",
  "Quả hình tròn đều như trái banh, đầu các chóp gai có màu sẫm đen": "果型浑圆匀称，果刺尖端呈深黑褐色",
  "Đáy quả có một điểm lõm tròn màu đen đặc trưng (Black Thorn)": "果底中央有明显的黑色圆形凹陷及黑刺特征",
  "Múi thịt dày, màu sắc từ cam nhạt đến cam đỏ sậm óng ả": "果瓣饱满厚实，色泽由浅橙至深橙红色",
  "Cơm có màng bọc mịn màng, khi cắn tan trong miệng như kem mousse": "果肉外膜细腻，入口即化如慕斯奶油",
  "8m × 8m hoặc 8m × 9m; sinh trưởng khỏe, cành tán vươn rộng": "8m × 8m 或 8m × 9m；长势旺盛，树冠开张",
  "Cần kết hợp thụ phấn chéo để quả tròn đều và múi phân bố 5 hộc đầy":
    "需配合异花辅助授粉，使果型浑圆、五室果瓣饱满",
  "Tỉa chồi vượt thường xuyên, tạo tán thông thoáng hạn chế nấm Phytophthora":
    "定期修剪徒长枝，保持树冠通风透光以预防疫霉病",
  "Vỏ mỏng nên cần bón bổ sung Kali Sunfat và Silic hữu cơ trước thu hoạch 30 ngày để vỏ cứng cáp":
    "果壳较薄，采前 30 天需补充硫酸钾与有机硅肥以增强果壳韧性",
  "Vỏ mỏng nên cần bón bổ sung Kali Sunfat và Silic hữu cơ trước thu hoạch 30 ngày":
    "果壳较薄，采前 30 天需补充硫酸钾与有机硅肥",
  "Mới được cấp mã số vùng trồng, sinh trưởng khỏe trên đất đỏ bazan Đắk Lắk, cơm ráo dày múi.":
    "新获批注册果园代码品种，在多乐省玄武岩红壤上长势旺盛，果肉干爽厚实。",
  "Mới được cấp mã số vùng trồng, đang mở rộng tại Đắk Lắk": "新获批注册果园代码，正在多乐省扩大种植",
  "Phổ biến nhất Tây Nguyên, múi vàng đậm, thịt dày, ngọt béo": "西原地区最普及品种，果肉深黄肥厚、香甜浓郁",
  "Múi vàng sáng, vị đậm, đắng nhẹ, giá trị xuất khẩu cao nhất": "果肉亮黄、风味浓郁微苦回甘，出口价值最高",
  "Vỏ dày, dễ vận chuyển, múi trắng kem, ít mùi, phù hợp TQ": "果壳耐储运、果肉奶油黄、气味清雅，最受中国市场欢迎",
  "Giống xuất khẩu chủ lực tại Tây Nguyên": "西原地区主力出口品种",
  "Quả thon dài cân đối, vỏ mỏng dễ tách hộc": "果型修长匀称，果壳薄易开瓣",
  "Cơm vàng sáng, khô ráo, bảo quản lạnh dài ngày không xuống màu": "果肉亮黄干爽，冷链储运不易变色",
  "8m × 8m (150 cây/ha)": "8m × 8m（每公顷 150 株）",
  "Thụ phấn bổ sung ban đêm giúp trái tròn đều": "夜间人工辅助授粉有助果型圆整",
  "Tuyển giữ 50 – 70 trái/cây trưởng thành": "成年树每株精选保留 50 – 70 果",
  "Bón cân đối Kali Sunfat và Canxi-Bo giai đoạn nuôi trái": "壮果期均衡施用硫酸钾与钙硼营养",

  // ─── Hỗ trợ hệ thống (SystemSupport) ───
  "Bạn cần hỗ trợ ?": "需要帮助支持？",
  "Hỗ trợ hệ thống": "系统帮助与技术支持",
  "Kênh liên hệ trực tiếp": "直接联系渠道",
  "Hotline kỹ thuật HTX": "合作社技术热线",
  "Văn phòng HTX": "合作社办公室",
  "Krông Búk, Đắk Lắk": "多乐省克容布乡 (Krông Búk, Đắk Lắk)",
  "Giờ hỗ trợ": "服务时间",
  "7:30 – 17:00 (Thứ 2 – Thứ 7)": "7:30 – 17:00（周一至周六）",
  "Thắc mắc thường gặp": "常见问题解答",
  "HỖ TRỢ 1 · NGOẠI TUYẾN": "支持 1 · 离线记录",
  "Ghi nhật ký khi mất kết nối mạng": "无网络信号时记录农事日志",
  "Hệ thống tự động lưu trên điện thoại và đồng bộ ngay khi có lại kết nối mạng 4G/Wifi.":
    "系统会自动保存在手机本地，并在恢复 4G/Wi-Fi 网络连接后立即同步。",
  "HỖ TRỢ 2 · THÔNG TIN THỬA": "支持 2 · 地块信息",
  "Cần điều chỉnh diện tích, mã số thửa đất": "需要调整地块面积或地块编码",
  "Vui lòng liên hệ trực tiếp cán bộ HTX hoặc Trưởng thôn để được hỗ trợ cập nhật thông tin thửa đất.":
    "请直接联系合作社管理员或村长协助核实并更新果园地块档案。",
  "HỖ TRỢ 3 · TÀI KHOẢN": "支持 3 · 账户安全",
  "Quên mật khẩu hoặc đổi số điện thoại": "忘记密码或更换手机号码",
  "Liên hệ Ban quản trị HTX hoặc Trưởng thôn để được kiểm tra và cấp lại mật khẩu đăng nhập.":
    "请联系合作社管理委员会或村长核实身份并重置登录密码。",
  "Hệ thống Quản lý Vùng trồng & Nhật ký số PUC Krông Búk · Phiên bản 2.4.0":
    "居内合作社 (HTX Cư Né) PUC 种植区管理与数字化农事日志系统 · 版本 2.4.0",
  "Hệ thống Quản lý Vùng trồng & Nhật ký số PUC HTX Cư Né · Phiên bản 2.4.0":
    "居内合作社 (HTX Cư Né) PUC 种植区管理与数字化农事日志系统 · 版本 2.4.0",

  // ─── Tiện ích upload / dùng chung ───
  "Chụp ảnh hoặc tải ảnh lên": "拍照或上传图片",
  "Bấm để mở máy ảnh hoặc chọn ảnh có sẵn": "点击打开相机或从相册选择照片",
  "* Bắt buộc": "* 必填",
  "Không bắt buộc": "选填",
  "Xem trước ảnh đã chọn": "已选照片预览",
  "Ảnh đã chọn": "已选照片",
  "✓ Đã đính kèm": "✓ 已附上照片",
  "Bỏ ảnh này để chọn ảnh khác": "移除此照片并重新选择",
  "Bỏ ảnh đã chọn": "移除已选照片",
  "Thêm ảnh giấy tờ hoặc tệp PDF": "添加证明图片或 PDF 文件",
  "Mở ảnh gốc": "查看原图",
  "Chỉ nhận ảnh (JPG, PNG…) hoặc tệp PDF.": "仅支持图片 (JPG, PNG…) 或 PDF 文件。",
  "Vui lòng chọn tệp ảnh (JPG, PNG…).": "请选择图片文件 (JPG, PNG…)。",
  "Tệp PDF không được vượt quá 10MB.": "PDF 文件大小不能超过 10MB。",
  "Ảnh quá lớn (tối đa 15MB).": "图片文件过大（最大 15MB）。",
  "Không xử lý được yêu cầu.": "无法处理该请求。",
  "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.": "无法连接服务器，请检查网络后重试。",
};

/** Bản đồ chữ thường giúp tra cứu không phân biệt hoa/thường (ví dụ "ĐỦ CHUẨN XUẤT KHẨU"). */
const LOWER_MAP: Record<string, string> = {};
for (const [k, v] of Object.entries(EXACT_MAP)) {
  LOWER_MAP[k.toLowerCase()] = v;
}

/**
 * Các mẫu câu động (chứa số, mã thửa, tên thôn, tên trưởng thôn, ngày tháng, thông báo...) được dịch bằng biểu thức chính quy.
 */
const PATTERN_RULES: Array<[RegExp, (...args: string[]) => string]> = [
  [/^Thôn\s+(\d+)$/i, (_, n) => `第 ${n} 村 (Thôn ${n})`],
  [/^Thôn\s+(.+)$/i, (_, name) => `${name.trim()} 村`],
  [/^Buôn\s+(.+)$/i, (_, name) => `${name.trim()} 村 (Buôn ${name.trim()})`],
  [/^Ấp\s+(.+)$/i, (_, name) => `${name.trim()} 村 (Ấp ${name.trim()})`],
  [/^Xã\s+(.+)$/i, (_, name) => `${translateViToZh(name.trim())} 乡`],
  [/^Huyện\s+(.+)$/i, (_, name) => `${translateViToZh(name.trim())} 县`],
  [/^Tỉnh\s+(.+)$/i, (_, name) => `${translateViToZh(name.trim())} 省`],
  [/^(?:Hợp tác xã|HTX)\s+(.+)$/i, (_, name) => `${translateViToZh(name.trim())} 合作社`],
  [/^Trưởng thôn:\s*(.+)$/i, (_, leader) => `村长：${leader.trim()}`],
  [/^Chủ hộ:\s*(.+)$/i, (_, owner) => `户主：${owner.trim()}`],
  [/^Giảng viên:\s*(.+)$/i, (_, lecturer) => `主讲人：${translateViToZh(lecturer.trim())}`],
  [/^Địa điểm:\s*(.+)$/i, (_, loc) => `地点：${translateViToZh(loc.trim())}`],
  [/^Ghi chú:\s*(.+)$/i, (_, note) => `备注：${translateViToZh(note.trim())}`],
  [/^Nội dung:\s*(.+)$/i, (_, text) => `内容：${translateViToZh(text.trim())}`],
  [/^Lý do:\s*(.+)$/i, (_, text) => `原因：${translateViToZh(text.trim())}`],
  [/^Biện pháp:\s*(.+)$/i, (_, text) => `措施：${translateViToZh(text.trim())}`],
  [/^Mục đích:\s*(.+)$/i, (_, text) => `目的：${translateViToZh(text.trim())}`],
  [/^Liều lượng:\s*(.+)$/i, (_, text) => `剂量：${translateViToZh(text.trim())}`],
  [/^Trưởng thôn\s*\((.+)\)$/i, (_, village) => `村长（${translateViToZh(village)}）`],
  [/^MÃ:\s*(.+)$/i, (_, code) => `编号: ${code}`],
  [/^(.+),\s*Xã Krông Búk$/i, (_, village) => `克容布乡 · ${translateViToZh(village.trim())}`],
  [/^Thửa\s+([A-Za-z0-9_-]+)\s*[—–-]\s*(.+)$/i, (_, code, desc) => `地块 ${code} — ${translateViToZh(desc.trim())}`],
  [/^(\d+)\s*thửa$/i, (_, n) => `${n} 块`],
  [/^(\d+)\s*thửa\s*·\s*(.+)\s*ha$/i, (_, plots, area) => `${plots} 个地块 · ${area} 公顷 (ha)`],
  [/^Thông báo\s*\((\d+)\s*chưa đọc\)$/i, (_, n) => `通知（${n} 条未读）`],
  [/^Hồ sơ:\s*(.+)$/i, (_, name) => `账户档案：${name}`],
  [/^Khai báo thu hái\s*\((\d+)\)$/i, (_, n) => `采收产量申报 (${n})`],
  [/^Khai báo\s*\((\d+)\)$/i, (_, n) => `采收申报 (${n})`],
  [/^Lô hàng xuất kho\s*\((\d+)\)$/i, (_, n) => `出库批次 (${n})`],
  [/^Lô hàng\s*\((\d+)\)$/i, (_, n) => `出库批次 (${n})`],
  [/^Khắc phục vi phạm\s*\((\d+)\)$/i, (_, n) => `违规项整改 (${n})`],
  [/^Còn\s+(\d+)\s+ngày$/i, (_, d) => `剩余 ${d} 天`],
  [/^\(Còn\s+(\d+)\s+ngày\)$/i, (_, d) => `（剩余 ${d} 天）`],
  [/^Còn\s+(\d+)\s+tuần$/i, (_, w) => `剩余 ${w} 周`],
  [/^\(Còn\s+(\d+)\s+tuần\)$/i, (_, w) => `（剩余 ${w} 周）`],
  [/^Cách đây\s+(\d+)\s+ngày$/i, (_, d) => `${d} 天前`],
  [/^Cách đây\s+(\d+)\s+giờ$/i, (_, h) => `${h} 小时前`],
  [/^Cách đây\s+(\d+)\s+phút$/i, (_, m) => `${m} 分钟前`],
  [/^Gần nhất:\s*(.+)$/i, (_, date) => `最近记录：${date.trim()}`],
  [/^Ngưng thu hái đến\s*(.+)$/i, (_, date) => `暂停采收至 ${date.trim()}`],
  [/^Cách ly thuốc:\s*(.+)$/i, (_, name) => `安全间隔期 (PHI)：${name.trim()}`],
  [/^CB\s+(.+)$/i, (_, officer) => `干部 ${officer.trim()}`],
  [/^Phát hiện:\s*([^·]+?)(?:\s*·\s*Thửa\s+(.+))?$/i, (_, date, plot) =>
    plot ? `发现日期：${date.trim()} · 地块 ${plot.trim()}` : `发现日期：${date.trim()}`],
  [/^Phản hồi của hộ(?:\s*·\s*(.+))?$/i, (_, date) =>
    date ? `农户整改反馈 · ${date.trim()}` : `农户整改反馈`],
  [/^Đã xác nhận khắc phục(?:\s+ngày\s+(.+))?$/i, (_, date) =>
    date ? `已确认整改（${date.trim()}）` : `已确认完成整改`],
  [/^Đã gửi khai báo thu hái cho Thửa\s+(.+?)\s+thành công!\s*HTX đã tiếp nhận thông tin\.$/i, (_, code) =>
    `地块 ${code} 的采收申报已成功提交！合作社已接收信息。`],
  [/^Kết quả kiểm nghiệm mẫu\s+([^:]+):\s*(.+)$/i, (_, code, res) =>
    `检测样本 ${code.trim()} 结果：${translateViToZh(res.trim())}`],
  [/^Lịch kiểm tra mới:\s*(.+)$/i, (_, title) => `新巡检计划：${translateViToZh(title.trim())}`],
  [/^Ngày\s+(.+?)\s*–\s*Cán bộ:\s*(.+)$/i, (_, date, officer) => `日期 ${date.trim()} – 负责干部：${officer.trim()}`],
  [/^Cảnh báo vi phạm:\s*(.+)$/i, (_, title) => `违规预警：${translateViToZh(title.trim())}`],
  [/^Vi phạm đã được xác nhận khắc phục:\s*(.+)$/i, (_, title) => `违规已确认完成整改：${translateViToZh(title.trim())}`],
  [/^Hồ sơ\s+(.+?)\s+đã được duyệt$/i, (_, code) => `申请档案 ${code} 已审核通过`],
  [/^Hồ sơ\s+(.+?)\s+bị từ chối$/i, (_, code) => `申请档案 ${code} 已被驳回`],
  [/^Đơn vị:\s*(.+)$/i, (_, lab) => `检测机构：${lab.trim()}`],
  [/^Thửa đất\s+([^,]+),\s*bấm để mở bản đồ toàn cảnh$/i, (_, code) => `地块 ${code}，点击打开全景地图`],
  [/^Xem và in biển cắm vườn cho thửa\s+(.+)$/i, (_, code) => `查看并打印地块 ${code} 的果园标识牌`],
  [/^Biển cắm vườn\s+(.+)$/i, (_, code) => `果园标识牌 ${code}`],
  [/^Vị trí trung tâm thửa đất\s+(.+)$/i, (_, code) => `地块 ${code} 中心位置`],
  [/^Thửa đất\s+(.+)$/i, (_, code) => `地块 ${code}`],
  [/^Thửa\s+(.+)$/i, (_, plot) => `地块 ${plot}`],
  [/^Cán bộ:\s*(.+)$/i, (_, officer) => `负责干部：${officer}`],
  [/^Mã khóa:\s*#TH-(.+)$/i, (_, id) => `课程编号: #TH-${id}`],
  [/^(\d+)\/(\d+)\s*học viên$/i, (_, a, b) => `${a}/${b} 名学员`],
  [/^(\d+)%\s*lấp đầy\s*\((.+)\)$/i, (_, pct, rest) => `已报满 ${pct}%（${translateViToZh(rest)}）`],
  [/^Còn\s+(\d+)\s+chỗ$/i, (_, n) => `剩余 ${n} 个名额`],
  [/^Ngày:\s*(.+)$/i, (_, d) => `日期：${d}`],
  [/^·\s*Ngày\s+(.+)$/i, (_, d) => `· 日期 ${d}`],
  [/^Bắt đầu\s+(.+)$/i, (_, t) => `${t} 开始`],
  [/^([\d.,]+)\s*lít\/ha$/i, (_, n) => `${n} 升/公顷`],
  [/^([\d.,]+)\s*kg\/ha$/i, (_, n) => `${n} 公斤/公顷`],
  [/^([\d.,]+)\s*lít\/cây$/i, (_, n) => `${n} 升/株`],
  [/^([\d.,]+)\s*lít\/gốc$/i, (_, n) => `${n} 升/株`],
  [/^([\d.,]+)\s*kg\/cây$/i, (_, n) => `${n} 公斤/株`],
  [/^([\d.,]+)\s*kg\/gốc$/i, (_, n) => `${n} 公斤/株`],
  [/^([\d.,]+)\s*g\/lít$/i, (_, n) => `${n} 克/升`],
  [/^([\d.,]+)\s*ml\/lít$/i, (_, n) => `${n} 毫升/升`],
  [/^([\d.,]+)\s*g\/bình$/i, (_, n) => `${n} 克/喷雾器`],
  [/^([\d.,]+)\s*ml\/bình$/i, (_, n) => `${n} 毫升/喷雾器`],
  [/^(\d+)\s*ngày$/i, (_, d) => `${d} 天`],
  [/^(\d+\s*[–-]\s*\d+)\s*năm$/i, (_, y) => `${y} 年`],
  [/^(\d+\s*[–-]\s*\d+)\s*ngày$/i, (_, d) => `${d} 天`],
  [/^(\d+)\s*cây$/i, (_, n) => `${n} 株`],
  [/^([\d.,]+)\s*tấn$/i, (_, n) => `${n} 吨`],
  [/^([\d.,]+)\s*tấn\/ha$/i, (_, n) => `${n} 吨/公顷`],
  [/^([\d.,]+)\s*kg$/i, (_, n) => `${n} 公斤`],
  [/^([\d.,]+)\s*lít$/i, (_, n) => `${n} 升`],
  [/^([\d.,]+\s*[–-]\s*[\d.,]+)\s*kg\/trái$/i, (_, r) => `${r} 公斤/果`],
  [/^([\d.,]+\s*[–-]\s*[\d.,]+)\s*tấn\/ha$/i, (_, r) => `${r} 吨/公顷`],
  [/^(\d+\s*[–-]\s*\d+)\s*ngày\s*\(Từ xả nhụy\)$/i, (_, r) => `${r} 天（从谢花起算）`],
];

// ─── TẦNG 2 & 3 & 4: DỊCH TỰ ĐỘNG & BỘ NHỚ ĐỆM CHO DỮ LIỆU MỚI PHÁT SINH ───

const DYN_CACHE_STORAGE_KEY = "puc_portal_dyn_zh_cache_v1";
const MAX_DYN_CACHE_ENTRIES = 1000;
const dynamicZhCache = new Map<string, string>();
const pendingAutoTranslate = new Set<string>();
let dynCacheLoaded = false;
let saveCacheTimer: ReturnType<typeof setTimeout> | null = null;
let domRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function ensureDynCacheLoaded() {
  if (dynCacheLoaded || typeof window === "undefined") return;
  dynCacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(DYN_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const [k, v] of Object.entries(parsed)) {
      if (
        typeof k === "string" &&
        typeof v === "string" &&
        k.length > 0 &&
        v.length > 0 &&
        k !== "__proto__" &&
        k !== "constructor" &&
        k !== "prototype"
      ) {
        dynamicZhCache.set(k, v);
      }
    }
  } catch {
    // Ignore storage parse errors
  }
}

function scheduleSaveDynCache() {
  if (typeof window === "undefined" || saveCacheTimer) return;
  saveCacheTimer = setTimeout(() => {
    saveCacheTimer = null;
    try {
      const entries = Array.from(dynamicZhCache.entries());
      const sliced =
        entries.length > MAX_DYN_CACHE_ENTRIES
          ? entries.slice(entries.length - MAX_DYN_CACHE_ENTRIES)
          : entries;
      const obj: Record<string, string> = {};
      for (const [k, v] of sliced) {
        obj[k] = v;
      }
      window.localStorage.setItem(DYN_CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore quota errors
    }
  }, 400);
}

function scheduleDomRefresh() {
  if (typeof document === "undefined" || domRefreshTimer) return;
  domRefreshTimer = setTimeout(() => {
    domRefreshTimer = null;
    if (document.documentElement.lang === "zh-CN") {
      applyDomTranslation(document.body, "zh");
    }
  }, 80);
}

/** Nhận diện dấu Tiếng Việt để chỉ kích hoạt dịch tự động đối với văn bản Tiếng Việt. */
const VI_DIACRITIC_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗợơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Danh sách họ người Việt phổ biến để giữ nguyên tên riêng của nông hộ / cán bộ / giảng viên. */
const VI_FAMILY_NAMES = new Set([
  "nguyễn", "trần", "lê", "phạm", "hoàng", "huỳnh", "phan", "vũ", "võ",
  "đặng", "bùi", "đỗ", "hồ", "ngô", "dương", "lý", "đinh", "đoàn", "trương",
  "bạch", "mai", "lâm", "tô", "hà", "lưu", "lương", "châu", "tạ", "phùng",
  "trịnh", "vương", "cao", "đào", "tống", "thái", "kiều", "nông", "vi",
  "lò", "điểu", "ksor", "rơ", "h'", "ama", "ami",
]);

function isLikelyPersonName(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  const firstLower = words[0].toLowerCase().replace(/[^a-zà-ỹ']/g, "");
  if (!VI_FAMILY_NAMES.has(firstLower)) return false;
  // Tất cả các từ trong tên người đều viết hoa chữ cái đầu và không chứa dấu câu
  return words.every((w) => /^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ][a-zà-ỹ']*$/.test(w));
}

/**
 * Từ điển cụm từ & từ vựng nông nghiệp dùng cho bộ dịch ghép câu thông minh (Offline Compositional Fallback)
 * khi dữ liệu văn bản tự do mới chưa kịp tải từ API hoặc khi thiết bị ngoại tuyến.
 */
const COMPOSITIONAL_PHRASES: Array<[string, string]> = [
  // Cụm hành động canh tác & nhật ký
  ["tưới nước nhỏ giọt", "滴灌浇水"],
  ["tưới nước giữ ẩm", "浇水保湿"],
  ["tưới nước quanh gốc", "树盘周围浇水"],
  ["tưới nước", "灌溉浇水"],
  ["bón phân hữu cơ vi sinh", "施用有机微生物肥"],
  ["bón phân hữu cơ", "施用有机肥"],
  ["bón phân npk", "施用 NPK 复合肥"],
  ["bón phân qua lá", "喷施叶面肥"],
  ["bón phân quanh tán", "沿树冠滴水线施肥"],
  ["bón phân", "施肥"],
  ["phun thuốc phòng trừ", "喷药防治"],
  ["phun thuốc trừ sâu", "喷施杀虫剂"],
  ["phun thuốc trừ nấm", "喷施杀菌剂"],
  ["phun thuốc sinh học", "喷施生物农药"],
  ["phun thuốc", "喷施农药"],
  ["tỉa cành tạo tán", "修剪整形树冠"],
  ["tỉa cành vượt", "修剪徒长枝"],
  ["tỉa cành tăm", "疏除细弱枝"],
  ["tỉa cành khô", "剪除枯枝"],
  ["tỉa cành", "修剪枝条"],
  ["tỉa bông", "疏花"],
  ["tỉa hoa", "疏花"],
  ["tỉa trái non", "疏除幼果"],
  ["tỉa trái méo", "疏除畸形果"],
  ["tỉa trái", "疏果"],
  ["bao trái", "果实套袋"],
  ["cắt cỏ quanh gốc", "清除树盘杂草"],
  ["làm cỏ quanh gốc", "清除树盘杂草"],
  ["làm cỏ", "除草"],
  ["cắt cỏ", "割草"],
  ["khơi rãnh thoát nước", "疏通排水沟"],
  ["đào rãnh thoát nước", "开挖排水沟"],
  ["thoát nước", "排水"],
  ["thu hoạch đợt đầu", "首批采收"],
  ["thu hoạch chính vụ", "正季采收"],
  ["thu hoạch", "采收"],
  ["thu hái", "采摘"],
  ["kiểm tra sâu bệnh", "巡查病虫害"],
  ["kiểm tra độ ẩm đất", "检查土壤湿度"],
  ["kiểm tra độ ẩm", "检查湿度"],
  ["kiểm tra vườn", "巡查果园"],
  ["kiểm tra", "检查"],
  ["vệ sinh vườn", "清理果园卫生"],
  ["dọn vườn", "清园整理"],
  ["xử lý ra hoa", "催花处理"],
  ["thụ phấn bổ sung", "人工辅助授粉"],
  ["thụ phấn", "授粉"],
  ["cạo vỏ xử lý nấm", "刮皮涂药防治真菌"],
  ["quét vôi gốc", "树干涂白防虫防病"],
  ["ủ gốc giữ ẩm", "树盘覆盖保湿"],
  // Bộ phận cây & giai đoạn sinh trưởng
  ["cây sầu riêng", "榴莲树"],
  ["vườn sầu riêng", "榴莲园"],
  ["sầu riêng", "榴莲"],
  ["nhú mắt cua", "花芽露白（蟹眼期）"],
  ["mắt cua", "花芽（蟹眼）"],
  ["xả nhụy", "谢花授粉期"],
  ["bung đọt non", "抽发新梢"],
  ["cơi đọt non", "新梢期"],
  ["đọt non", "嫩梢"],
  ["cơi đọt", "新梢"],
  ["tán lá", "树冠叶片"],
  ["mặt dưới lá", "叶片背面"],
  ["hai mặt lá", "叶片正反面"],
  ["mép tán lá", "树冠滴水线"],
  ["mép tán", "树冠外围"],
  ["quanh gốc", "树干基部周围"],
  ["cổ rễ", "根颈部"],
  ["rễ tơ", "吸收须根"],
  ["bộ rễ", "根系"],
  ["trái non", "幼果"],
  ["chùm trái", "果簇"],
  ["cuống trái", "果柄"],
  ["chùm hoa", "花穗"],
  ["thân cây", "树干"],
  ["cành chính", "主枝"],
  // Sâu bệnh hại
  ["rầy phấn trắng", "榴莲木虱（白粉虱）"],
  ["rầy xanh", "小绿叶蝉"],
  ["rầy nhảy", "木虱/叶蝉"],
  ["nhện đỏ", "红蜘蛛（叶螨）"],
  ["rệp sáp", "粉蚧"],
  ["bọ trĩ", "蓟马"],
  ["sâu đục trái", "蛀果螟"],
  ["sâu đục quả", "蛀果螟"],
  ["sâu đục thân", "天牛/钻心虫"],
  ["mọt đục cành", "枝小蠹"],
  ["ruồi đục quả", "果实蝇"],
  ["nấm phytophthora", "疫霉菌 (Phytophthora)"],
  ["xì mủ thân", "树干流胶病"],
  ["thối rễ", "根腐病"],
  ["thối trái", "果实腐烂病"],
  ["thán thư", "炭疽病"],
  ["cháy lá", "叶枯病"],
  ["vàng lá", "黄叶病"],
  ["nứt gai", "果刺开裂"],
  ["sượng cơm", "果肉生硬（水包子）"],
  // Thời tiết, thời gian, vị trí & trạng thái
  ["buổi sáng sớm", "清晨"],
  ["sáng sớm", "清晨"],
  ["buổi sáng", "上午"],
  ["buổi chiều mát", "傍晚凉爽时"],
  ["chiều mát", "傍晚凉爽时"],
  ["buổi chiều", "下午"],
  ["buổi trưa", "中午"],
  ["buổi tối", "晚间"],
  ["hôm nay", "今天"],
  ["hôm qua", "昨天"],
  ["ngày mai", "明天"],
  ["tuần này", "本周"],
  ["tuần tới", "下周"],
  ["tháng này", "本月"],
  ["mùa mưa", "雨季"],
  ["mùa khô", "旱季"],
  ["trời mưa to", "大雨天气"],
  ["mưa lớn", "大雨"],
  ["sau cơn mưa", "雨后"],
  ["trời nắng", "晴天"],
  ["nắng gắt", "烈日高温"],
  ["đồi trên", "上坡区"],
  ["đồi dưới", "下坡区"],
  ["sườn đồi", "山坡区"],
  ["bãi bằng", "平地区"],
  ["ven suối", "溪边区"],
  ["phía đông", "东侧"],
  ["phía tây", "西侧"],
  ["phía nam", "南侧"],
  ["phía bắc", "北侧"],
  ["góc vườn", "果园角落"],
  ["toàn bộ vườn", "整个果园"],
  ["toàn vườn", "全园"],
  ["sinh trưởng tốt", "长势良好"],
  ["phát triển tốt", "生长良好"],
  ["bình thường", "正常"],
  ["ổn định", "稳定"],
  ["đạt yêu cầu", "符合要求"],
  ["đủ tiêu chuẩn", "符合标准"],
  ["đúng quy trình", "符合技术规程"],
  ["đúng liều lượng", "按规定剂量"],
  ["thời gian cách ly", "安全间隔期 (PHI)"],
  ["mã vùng trồng", "注册果园代码 (PUC)"],
  ["hợp tác xã", "合作社"],
  ["nông hộ", "农户"],
  ["xã viên", "社员"],
  ["cán bộ kỹ thuật", "技术干部"],
  ["cán bộ", "干部"],
  ["thửa đất", "地块"],
];

const COMPOSITIONAL_PHRASE_RULES: Array<[RegExp, string]> = COMPOSITIONAL_PHRASES.map(
  ([viPhrase, zhPhrase]) => {
    const escaped = viPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [new RegExp(`(^|[^a-zA-ZÀ-ỹ])(${escaped})(?=$|[^a-zA-ZÀ-ỹ])`, "gi"), zhPhrase];
  },
);

const COMPOSITIONAL_UNIT_RULES: Array<[RegExp, string]> = [
  [/(\d+(?:[.,]\d+)?)\s*lít\/ha\b/gi, "$1 升/公顷"],
  [/(\d+(?:[.,]\d+)?)\s*kg\/ha\b/gi, "$1 公斤/公顷"],
  [/(\d+(?:[.,]\d+)?)\s*kg\/gốc\b/gi, "$1 公斤/株"],
  [/(\d+(?:[.,]\d+)?)\s*kg\/cây\b/gi, "$1 公斤/株"],
  [/(\d+(?:[.,]\d+)?)\s*lít\/gốc\b/gi, "$1 升/株"],
  [/(\d+(?:[.,]\d+)?)\s*lít\/cây\b/gi, "$1 升/株"],
  [/(\d+(?:[.,]\d+)?)\s*lít\s*nước\b/gi, "$1 升水"],
  [/(\d+(?:[.,]\d+)?)\s*lít\b/gi, "$1 升"],
  [/(\d+(?:[.,]\d+)?)\s*kg\b/gi, "$1 公斤"],
  [/(\d+(?:[.,]\d+)?)\s*tấn\b/gi, "$1 吨"],
  [/(\d+)\s*ngày\b/gi, "$1 天"],
  [/(\d+)\s*giờ\b/gi, "$1 小时"],
  [/(\d+)\s*phút\b/gi, "$1 分钟"],
  [/(\d+)\s*cây\b/gi, "$1 株"],
  [/(\d+)\s*gốc\b/gi, "$1 株"],
  [/(\d+)\s*bao\b/gi, "$1 袋"],
  [/(\d+)\s*bình\b/gi, "$1 喷雾器"],
  [/(\d+)\s*phuy\b/gi, "$1 桶"],
  [/(\d+)\s*lần\b/gi, "$1 次"],
];

function translateCompositionalViToZh(text: string): string {
  if (!VI_DIACRITIC_RE.test(text) || isLikelyPersonName(text)) {
    return text;
  }

  let result = text;
  let replacedAny = false;

  for (const [regex, zhPhrase] of COMPOSITIONAL_PHRASE_RULES) {
    regex.lastIndex = 0;
    if (regex.test(result)) {
      regex.lastIndex = 0;
      result = result.replace(regex, (_, prefix: string) => `${prefix}${zhPhrase}`);
      replacedAny = true;
    }
  }

  for (const [uRegex, uReplace] of COMPOSITIONAL_UNIT_RULES) {
    uRegex.lastIndex = 0;
    if (uRegex.test(result)) {
      uRegex.lastIndex = 0;
      result = result.replace(uRegex, uReplace);
      replacedAny = true;
    }
  }

  return replacedAny ? result : text;
}

/**
 * Tầng 4: Tự động gọi API dịch sang Tiếng Trung (zh-CN) cho dữ liệu văn bản tự do mới phát sinh
 * và lưu vào bộ nhớ đệm (localStorage) để các lần hiển thị sau tức thì 0ms.
 */
/** Ngắt mạch: endpoint nào lỗi / bị giới hạn (429) thì tạm bỏ qua trong 10 phút để không gửi yêu cầu vô ích. */
const ENDPOINT_COOLDOWN_MS = 10 * 60 * 1000;
const endpointDisabledUntil = { google: 0 };

async function fetchOnlineViToZh(text: string): Promise<string | null> {
  const now = Date.now();
  // Chỉ dùng Google Translate GTX (HTTPS), không gửi dữ liệu sang kho bộ nhớ dịch công cộng của bên thứ ba
  if (now >= endpointDisabledUntil.google) try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) endpointDisabledUntil.google = Date.now() + ENDPOINT_COOLDOWN_MS;
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const joined = data[0]
          .map((seg: unknown) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
          .join("")
          .trim();
        if (joined && joined !== text) {
          return joined;
        }
      }
    }
  } catch {
    endpointDisabledUntil.google = Date.now() + ENDPOINT_COOLDOWN_MS;
  }

  return null;
}

/** Chuỗi dịch thất bại: chờ 10 phút mới thử lại (tránh vòng lặp gọi API mỗi lần React render lại). */
const failedAutoTranslate = new Map<string, number>();
const autoTranslateQueue: string[] = [];
const MAX_CONCURRENT_AUTO_TRANSLATE = 2;
let activeAutoTranslate = 0;

function pumpAutoTranslateQueue() {
  while (activeAutoTranslate < MAX_CONCURRENT_AUTO_TRANSLATE && autoTranslateQueue.length > 0) {
    const text = autoTranslateQueue.shift()!;
    activeAutoTranslate += 1;
    void fetchOnlineViToZh(text)
      .then((zh) => {
        if (zh) {
          dynamicZhCache.set(text, zh);
          failedAutoTranslate.delete(text);
          scheduleSaveDynCache();
          scheduleDomRefresh();
        } else {
          failedAutoTranslate.set(text, Date.now() + ENDPOINT_COOLDOWN_MS);
        }
      })
      .catch(() => {
        failedAutoTranslate.set(text, Date.now() + ENDPOINT_COOLDOWN_MS);
      })
      .finally(() => {
        activeAutoTranslate -= 1;
        pendingAutoTranslate.delete(text);
        pumpAutoTranslateQueue();
      });
  }
}

function queueAutoTranslateViToZh(trimmed: string) {
  if (typeof window === "undefined") return;
  if (pendingAutoTranslate.has(trimmed) || dynamicZhCache.has(trimmed)) return;
  if (!VI_DIACRITIC_RE.test(trimmed) || isLikelyPersonName(trimmed)) return;
  // Không gửi chuỗi chứa dãy số dài (CCCD, số điện thoại, mã định danh) ra ngoài
  if (/\d{6,}/.test(trimmed)) return;
  if (trimmed.length < 2 || trimmed.length > 480) return;
  const retryAt = failedAutoTranslate.get(trimmed);
  if (retryAt !== undefined && Date.now() < retryAt) return;

  pendingAutoTranslate.add(trimmed);
  autoTranslateQueue.push(trimmed);
  pumpAutoTranslateQueue();
}

function translateSingleSegment(trimmed: string): string {
  if (!trimmed) return trimmed;

  // Tầng 1: Từ điển chuẩn & Mẫu quy tắc động (0ms)
  const exact = EXACT_MAP[trimmed] ?? LOWER_MAP[trimmed.toLowerCase()];
  if (exact) return exact;

  for (const [regex, replacer] of PATTERN_RULES) {
    const match = regex.exec(trimmed);
    if (match) {
      return replacer(...match);
    }
  }

  // Không dịch tên riêng của người (ví dụ: Nguyễn Văn Phú)
  if (isLikelyPersonName(trimmed)) {
    return trimmed;
  }

  // Tầng 2: Bộ nhớ đệm dữ liệu mới đã dịch trước đó (0ms)
  ensureDynCacheLoaded();
  const cached = dynamicZhCache.get(trimmed);
  if (cached) return cached;

  // Nếu chuỗi có dấu Tiếng Việt (dữ liệu mới phát sinh chưa có trong từ điển tĩnh):
  if (VI_DIACRITIC_RE.test(trimmed)) {
    // Tầng 4 (Bất đồng bộ): Xếp hàng gọi API dịch tự động câu mới và cập nhật DOM khi hoàn tất
    queueAutoTranslateViToZh(trimmed);
    // Tầng 3 (Tức thì - 0ms): Dịch ghép cụm từ nông nghiệp trong lúc chờ hoặc khi ngoại tuyến.
    // Chỉ dùng khi đã dịch được TRỌN VẸN câu; nếu còn sót chữ Việt thì giữ nguyên bản gốc
    // để tránh câu lai Việt–Trung khó đọc (ví dụ "Sáng nay mưa to làm đổ 2 榴莲树 ở 果园角落").
    const composed = translateCompositionalViToZh(trimmed);
    return VI_DIACRITIC_RE.test(composed) ? trimmed : composed;
  }

  return trimmed;
}

/** Dịch một chuỗi Tiếng Việt sang Tiếng Trung (giữ nguyên khoảng trắng hai đầu và hỗ trợ chuỗi ghép có " · ", " – ", " — "). */
export function translateViToZh(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // Ưu tiên kiểm tra khớp chính xác toàn chuỗi trước
  const exactFull = EXACT_MAP[trimmed] ?? LOWER_MAP[trimmed.toLowerCase()];
  if (exactFull) {
    const lead = raw.slice(0, raw.indexOf(trimmed));
    const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
    return `${lead}${exactFull}${tail}`;
  }

  // Hỗ trợ chuỗi nhiều vế ngăn cách bởi " · ", " – ", " — "
  for (const sep of [" · ", " – ", " — "]) {
    if (trimmed.includes(sep)) {
      const parts = trimmed.split(new RegExp(`\\s*${sep.trim()}\\s*`));
      let changed = false;
      const translatedParts = parts.map((part) => {
        const tp = translateSingleSegment(part);
        if (tp !== part) changed = true;
        return tp;
      });
      if (changed) {
        const joined = translatedParts.join(sep);
        const lead = raw.slice(0, raw.indexOf(trimmed));
        const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
        return `${lead}${joined}${tail}`;
      }
    }
  }

  const direct = translateSingleSegment(trimmed);
  if (direct !== trimmed) {
    const lead = raw.slice(0, raw.indexOf(trimmed));
    const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
    return `${lead}${direct}${tail}`;
  }

  return raw;
}

interface PortalLangContextValue {
  lang: PortalLang;
  setLang: (next: PortalLang) => void;
  isZh: boolean;
  t: (vi: string, zh?: string) => string;
}

const PortalLangContext = createContext<PortalLangContextValue>({
  lang: "vi",
  setLang: () => {},
  isZh: false,
  t: (vi) => vi,
});

export function usePortalLang() {
  return useContext(PortalLangContext);
}

const originalTextMap = new WeakMap<Text, string>();
const appliedZhTextMap = new WeakMap<Text, string>();
const originalAttrMap = new WeakMap<Element, Map<string, string>>();
const appliedZhAttrMap = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label"] as const;

function translateTextNode(textNode: Text, lang: PortalLang) {
  const parentEl = textNode.parentElement;
  const parentTag = parentEl?.tagName;
  if (
    parentTag === "SCRIPT" ||
    parentTag === "STYLE" ||
    parentTag === "TEXTAREA" ||
    parentTag === "CODE" ||
    parentTag === "PRE" ||
    parentEl?.isContentEditable
  ) {
    return;
  }

  const currentVal = textNode.nodeValue ?? "";
  if (!currentVal.trim()) return;

  if (lang === "zh") {
    const savedOrig = originalTextMap.get(textNode);
    const lastAppliedZh = appliedZhTextMap.get(textNode);
    const isStillSaved =
      savedOrig !== undefined && (currentVal === savedOrig || currentVal === lastAppliedZh);
    const source = isStillSaved ? savedOrig! : currentVal;
    const translated = translateViToZh(source);
    originalTextMap.set(textNode, source);
    if (translated !== source) {
      appliedZhTextMap.set(textNode, translated);
      if (currentVal !== translated) {
        textNode.nodeValue = translated;
      }
    }
  } else {
    const savedOrig = originalTextMap.get(textNode);
    const lastAppliedZh = appliedZhTextMap.get(textNode);
    if (savedOrig !== undefined && currentVal === lastAppliedZh && currentVal !== savedOrig) {
      textNode.nodeValue = savedOrig;
    }
  }
}

function translateElementAttrs(el: Element, lang: PortalLang) {
  for (const attr of TRANSLATABLE_ATTRS) {
    const val = el.getAttribute(attr);
    if (!val) continue;
    let attrStore = originalAttrMap.get(el);
    let zhAttrStore = appliedZhAttrMap.get(el);
    if (lang === "zh") {
      const savedOrig = attrStore?.get(attr);
      const lastAppliedZh = zhAttrStore?.get(attr);
      const isStillSaved =
        savedOrig !== undefined && (val === savedOrig || val === lastAppliedZh);
      const source = isStillSaved ? savedOrig! : val;
      const translated = translateViToZh(source);
      if (!attrStore) {
        attrStore = new Map();
        originalAttrMap.set(el, attrStore);
      }
      attrStore.set(attr, source);
      if (translated !== source) {
        if (!zhAttrStore) {
          zhAttrStore = new Map();
          appliedZhAttrMap.set(el, zhAttrStore);
        }
        zhAttrStore.set(attr, translated);
        if (val !== translated) el.setAttribute(attr, translated);
      }
    } else if (attrStore?.has(attr)) {
      const savedOrig = attrStore.get(attr)!;
      const lastAppliedZh = zhAttrStore?.get(attr);
      if (val === lastAppliedZh && val !== savedOrig) {
        el.setAttribute(attr, savedOrig);
      }
    }
  }
}

let isApplyingDom = false;

function applyDomTranslation(root: Node, lang: PortalLang) {
  isApplyingDom = true;
  try {
    if (root.nodeType === 3 /* Node.TEXT_NODE */) {
      translateTextNode(root as Text, lang);
      return;
    }
    if (root.nodeType === 1 /* Node.ELEMENT_NODE */) {
      translateElementAttrs(root as Element, lang);
    }
    if (typeof document === "undefined" || typeof document.createTreeWalker !== "function") {
      return;
    }
    const walker = document.createTreeWalker(root, 5 /* SHOW_ELEMENT | SHOW_TEXT */);
    let current: Node | null = walker.nextNode();
    while (current) {
      if (current.nodeType === 3) {
        translateTextNode(current as Text, lang);
      } else if (current.nodeType === 1) {
        translateElementAttrs(current as Element, lang);
      }
      current = walker.nextNode();
    }
  } finally {
    isApplyingDom = false;
  }
}

export function PortalLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PortalLang>(() => {
    if (typeof window === "undefined") return "vi";
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "zh" ? "zh" : "vi";
  });
  const hasTranslatedZhRef = useRef(false);

  const setLang = useCallback((next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const t = useCallback(
    (vi: string, zh?: string) => {
      if (lang === "vi") return vi;
      return zh ?? translateViToZh(vi);
    },
    [lang],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "vi";

    // Nếu đang ở Tiếng Việt và chưa từng bật Tiếng Trung thì không cần quét cây DOM (0ms CPU)
    if (lang === "vi") {
      if (hasTranslatedZhRef.current) {
        applyDomTranslation(document.body, "vi");
      }
      return;
    }

    hasTranslatedZhRef.current = true;
    applyDomTranslation(document.body, "zh");
    const rafId = requestAnimationFrame(() => {
      applyDomTranslation(document.body, "zh");
    });

    const observer = new MutationObserver((mutations) => {
      if (isApplyingDom) return;
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => applyDomTranslation(node, "zh"));
        } else if (m.type === "characterData" && m.target) {
          translateTextNode(m.target as Text, "zh");
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      isZh: lang === "zh",
      t,
    }),
    [lang, setLang, t],
  );

  return <PortalLangContext.Provider value={value}>{children}</PortalLangContext.Provider>;
}
