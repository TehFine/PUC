"use client";

import { useMemo, useState, useRef } from "react";
import Image from "next/image";
import { useNewsArticles } from "@/lib/news-store";
import { NEWS_CATEGORIES, type NewsArticle } from "@/components/landing/news-data";

const DEFAULT_SAMPLE_IMAGES = [
  { label: "Lãnh đạo thăm vườn", src: "/landing/news-field-visit.jpg" },
  { label: "Tập huấn thực địa", src: "/landing/news-training.jpg" },
  { label: "Thuốc & Sâu bệnh", src: "/landing/news-protection.jpg" },
  { label: "Hoa sầu riêng nở", src: "/landing/durian-flower.jpg" },
  { label: "Cơm vàng sầu riêng", src: "/landing/durian-open.jpg" },
  { label: "Đồi sầu riêng Krông Búk", src: "/landing/durian-landscape-real.jpg" },
];

export default function NewsAdmin() {
  const { articles, upsertArticle, deleteArticle, resetDefaults } = useNewsArticles();
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);

  // Trạng thái modal soạn thảo (tạo mới hoặc chỉnh sửa)
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Trạng thái modal xem trước
  const [previewArticle, setPreviewArticle] = useState<NewsArticle | null>(null);

  // Trạng thái form soạn thảo
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<NewsArticle["category"]>("visit");
  const [formAuthor, setFormAuthor] = useState("Ban Kỹ thuật & Truyền thông HTX");
  const [formReadTime, setFormReadTime] = useState("4 phút đọc");
  const [formExcerpt, setFormExcerpt] = useState("");
  const [formLead, setFormLead] = useState("");
  const [formImage, setFormImage] = useState<string>("/landing/news-field-visit.jpg");
  const [formImageAlt, setFormImageAlt] = useState("");
  const [formTakeaway, setFormTakeaway] = useState("");

  // Các phân đoạn nội dung
  const [sections, setSections] = useState<{ heading: string; contentText: string; bulletsText: string }[]>([
    { heading: "Thông tin chi tiết", contentText: "", bulletsText: "" },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mở form tạo mới
  const handleOpenCreate = () => {
    setIsCreating(true);
    setEditingArticle(null);
    setFormTitle("");
    setFormCategory("visit");
    setFormAuthor("Ban Kỹ thuật & Truyền thông HTX");
    setFormReadTime("4 phút đọc");
    setFormExcerpt("");
    setFormLead("");
    setFormImage("/landing/news-field-visit.jpg");
    setFormImageAlt("Hoạt động vườn sầu riêng Krông Búk");
    setFormTakeaway("");
    setSections([{ heading: "Nội dung chi tiết", contentText: "", bulletsText: "" }]);
  };

  // Mở form chỉnh sửa
  const handleOpenEdit = (article: NewsArticle) => {
    setIsCreating(false);
    setEditingArticle(article);
    setFormTitle(article.title);
    setFormCategory(article.category);
    setFormAuthor(article.author);
    setFormReadTime(article.readTime);
    setFormExcerpt(article.excerpt);
    setFormLead(article.content.lead);
    setFormImage(article.image);
    setFormImageAlt(article.imageAlt);
    setFormTakeaway(article.content.takeaway ?? "");
    setSections(
      article.content.sections.map((s) => ({
        heading: s.heading,
        contentText: s.paragraphs.join("\n\n"),
        bulletsText: (s.bulletPoints ?? []).join("\n"),
      }))
    );
  };

  // Đóng form soạn thảo
  const handleCloseForm = () => {
    setIsCreating(false);
    setEditingArticle(null);
  };

  // Xử lý tải ảnh từ máy tính (FileReader Base64)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Kích thước tệp quá lớn. Vui lòng chọn ảnh dưới 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setFormImage(result);
        if (!formImageAlt) {
          setFormImageAlt(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Thêm phân đoạn nội dung
  const handleAddSection = () => {
    setSections((prev) => [...prev, { heading: "", contentText: "", bulletsText: "" }]);
  };

  // Xóa phân đoạn nội dung
  const handleRemoveSection = (index: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  // Lưu bài viết
  const handleSave = () => {
    if (!formTitle.trim()) {
      alert("Vui lòng nhập tiêu đề bài viết.");
      return;
    }
    if (!formExcerpt.trim()) {
      alert("Vui lòng nhập tóm tắt ngắn cho bài viết.");
      return;
    }

    const categoryMap: Record<NewsArticle["category"], { label: string; tone: NewsArticle["tagTone"] }> = {
      visit: { label: "Lãnh đạo & Thăm vườn", tone: "blue" },
      training: { label: "Tập huấn nhà nông", tone: "green" },
      protection: { label: "Thuốc & Sâu bệnh", tone: "yellow" },
      farming: { label: "Quy trình chăm bón", tone: "peach" },
    };

    const catInfo = categoryMap[formCategory];
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const newArticle: NewsArticle = {
      id: editingArticle ? editingArticle.id : `tin-${Date.now()}`,
      title: formTitle.trim(),
      category: formCategory,
      categoryLabel: catInfo.label,
      tagTone: catInfo.tone,
      excerpt: formExcerpt.trim(),
      date: editingArticle ? editingArticle.date : formattedDate,
      readTime: formReadTime.trim() || "3 phút đọc",
      author: formAuthor.trim() || "Ban Kỹ thuật & Truyền thông HTX",
      image: formImage || "/landing/news-field-visit.jpg",
      imageAlt: formImageAlt.trim() || formTitle.trim(),
      content: {
        lead: formLead.trim() || formExcerpt.trim(),
        sections: sections.map((s) => ({
          heading: s.heading.trim() || "Nội dung kỹ thuật",
          paragraphs: s.contentText
            .split("\n\n")
            .map((p) => p.trim())
            .filter(Boolean),
          bulletPoints: s.bulletsText
            .split("\n")
            .map((b) => b.trim())
            .filter(Boolean),
        })),
        takeaway: formTakeaway.trim() || undefined,
      },
    };

    upsertArticle(newArticle);
    setNotice(editingArticle ? "Đã cập nhật bài viết thành công." : "Đã đăng bài viết mới thành công lên Cổng thông tin.");
    handleCloseForm();
    setTimeout(() => setNotice(null), 5000);
  };

  // Xóa bài viết
  const handleDelete = (id: string, title: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa bài viết "${title}"?`)) {
      deleteArticle(id);
      setNotice("Đã xóa bài viết thành công.");
      setTimeout(() => setNotice(null), 4000);
    }
  };

  // Khôi phục bài viết mẫu
  const handleReset = () => {
    if (confirm("Khôi phục danh sách tin tức về các bài viết mẫu chuẩn ban đầu?")) {
      resetDefaults();
      setNotice("Đã khôi phục các bài viết mẫu chuẩn thành công.");
      setTimeout(() => setNotice(null), 4000);
    }
  };

  // Lọc bài viết
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchCat = selectedCat === "all" || a.category === selectedCat;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        a.title.toLowerCase().includes(term) ||
        a.author.toLowerCase().includes(term) ||
        a.excerpt.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [articles, selectedCat, search]);

  return (
    <>
      <style>{`
        /* News Admin Scoped Responsive Styles */
        .news-header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        @media (max-width: 640px) {
          .news-header-actions {
            width: 100%;
            margin-left: 0;
            display: flex;
            gap: 8px;
          }
          .news-header-actions .btn {
            flex: 1 1 0;
            min-height: 42px;
            font-size: 13.5px;
            justify-content: center;
          }
        }

        /* Filter bar */
        .news-filter-wrap {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .news-filter-inputs {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 260px;
        }
        .news-filter-search {
          max-width: 360px;
          width: 100%;
        }
        .news-filter-select {
          max-width: 220px;
          width: 100%;
        }
        .news-filter-count {
          font-size: 13px;
          color: var(--text-muted);
        }
        @media (max-width: 768px) {
          .news-filter-wrap {
            padding: 12px 14px;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .news-filter-inputs {
            flex-direction: column;
            width: 100%;
            min-width: 0;
            gap: 8px;
          }
          .news-filter-search,
          .news-filter-select {
            max-width: 100%;
            width: 100%;
            min-height: 40px;
            font-size: 14px;
          }
          .news-filter-count {
            font-size: 12px;
            text-align: right;
          }
        }

        /* Desktop Table vs Mobile Cards List */
        .news-desktop-table {
          display: block;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .news-desktop-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .news-desktop-table thead th {
          border-radius: 0 !important;
        }
        .news-mobile-list {
          display: none;
        }
        @media (max-width: 768px) {
          .news-desktop-table {
            display: none !important;
          }
          .news-mobile-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 14px;
          }
        }

        .news-mob-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .news-mob-card-head {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .news-mob-thumb {
          position: relative;
          width: 84px;
          height: 64px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          flex-shrink: 0;
        }
        .news-mob-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .news-mob-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .news-mob-date {
          font-size: 11.5px;
          color: var(--text-muted);
        }
        .news-mob-title {
          font-size: 14.5px;
          font-weight: 600;
          line-height: 1.32;
          color: var(--ink);
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .news-mob-excerpt {
          font-size: 12.5px;
          color: var(--text-muted);
          line-height: 1.45;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .news-mob-author {
          font-size: 12px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .news-mob-actions {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          padding-top: 8px;
          border-top: 1px dashed var(--border);
        }
        .news-mob-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 38px;
          padding: 0 8px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 999px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--ink);
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .news-mob-btn:hover {
          background: var(--bg-hover);
        }
        .news-mob-btn.danger {
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.3);
          background: rgba(220, 38, 38, 0.04);
        }

        /* Modals */
        .modal-news {
          width: 820px;
          max-width: calc(100vw - 32px);
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        }
        .modal-news-preview {
          width: 780px;
          max-width: calc(100vw - 32px);
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        }
        .news-modal-body {
          overflow-y: auto;
          flex: 1;
          padding: 20px 26px;
        }
        @media (max-width: 768px) {
          .modal-overlay {
            align-items: flex-end !important;
            padding: 0 !important;
          }
          .modal-news,
          .modal-news-preview {
            width: 100% !important;
            max-width: 100% !important;
            max-height: 94dvh !important;
            border-radius: 24px 24px 0 0 !important;
            margin: 0 !important;
          }
          .news-modal-body {
            padding: 14px 16px !important;
          }
        }

        .news-form-grid-2 {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 14px;
        }
        .news-form-grid-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 640px) {
          .news-form-grid-2 {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .news-form-grid-meta {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }

        .news-img-uploader {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .news-img-preview-box {
          width: 140px;
          height: 95px;
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          border: 2px solid var(--border);
          background: var(--bg-input);
          flex-shrink: 0;
        }
        @media (max-width: 540px) {
          .news-img-uploader {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .news-img-preview-box {
            width: 100%;
            height: 160px;
          }
        }

        .news-sample-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .news-sample-chip {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--ink-soft);
          transition: all 0.15s ease;
        }
        .news-sample-chip:hover,
        .news-sample-chip.active {
          background: var(--ink);
          color: #fff;
          border-color: var(--ink);
        }

        .news-modal-footer {
          padding: 14px 26px 20px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: var(--bg-card);
        }
        @media (max-width: 640px) {
          .news-modal-footer {
            padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
            flex-direction: column-reverse;
            gap: 8px;
          }
          .news-modal-footer .btn {
            width: 100%;
            min-height: 44px;
            justify-content: center;
          }
        }
      `}</style>

      <div className="page-header">
        <div>
          <h1>Bản Tin &amp; Khuyến Nông</h1>
          <div className="page-header-sub">
            Quản lý, biên tập và xuất bản tin tức, kỹ thuật canh tác, lịch thăm vườn cho bà con nông dân
          </div>
        </div>
        <div className="news-header-actions">
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Khôi phục tin mẫu
          </button>
          <button type="button" className="btn btn-primary" onClick={handleOpenCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Đăng tin mới
          </button>
        </div>
      </div>

      {notice && (
        <div style={{
          padding: "12px 18px",
          background: "rgba(74, 222, 128, 0.12)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          color: "var(--green-800, #14532d)",
          borderRadius: "12px",
          fontSize: "14px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* KPI thống kê */}
      <div className="kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">{articles.length}</div>
            <div className="kpi-meta">
              <div className="kpi-label">Tổng số bài viết</div>
              <div className="kpi-trend up">Đang lưu hành</div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">4</div>
            <div className="kpi-meta">
              <div className="kpi-label">Chuyên mục tin</div>
              <div className="kpi-trend up">4 nhóm chủ đề</div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">100%</div>
            <div className="kpi-meta">
              <div className="kpi-label">Độ sẵn sàng hiển thị</div>
              <div className="kpi-trend up">Đồng bộ trang chủ</div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">1.4k+</div>
            <div className="kpi-meta">
              <div className="kpi-label">Lượt xem ước tính</div>
              <div className="kpi-trend up">Từ bà con &amp; đối tác</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bảng điều khiển bộ lọc & danh sách bài viết */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 20 }}>
        {/* Thanh tìm kiếm & bộ lọc */}
        <div className="news-filter-wrap">
          <div className="news-filter-inputs">
            <input
              type="text"
              className="form-input news-filter-search"
              placeholder="Tìm kiếm bài viết theo tiêu đề, tác giả..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-input news-filter-select"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
            >
              {NEWS_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="news-filter-count">
            Hiển thị <strong>{filteredArticles.length}</strong> bài viết
          </div>
        </div>

        {/* 1. GIAO DIỆN DESKTOP: Bảng dữ liệu quản lý chuẩn */}
        <div className="table-wrap news-desktop-table" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Hình ảnh</th>
                <th>Tiêu đề &amp; Tóm tắt</th>
                <th style={{ width: 170 }}>Chuyên mục</th>
                <th style={{ width: 120 }}>Ngày đăng</th>
                <th style={{ width: 160 }}>Tác giả</th>
                <th style={{ width: 150, textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article) => (
                <tr key={article.id}>
                  <td>
                    <div style={{ position: "relative", width: 68, height: 48, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                      <Image
                        src={article.image}
                        alt={article.imageAlt || article.title}
                        fill
                        sizes="68px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14.5, marginBottom: 4 }}>
                      {article.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {article.excerpt}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${article.tagTone === "blue" ? "blue" : article.tagTone === "green" ? "green" : article.tagTone === "yellow" ? "warn" : "plain"}`}>
                      {article.categoryLabel}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {article.date}
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{article.readTime}</div>
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {article.author}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        title="Xem trước bài viết"
                        onClick={() => setPreviewArticle(article)}
                      >
                        Xem
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        title="Chỉnh sửa bài viết"
                        onClick={() => handleOpenEdit(article)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title="Xóa bài viết"
                        onClick={() => handleDelete(article.id, article.title)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredArticles.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-muted)" }}>
                    Không tìm thấy bài viết nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 2. GIAO DIỆN MOBILE: Danh sách thẻ bài báo thân thiện ngón tay */}
        <div className="news-mobile-list">
          {filteredArticles.map((article) => (
            <div key={article.id} className="news-mob-card">
              <div className="news-mob-card-head">
                <div className="news-mob-thumb">
                  <Image
                    src={article.image}
                    alt={article.imageAlt || article.title}
                    fill
                    sizes="84px"
                    style={{ objectFit: "cover" }}
                  />
                </div>
                <div className="news-mob-info">
                  <div className="news-mob-meta">
                    <span className={`badge ${article.tagTone === "blue" ? "blue" : article.tagTone === "green" ? "green" : article.tagTone === "yellow" ? "warn" : "plain"}`}>
                      {article.categoryLabel}
                    </span>
                    <span className="news-mob-date">{article.date}</span>
                  </div>
                  <h4 className="news-mob-title">{article.title}</h4>
                </div>
              </div>

              <p className="news-mob-excerpt">{article.excerpt}</p>

              <div className="news-mob-author">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>{article.author}</span>
                <span style={{ margin: "0 2px" }}>·</span>
                <span>{article.readTime}</span>
              </div>

              <div className="news-mob-actions">
                <button
                  type="button"
                  className="news-mob-btn"
                  onClick={() => setPreviewArticle(article)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Xem
                </button>
                <button
                  type="button"
                  className="news-mob-btn"
                  onClick={() => handleOpenEdit(article)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Sửa
                </button>
                <button
                  type="button"
                  className="news-mob-btn danger"
                  onClick={() => handleDelete(article.id, article.title)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Xóa
                </button>
              </div>
            </div>
          ))}

          {filteredArticles.length === 0 && (
            <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-muted)" }}>
              Không tìm thấy bài viết nào phù hợp với điều kiện tìm kiếm.
            </div>
          )}
        </div>
      </div>

      {/* Modal Soạn thảo / Chỉnh sửa bài viết */}
      {(isCreating || editingArticle) && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div
            className="modal modal-news"
            role="dialog"
            aria-modal="true"
            aria-label="Soạn thảo tin tức"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{editingArticle ? "Chỉnh sửa bài viết" : "Đăng bài viết mới cho bà con"}</h3>
              <button type="button" aria-label="Đóng" onClick={handleCloseForm}>
                ✕
              </button>
            </div>

            <div className="news-modal-body">
              {/* Tiêu đề & Chuyên mục */}
              <div className="news-form-grid-2">
                <div className="form-group">
                  <label htmlFor="news-title">
                    Tiêu đề bài viết <span style={{ color: "red" }}>*</span>
                  </label>
                  <input
                    id="news-title"
                    className="form-input"
                    placeholder="VD: Cảnh báo nấm bệnh mùa mưa & danh mục thuốc sinh học..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="news-cat">Chuyên mục</label>
                  <select
                    id="news-cat"
                    className="form-input"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as NewsArticle["category"])}
                  >
                    <option value="visit">Lãnh đạo &amp; Thăm vườn</option>
                    <option value="training">Tập huấn nhà nông</option>
                    <option value="protection">Thuốc &amp; Sâu bệnh</option>
                    <option value="farming">Quy trình chăm bón</option>
                  </select>
                </div>
              </div>

              {/* Tác giả & Thời gian đọc */}
              <div className="news-form-grid-meta">
                <div className="form-group">
                  <label htmlFor="news-author">Tác giả / Nguồn phát hành</label>
                  <input
                    id="news-author"
                    className="form-input"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="news-readtime">Thời gian đọc dự kiến</label>
                  <input
                    id="news-readtime"
                    className="form-input"
                    placeholder="VD: 3 phút đọc, 5 phút đọc"
                    value={formReadTime}
                    onChange={(e) => setFormReadTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Tải ảnh & Chọn ảnh */}
              <div className="form-group">
                <label>Hình ảnh bài viết đại diện <span style={{ color: "red" }}>*</span></label>
                <div className="news-img-uploader">
                  {/* Xem trước ảnh */}
                  <div className="news-img-preview-box">
                    {formImage ? (
                      <Image src={formImage} alt={formImageAlt || "Xem trước"} fill style={{ objectFit: "cover" }} />
                    ) : (
                      <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 11, color: "var(--text-muted)" }}>Chưa có ảnh</div>
                    )}
                  </div>

                  {/* Nút upload & thư viện mẫu */}
                  <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleFileUpload}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ minHeight: 38 }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📁 Tải ảnh từ máy tính (JPG, PNG)
                      </button>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Hoặc chọn nhanh ảnh mẫu có sẵn:
                    </div>
                    <div className="news-sample-chips">
                      {DEFAULT_SAMPLE_IMAGES.map((img) => (
                        <button
                          key={img.src}
                          type="button"
                          className={`news-sample-chip ${formImage === img.src ? "active" : ""}`}
                          onClick={() => {
                            setFormImage(img.src);
                            setFormImageAlt(img.label);
                          }}
                        >
                          {img.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      className="form-input"
                      placeholder="Chú thích ảnh (Caption)..."
                      value={formImageAlt}
                      onChange={(e) => setFormImageAlt(e.target.value)}
                      style={{ fontSize: 12.5, marginTop: 4 }}
                    />
                  </div>
                </div>
              </div>

              {/* Tóm tắt ngắn */}
              <div className="form-group">
                <label htmlFor="news-excerpt">
                  Tóm tắt ngắn (Hiển thị trên thẻ bài báo ngoài trang chủ) <span style={{ color: "red" }}>*</span>
                </label>
                <textarea
                  id="news-excerpt"
                  className="form-input"
                  rows={2}
                  placeholder="Khoảng 1–3 câu súc tích tóm tắt nội dung chính để bà con nắm bắt nhanh..."
                  value={formExcerpt}
                  onChange={(e) => setFormExcerpt(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Lời dẫn mở đầu */}
              <div className="form-group">
                <label htmlFor="news-lead">Lời dẫn mở đầu bài viết (Lead paragraph)</label>
                <textarea
                  id="news-lead"
                  className="form-input"
                  rows={2}
                  placeholder="Đoạn văn mở đầu in đậm đặt vấn đề khi bà con nhấn vào đọc chi tiết..."
                  value={formLead}
                  onChange={(e) => setFormLead(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Các phân đoạn chi tiết */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                    Nội dung chi tiết từng phân đoạn
                  </label>
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAddSection}>
                    + Thêm phân đoạn
                  </button>
                </div>

                {sections.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-input, #f7f9f6)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: "14px 16px",
                      marginBottom: 12,
                      position: "relative"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green-700)" }}>
                        Phần {idx + 1}
                      </span>
                      {sections.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(idx)}
                          style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}
                        >
                          Xóa phần này
                        </button>
                      )}
                    </div>

                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Tiêu đề mục (VD: Hướng dẫn kỹ thuật tỉa chồi vượt...)"
                        value={sec.heading}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, heading: val } : s)));
                        }}
                        style={{ fontWeight: 600 }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder="Nội dung diễn giải chi tiết (các đoạn văn cách nhau 2 lần xuống dòng)..."
                        value={sec.contentText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, contentText: val } : s)));
                        }}
                        style={{ resize: "vertical" }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="Các gạch đầu dòng kỹ thuật quan trọng (mỗi gạch đầu dòng 1 hàng)..."
                        value={sec.bulletsText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, bulletsText: val } : s)));
                        }}
                        style={{ resize: "vertical", fontSize: 12.5 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Khuyến cáo nhà nông */}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label htmlFor="news-takeaway">Khuyến cáo nhà nông (Khung vàng nhấn mạnh cuối bài)</label>
                <textarea
                  id="news-takeaway"
                  className="form-input"
                  rows={2}
                  placeholder="VD: Không lạm dụng thuốc hóa học nhóm cấm. Chủ động báo cán bộ thôn khi phát hiện vết bệnh lan nhanh..."
                  value={formTakeaway}
                  onChange={(e) => setFormTakeaway(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>

            <div className="news-modal-footer">
              <button type="button" className="btn btn-outline" onClick={handleCloseForm}>
                Hủy bỏ
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                Lưu &amp; Xuất bản lên trang chủ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem trước bài viết */}
      {previewArticle && (
        <div className="modal-overlay" onClick={() => setPreviewArticle(null)}>
          <div
            className="modal modal-news-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Xem trước bài viết"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={`badge ${previewArticle.tagTone === "blue" ? "blue" : previewArticle.tagTone === "green" ? "green" : previewArticle.tagTone === "yellow" ? "warn" : "plain"}`}>
                  {previewArticle.categoryLabel}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {previewArticle.date} · {previewArticle.readTime}
                </span>
              </div>
              <button type="button" aria-label="Đóng" onClick={() => setPreviewArticle(null)}>
                ✕
              </button>
            </div>

            <div className="news-modal-body">
              <h2 style={{ fontFamily: "var(--font-display-stack)", fontSize: 22, fontWeight: 600, color: "var(--ink)", lineHeight: 1.28, marginBottom: 8 }}>
                {previewArticle.title}
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 14 }}>
                Tác giả: <strong>{previewArticle.author}</strong> · Phát hành nội bộ HTX Krông Búk
              </div>

              <div style={{ position: "relative", width: "100%", height: 200, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                <Image src={previewArticle.image} alt={previewArticle.imageAlt} fill style={{ objectFit: "cover" }} />
              </div>

              <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink)" }}>
                <p style={{ fontWeight: 600, fontSize: 15.5, marginBottom: 14 }}>
                  {previewArticle.content.lead}
                </p>

                {previewArticle.content.sections.map((sec, i) => (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--green-700)", margin: "14px 0 6px" }}>
                      {sec.heading}
                    </h3>
                    {sec.paragraphs.map((p, pIdx) => (
                      <p key={pIdx} style={{ margin: "0 0 8px" }}>{p}</p>
                    ))}
                    {sec.bulletPoints && sec.bulletPoints.length > 0 && (
                      <ul style={{ paddingLeft: 18, margin: "6px 0 12px" }}>
                        {sec.bulletPoints.map((bp, bpIdx) => (
                          <li key={bpIdx} style={{ marginBottom: 3 }}>{bp}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {previewArticle.content.takeaway && (
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "rgba(234, 179, 8, 0.12)",
                    borderLeft: "4px solid #eab308",
                    marginTop: 14
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#854d0e", letterSpacing: "0.06em", marginBottom: 4 }}>
                      KHUYẾN CÁO NHÀ NÔNG
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "#713f12" }}>
                      {previewArticle.content.takeaway}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="news-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setPreviewArticle(null)}>
                Đóng xem trước
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const toEdit = previewArticle;
                  setPreviewArticle(null);
                  handleOpenEdit(toEdit);
                }}
              >
                Chỉnh sửa bài này
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
