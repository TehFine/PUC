import type { Role } from "@/types/api";

/** Trang chính của từng vai trò sau khi đăng nhập: hộ dân vào cổng hộ dân, còn lại vào giao diện quản trị. */
export const homePathFor = (role: Role | undefined) => (role === "farmer" ? "/portal" : "/admin");

/** Trang giới thiệu công khai không tự chuyển hướng, dùng cho biểu tượng hệ thống trong khu vực đã đăng nhập. */
export const INTRO_PATH = "/gioi-thieu";
