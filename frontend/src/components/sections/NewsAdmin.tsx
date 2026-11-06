"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/catalog/use-debounced";
import NewsFormModal from "@/components/admin/news/NewsFormModal";
import NewsPreviewModal from "@/components/admin/news/NewsPreviewModal";
import { NEWS_CATEGORIES } from "@/components/landing/news-data";
import { toast } from "@/components/ui/Toast";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { formatVnDate, NEWS_CATEGORY_META } from "@/lib/news-store";
import type { NewsRecord } from "@/types/news";

export default function NewsAdmin() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const debouncedSearch = useDebounced(search);

  const newsList = useApiList<NewsRecord>("news", {
    q: debouncedSearch,
    category: selectedCat,
    status: selectedStatus,
  });

  const [editingArticle, setEditingArticle] = useState<NewsRecord | "new" | null>(null);
  const [previewArticle, setPreviewArticle] = useState<NewsRecord | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsRecord | null>(null);

  const togglePublish = useMutation(async (article: NewsRecord) => {
    const action = article.status === "published" ? "unpublish" : "publish";
    await api.post(`/news/${article.id}/${action}`);
    return action;
  });

  const handleTogglePublish = async (article: NewsRecord) => {
    const res = await togglePublish.run(article);
    if (res) {
      toast.success(res === "publish" ? "Đã xuất bản bài viết lên trang chủ." : "Đã gỡ bài viết về bản nháp.");
      void newsList.refresh();
    } else if (togglePublish.error) {
      toast.error(togglePublish.error);
    }
  };

  const publishedCount = newsList.rows.filter((a) => a.status === "published").length;
  const draftCount = newsList.rows.filter((a) => a.status === "draft").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bản Tin &amp; Khuyến Nông</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditingArticle("new")}>
            Đăng tin mới
          </button>
        </div>
      </div>

      {/* KPI thống kê thực tế */}
      <div className="kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">{newsList.total}</div>
            <div className="kpi-meta">
              <div className="kpi-label">Tổng số bài viết</div>
              <div className="kpi-trend up">Trong hệ thống</div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">{publishedCount}</div>
            <div className="kpi-meta">
              <div className="kpi-label">Đã xuất bản</div>
              <div className="kpi-trend up">Hiển thị trang chủ</div>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-head">
            <div className="kpi-val">{draftCount}</div>
            <div className="kpi-meta">
              <div className="kpi-label">Bản nháp</div>
              <div className="kpi-trend">Chờ duyệt đăng</div>
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
      </div>

      {/* Bộ lọc & Danh sách bài viết */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 20 }}>
        <div className="filter-bar" style={{ padding: "14px 18px", marginBottom: 0, borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              type="text"
              className="filter-input"
              placeholder="Tìm kiếm bài viết theo tiêu đề, tác giả, tóm tắt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="filter-select" value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)}>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id === "all" ? "" : c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="filter-select" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
          </select>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Hiển thị <strong>{newsList.rows.length}</strong> bài viết
          </span>
        </div>

        <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Hình ảnh</th>
                <th>Tiêu đề &amp; Tóm tắt</th>
                <th style={{ width: 165 }}>Chuyên mục</th>
                <th style={{ width: 120 }}>Ngày đăng</th>
                <th style={{ width: 150 }}>Tác giả</th>
                <th style={{ width: 120 }}>Trạng thái</th>
                <th style={{ width: 220, textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow
                colSpan={7}
                loading={newsList.loading}
                error={newsList.error}
                empty={newsList.rows.length === 0}
                emptyText="Không tìm thấy bài viết nào phù hợp."
                onRetry={newsList.refresh}
              />
              {newsList.rows.map((article) => {
                const catMeta = NEWS_CATEGORY_META[article.category] ?? NEWS_CATEGORY_META.visit;
                const imgSrc = article.imageUrl || "/landing/news-field-visit.jpg";
                const isPublished = article.status === "published";

                return (
                  <tr key={article.id}>
                    <td>
                      <div
                        style={{
                          width: 68,
                          height: 48,
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "1px solid var(--border)",
                          background: "#f4f6f3",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgSrc}
                          alt={article.imageAlt || article.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14, marginBottom: 3 }}>
                        {article.featured && (
                          <span className="badge badge-gold" style={{ marginRight: 6, fontSize: 10 }}>
                            Tiêu điểm
                          </span>
                        )}
                        {article.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--text-muted)",
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {article.excerpt}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${catMeta.badge}`}>{catMeta.label}</span>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {formatVnDate(article.publishedOn)}
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{article.readTime || "4 phút đọc"}</div>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{article.author}</td>
                    <td>
                      <span className={`badge ${isPublished ? "badge-green" : "badge-gold"}`}>
                        {isPublished ? "Đã xuất bản" : "Bản nháp"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${isPublished ? "btn-outline" : "btn-primary"}`}
                          disabled={togglePublish.pending}
                          onClick={() => void handleTogglePublish(article)}
                        >
                          {isPublished ? "Gỡ đăng" : "Xuất bản"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setPreviewArticle(article)}
                        >
                          Xem
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingArticle(article)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingArticle(article)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingArticle && (
        <NewsFormModal
          initial={editingArticle === "new" ? null : editingArticle}
          onClose={() => setEditingArticle(null)}
          onSaved={() => {
            setEditingArticle(null);
            void newsList.refresh();
          }}
        />
      )}

      {previewArticle && (
        <NewsPreviewModal
          article={previewArticle}
          onClose={() => setPreviewArticle(null)}
          onEdit={(art) => setEditingArticle(art)}
        />
      )}

      {deletingArticle && (
        <ConfirmAction
          title="Xóa bài viết"
          message={
            <>
              Bạn có chắc chắn muốn xóa bài viết <strong>{deletingArticle.title}</strong>?
            </>
          }
          path={`/news/${deletingArticle.id}`}
          successMessage="Đã xóa bài viết."
          onClose={() => setDeletingArticle(null)}
          onDone={() => {
            setDeletingArticle(null);
            void newsList.refresh();
          }}
        />
      )}
    </>
  );
}
