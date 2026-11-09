"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, QrCode, Search, ShieldCheck, Sprout } from "lucide-react";
import { api } from "@/lib/api-client";

interface SampleLot {
  code: string;
  harvestedOn: string;
  weightKg: number;
  buyer: string | null;
  market: string | null;
  status: string | null;
}

interface SampleStamp {
  code: string;
  issuedAt: string | null;
  lotCode: string | null;
  weightKg: number | null;
  grade: string | null;
  householdName: string;
}

interface TraceSamplesResponse {
  lots: SampleLot[];
  stamps: SampleStamp[];
}

export default function TraceLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [samples, setSamples] = useState<TraceSamplesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<TraceSamplesResponse>("/public/trace-samples")
      .then((res) => {
        if (active) setSamples(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/trace/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f3f7f2 0%, #ffffff 45%, #f8faf7 100%)",
        color: "#14372f",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid rgba(20, 55, 47, 0.08)",
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "#14372f",
            }}
          >
            <Image src="/logo.png" alt="HTX Cư Né" width={36} height={36} style={{ borderRadius: 10 }} />
            <div>
              <strong style={{ display: "block", fontSize: 15, lineHeight: 1.2 }}>HTX Nông nghiệp Cư Né</strong>
              <span style={{ fontSize: 12, color: "#475569" }}>Cổng truy xuất nguồn gốc nông sản</span>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href="/"
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                color: "#14372f",
                textDecoration: "none",
                border: "1px solid rgba(20, 55, 47, 0.16)",
              }}
            >
              Trang chủ HTX
            </Link>
            <Link
              href="/login"
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "#14372f",
                textDecoration: "none",
              }}
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 80px" }}>
        <section style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 40px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#dcfce7",
              color: "#166534",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.02em",
              marginBottom: 16,
            }}
          >
            <QrCode size={15} />
            XÁC THỰC NGUỒN GỐC VIETGAP & GACC
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 800,
              lineHeight: 1.2,
              margin: "0 0 14px",
              color: "#0f2922",
            }}
          >
            Tra cứu hồ sơ truy xuất nguồn gốc sầu riêng Cư Né
          </h1>
          <p style={{ fontSize: 15.5, color: "#475569", lineHeight: 1.6, margin: 0 }}>
            Nhập <strong>Mã lô thu hoạch</strong> hoặc <strong>Mã tem QR</strong> dán trên từng trái/thùng sầu riêng để kiểm tra mã số vùng trồng (PUC), kết quả kiểm nghiệm Cadimi & Vàng O, cùng nhật ký canh tác của hộ thành viên.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 26,
              display: "flex",
              gap: 10,
              background: "#ffffff",
              padding: 8,
              borderRadius: 16,
              border: "1.5px solid #cbd5e1",
              boxShadow: "0 14px 34px rgba(15, 41, 34, 0.08)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 10, paddingLeft: 12 }}>
              <Search size={20} style={{ color: "#64748b", flexShrink: 0 }} />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Nhập mã lô hoặc mã tem (VD: LOT-SR-2026-001, TEM-CN-...)"
                aria-label="Mã lô hoặc mã tem truy xuất"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: 15,
                  color: "#0f172a",
                  background: "transparent",
                  padding: "10px 4px",
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 22px",
                borderRadius: 12,
                border: "none",
                background: "#14372f",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              <span>Tra cứu ngay</span>
              <ArrowRight size={17} />
            </button>
          </form>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginBottom: 36,
          }}
        >
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "#15803d" }}>
              <ShieldCheck size={20} />
              <strong style={{ fontSize: 14.5, color: "#0f172a" }}>Kiểm định An toàn Thực phẩm</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: "#475569", lineHeight: 1.55 }}>
              Công khai kết quả xét nghiệm kim loại nặng (Cadimi), chất cấm Vàng O và dư lượng thuốc BVTV trước khi xuất vườn.
            </p>
          </div>
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "#15803d" }}>
              <Sprout size={20} />
              <strong style={{ fontSize: 14.5, color: "#0f172a" }}>Nhật ký Canh tác Minh bạch</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: "#475569", lineHeight: 1.55 }}>
              Đối chiếu trực tiếp thời gian cách ly thuốc BVTV (PHI), lịch sử bón phân và biên bản kiểm tra thực địa của cán bộ kỹ thuật.
            </p>
          </div>
          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "#15803d" }}>
              <CheckCircle2 size={20} />
              <strong style={{ fontSize: 14.5, color: "#0f172a" }}>Định danh Mã vùng trồng PUC</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: "#475569", lineHeight: 1.55 }}>
              Mỗi lô hàng gắn liền với đúng hộ thành viên, mã vùng trồng xuất khẩu và thông tin thửa đất tại xã Ea Khăl, Đắk Lắk.
            </p>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: 18,
            border: "1px solid #e2e8f0",
            padding: 24,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f2922" }}>
                Lô thu hoạch & Tem QR đã phát hành gần đây
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#64748b" }}>
                Nhấn vào bất kỳ mã lô hoặc mã tem bên dưới để xem hồ sơ chứng nhận truy xuất mẫu.
              </p>
            </div>
          </div>

          {loading ? (
            <p style={{ color: "#64748b", fontSize: 14, padding: "12px 0" }}>Đang tải danh sách lô hàng xác thực…</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {(samples?.lots ?? []).map((lot) => (
                <Link
                  key={lot.code}
                  href={`/trace/${encodeURIComponent(lot.code)}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#166534",
                        background: "#dcfce7",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {lot.code}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                      {Number(lot.weightKg).toLocaleString("vi-VN")} kg
                    </span>
                  </div>
                  <strong style={{ fontSize: 14.5, color: "#0f172a" }}>
                    {lot.buyer || "HTX Nông nghiệp Cư Né"}
                  </strong>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "#475569" }}>
                    <span>Thị trường: {lot.market || "Xuất khẩu chính ngạch"}</span>
                    <span style={{ color: "#15803d", fontWeight: 600 }}>Xem chứng nhận →</span>
                  </div>
                </Link>
              ))}

              {(samples?.stamps ?? []).slice(0, 4).map((stamp) => (
                <Link
                  key={stamp.code}
                  href={`/trace/${encodeURIComponent(stamp.code)}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "1px dashed #cbd5e1",
                    background: "#ffffff",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: 13.5,
                        color: "#1e40af",
                        background: "#dbeafe",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      Tem: {stamp.code}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {stamp.lotCode ? `Thửa: ${stamp.lotCode}` : "Tem quả QR"}
                    </span>
                  </div>
                  <strong style={{ fontSize: 14, color: "#0f172a" }}>
                    Hộ canh tác: {stamp.householdName}
                  </strong>
                  <span style={{ fontSize: 12.5, color: "#1d4ed8", fontWeight: 600 }}>
                    Kiểm tra tem QR →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
