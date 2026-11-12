"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { STAGES } from "./data";
import { usePublic, type PublicCatalog, type PublicPesticide } from "./use-public";

type GuidanceTab = "allowed" | "banned" | "advisory" | "varieties";

const STATUS_LABEL: Record<PublicPesticide["status"], string> = {
  allowed: "Được phép",
  restricted: "Hạn chế",
  banned: "Cấm sử dụng",
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("vi-VN");
};

export default function Catalog() {
  const { data, loading, error } = usePublic<PublicCatalog>("catalog");
  const [tab, setTab] = useState<GuidanceTab>("allowed");
  const [query, setQuery] = useState("");
  const tabbarRef = useRef<HTMLDivElement | null>(null);

  const handleSelectTab = (nextTab: GuidanceTab, btn: HTMLButtonElement) => {
    setTab(nextTab);
    const bar = tabbarRef.current;
    if (!bar || bar.scrollWidth <= bar.clientWidth) return;
    const targetLeft = btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  };

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === "#quy-trinh") setTab("advisory");
      else if (hash === "#tieu-chuan") setTab("banned");
    };
    syncFromHash();

    const handleSwitch = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const detail = custom.detail;
      if (detail === "pesticides" || detail === "allowed") setTab("allowed");
      else if (detail === "banned") setTab("banned");
      else if (detail === "advisory" || detail === "stages") setTab("advisory");
      else if (detail === "varieties" || detail === "training") setTab("varieties");
    };

    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("lp:catalog-tab", handleSwitch);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("lp:catalog-tab", handleSwitch);
    };
  }, []);

  const allowedPesticides = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.pesticides ?? []).filter(
      (item) =>
        item.status !== "banned" &&
        (!term || `${item.name} ${item.activeIngredient}`.toLowerCase().includes(term)),
    );
  }, [data, query]);

  const bannedPesticides = useMemo(() => {
    return (data?.pesticides ?? []).filter((item) => item.status === "banned");
  }, [data]);

  return (
    <section id="tra-cuu" className="sw-section" aria-labelledby="tracuu-title">
      {/* Điểm neo tương thích với các liên kết điều hướng nhanh */}
      <span id="quy-trinh" className="sw-anchor-alias" aria-hidden="true" />
      <span id="tieu-chuan" className="sw-anchor-alias" aria-hidden="true" />

      {/* Tiêu đề mục đặt chính giữa ô giữa đồng bộ toàn hệ thống */}
      <header className="sw-grid sw-sec-head">
        <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />

        <div className="sw-cell sw-col-2-3 sw-head-main">
          <span className="sw-sec-index">05 / Khuyến cáo</span>
          <h2 id="tracuu-title" className="sw-sec-title">
            Thuốc BVTV & Khuyến cáo
          </h2>
        </div>

        <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
      </header>

      {/* Thanh chuyển đổi chuyên mục cuộn ngang mượt mà trên di động, căn giữa trên máy tính */}
      <div ref={tabbarRef} className="sw-catalog-tabbar">
        <div
          className="sw-simple-tabs"
          role="tablist"
          aria-label="Chuyển đổi mục thuốc bảo vệ thực vật và khuyến cáo"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "allowed"}
            className={`sw-tab-pill ${tab === "allowed" ? "is-active" : ""}`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => handleSelectTab("allowed", e.currentTarget)}
          >
            Được phép
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "banned"}
            className={`sw-tab-pill ${tab === "banned" ? "is-active" : ""}`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => handleSelectTab("banned", e.currentTarget)}
          >
            Chất cấm
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "advisory"}
            className={`sw-tab-pill ${tab === "advisory" ? "is-active" : ""}`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => handleSelectTab("advisory", e.currentTarget)}
          >
            Mùa vụ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "varieties"}
            className={`sw-tab-pill ${tab === "varieties" ? "is-active" : ""}`}
            onClick={(e: MouseEvent<HTMLButtonElement>) => handleSelectTab("varieties", e.currentTarget)}
          >
            Giống cây
          </button>
        </div>
      </div>

      {/* Khung bảng đơn giản, chữ rõ ràng, thoáng mắt cho người lớn tuổi */}
      <div className="sw-grid">
        <div className="sw-cell sw-col-1-4 sw-table-cell">
          {loading && (
            <div className="sw-pad-cell">
              <SkeletonRows count={5} label="Đang tải danh mục từ hệ thống…" />
            </div>
          )}

          {!loading && error && tab !== "advisory" && (
            <div className="sw-pad-cell">
              <p className="sw-muted-sm">
                Chưa tải được dữ liệu trực tuyến.{" "}
                <button
                  type="button"
                  className="sw-action-inline"
                  onClick={() => window.location.reload()}
                >
                  Tải lại trang
                </button>
              </p>
            </div>
          )}

          {/* MỤC 1: THUỐC ĐƯỢC PHÉP & HẠN CHẾ */}
          {!loading && !error && tab === "allowed" && (
            <div>
              <div className="sw-table-toolbar">
                <div className="lp-catalog-tools sw-search-compact">
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tìm tên thuốc hoặc hoạt chất..."
                    aria-label="Tìm tên thuốc hoặc hoạt chất"
                  />
                </div>
                <span className="sw-muted-sm">
                  Lưu ý: Tuân thủ nguyên tắc 4 đúng và chờ đủ số ngày cách ly trước khi cắt trái.
                </span>
              </div>

              {allowedPesticides.length === 0 ? (
                <p className="sw-muted-sm sw-pad-cell">
                  Không tìm thấy thuốc hoặc hoạt chất phù hợp với từ khóa.
                </p>
              ) : (
                <div className="sw-table-scroll">
                  <table className="sw-table is-comfortable">
                    <thead>
                      <tr>
                        <th>Tên thuốc thương phẩm</th>
                        <th>Hoạt chất chính</th>
                        <th>Thời gian cách ly</th>
                        <th>Giới hạn MRL</th>
                        <th>Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowedPesticides.map((item) => (
                        <tr key={`${item.name}-${item.activeIngredient}`}>
                          <td data-label="Tên thuốc">
                            <strong>{item.name}</strong>
                            {item.concentration && <small>{item.concentration}</small>}
                          </td>
                          <td data-label="Hoạt chất">{item.activeIngredient}</td>
                          <td data-label="Cách ly">
                            {item.isolationDays ? (
                              <strong>{item.isolationDays} ngày</strong>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="Giới hạn MRL">{item.mrlMgKg ? `${item.mrlMgKg} mg/kg` : "—"}</td>
                          <td data-label="Tình trạng">
                            <span className={`sw-status-tag is-${item.status}`}>
                              {STATUS_LABEL[item.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MỤC 2: CHẤT CẤM TUYỆT ĐỐI & CẢNH BÁO AN TOÀN */}
          {!loading && !error && tab === "banned" && (
            <div className="sw-table-scroll">
              <table className="sw-table is-comfortable">
                <thead>
                  <tr>
                    <th>Hoạt chất / Chất kiểm soát</th>
                    <th>Tên thường gặp</th>
                    <th>Quy định bắt buộc đối với nhà vườn</th>
                    <th>Mức kiểm soát</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Chất kiểm soát">
                      <strong>Vàng O (Auramine O)</strong>
                    </td>
                    <td data-label="Tên thường gặp">Thuốc nhuộm công nghiệp tạo màu vàng</td>
                    <td data-label="Quy định">
                      Tuyệt đối không ngâm, nhúng hoặc bôi lên vỏ và cơm sầu riêng dưới mọi hình thức.
                    </td>
                    <td data-label="Mức kiểm soát">
                      <span className="sw-status-tag is-banned">Cấm tuyệt đối</span>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Chất kiểm soát">
                      <strong>Cadimi (Cd)</strong>
                    </td>
                    <td data-label="Tên thường gặp">Kim loại nặng tồn dư trong đất & phân bón</td>
                    <td data-label="Quy định">
                      Kiểm nghiệm đất định kỳ; chỉ bón phân hữu cơ và phân khoáng có nguồn gốc, hóa đơn rõ ràng.
                    </td>
                    <td data-label="Mức kiểm soát">
                      <span className="sw-status-tag is-restricted">Kiểm nghiệm bắt buộc</span>
                    </td>
                  </tr>
                  {bannedPesticides.map((item) => (
                    <tr key={`${item.name}-${item.activeIngredient}`}>
                      <td data-label="Chất kiểm soát">
                        <strong>{item.activeIngredient}</strong>
                      </td>
                      <td data-label="Tên thường gặp">{item.name}</td>
                      <td data-label="Quy định">
                        Không mua, không tồn trữ trong kho vườn, không phun ở bất kỳ giai đoạn nào của cây.
                      </td>
                      <td data-label="Mức kiểm soát">
                        <span className="sw-status-tag is-banned">Cấm sử dụng</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* MỤC 3: KHUYẾN CÁO CHĂM SÓC THEO GIAI ĐOẠN */}
          {tab === "advisory" && (
            <div className="sw-table-scroll">
              <table className="sw-table is-comfortable">
                <thead>
                  <tr>
                    <th>Giai đoạn mùa vụ</th>
                    <th>Khuyến cáo thực hiện tại vườn</th>
                    <th>Nội dung cần ghi nhật ký</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((stage, idx) => (
                    <tr key={stage.id}>
                      <td data-label="Giai đoạn">
                        <strong>
                          {String(idx + 1).padStart(2, "0")}. {stage.label}
                        </strong>
                        <small>{stage.tag}</small>
                      </td>
                      <td data-label="Khuyến cáo tại vườn">
                        {stage.items.slice(0, 2).join(" ")}
                      </td>
                      <td data-label="Ghi nhật ký">{stage.log}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* MỤC 4: GIỐNG CÂY & LỊCH TẬP HUẤN */}
          {!loading && !error && tab === "varieties" && (
            <div className="sw-table-scroll">
              <table className="sw-table is-comfortable">
                <thead>
                  <tr>
                    <th>Phân mục</th>
                    <th>Tên giống / Chuyên đề tập huấn</th>
                    <th>Thông tin chi tiết</th>
                    <th>Thời gian / Nguồn gốc</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.varieties ?? []).map((v) => (
                    <tr key={`var-${v.name}`}>
                      <td data-label="Phân mục">
                        <span className="sw-status-tag is-allowed">Giống sầu riêng</span>
                      </td>
                      <td data-label="Tên giống">
                        <strong>{v.name}</strong>
                      </td>
                      <td data-label="Thông tin chi tiết">
                        {v.description || "Giống khuyến khích canh tác tại vùng trồng HTX Cư Né."}
                        {v.weightRange ? ` Trọng lượng trái: ${v.weightRange}.` : ""}
                      </td>
                      <td data-label="Nguồn gốc">{v.harvestYears ? `Cho trái sau ${v.harvestYears}` : v.origin || "—"}</td>
                    </tr>
                  ))}
                  {(data?.training ?? []).map((t) => (
                    <tr key={`trn-${t.title}-${t.heldOn}`}>
                      <td data-label="Phân mục">
                        <span className="sw-status-tag is-restricted">Lịch tập huấn</span>
                      </td>
                      <td data-label="Chuyên đề">
                        <strong>{t.title}</strong>
                      </td>
                      <td data-label="Thông tin chi tiết">
                        {t.location ? `Địa điểm: ${t.location}. ` : ""}
                        {t.trainer ? `Hướng dẫn: ${t.trainer}.` : ""}
                      </td>
                      <td data-label="Thời gian">
                        <strong>{formatDate(t.heldOn)}</strong>
                        <small>
                          Đăng ký: {t.enrolled}/{t.capacity} hộ
                        </small>
                      </td>
                    </tr>
                  ))}
                  {(data?.varieties.length ?? 0) === 0 && (data?.training.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={4}>Hiện chưa có dữ liệu giống cây hoặc lịch tập huấn mới.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
