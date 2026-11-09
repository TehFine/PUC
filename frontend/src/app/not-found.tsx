import Image from "next/image";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "linear-gradient(180deg, #f3f7f2 0%, #ffffff 100%)",
        color: "#14372f",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 500,
          width: "100%",
          background: "#ffffff",
          borderRadius: 20,
          border: "1px solid rgba(20, 55, 47, 0.1)",
          boxShadow: "0 20px 50px rgba(15, 41, 34, 0.08)",
          padding: "36px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#ecfdf5",
            marginBottom: 16,
          }}
        >
          <Image src="/logo.png" alt="HTX Cư Né" width={44} height={44} />
        </div>

        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#15803d",
            marginBottom: 8,
          }}
        >
          Mã lỗi 404 · Không tìm thấy trang
        </span>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#0f2922",
            margin: "0 0 10px",
            lineHeight: 1.3,
          }}
        >
          Đường dẫn không tồn tại hoặc đã thay đổi
        </h1>

        <p
          style={{
            fontSize: 14.5,
            color: "#475569",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          Trang bạn đang tìm kiếm không có trên hệ thống quản lý vùng trồng HTX Nông nghiệp Cư Né. Bạn có thể quay về trang chủ hoặc tra cứu nguồn gốc lô hàng.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <Link
            href="/"
            style={{
              padding: "11px 20px",
              borderRadius: 12,
              background: "#14372f",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Về trang chủ HTX
          </Link>
          <Link
            href="/trace"
            style={{
              padding: "11px 18px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Tra cứu QR
          </Link>
          <Link
            href="/login"
            style={{
              padding: "11px 18px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#14372f",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

