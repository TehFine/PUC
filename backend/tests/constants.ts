export const TEST_PASSWORD = "Test@12345";
/** Cổng PostgreSQL nhúng cho test; đặt TEST_DB_PORT để chạy song song nhiều bộ test trên cùng máy. */
export const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? 54339);
