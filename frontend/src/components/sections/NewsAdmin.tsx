"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import NewsFormModal from "@/components/admin/news/NewsFormModal";
import NewsPreviewModal from "@/components/admin/news/NewsPreviewModal";
import { useAuth } from "@/components/auth/AuthProvider";
import { NEWS_CATEGORIES } from "@/components/landing/news-data";
import { toast } from "@/components/ui/Toast";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import {
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
} from "@/lib/back-navigation";
import { formatVnDate, NEWS_CATEGORY_META } from "@/lib/news-store";
import type { NewsRecord } from "@/types/news";
import { isSafeMediaUrl } from "@/utils/url-safety";

export default function NewsAdmin() {
  const { can } = useAuth();
  const canCreateNews = can("news", "create");
  const canUpdateNews = can("news", "update");
  const canDeleteNews = can("news", "delete");
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = usePersistedState<string>("admin:news:cat", "");
  const [selectedStatus, setSelectedStatus] = usePersistedState<string>("admin:news:status", "");
  const debouncedSearch = useDebounced(search);

  const newsList = useApiList<NewsRecord>("news", {
    q: debouncedSearch,
    category: selectedCat,
    status: selectedStatus,
  });

  const [editingArticle, setEditingArticle] = usePersistedEditableSelection(
    "admin:news:edit",
    newsList.rows,
    (r) => r.id,
    newsList.loading,
  );
  const [previewArticle, setPreviewArticle] = usePersistedRecordSelection(
    "admin:news:preview",
    newsList.rows,
    (r) => r.id,
    newsList.loading,
  );
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
      {canCreateNews && (
        <div className="page-header">
          <div className="header-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditingArticle("new")}>
              Đăng tin mới
            </button>
          </div>
        </div>
      )}

      {/* Thẻ tổng hợp chỉ số bài viết */}
      <section className="news-summary-card" aria-label="Thống kê bài viết">
        <div className="news-summary-row">
          <div className="news-summary-meta">
            <span className="news-summary-label">Tổng số bài viết</span>
            <span className="news-summary-sub">Trong hệ thống</span>
          </div>
          <strong className="news-summary-val">
            <span className="news-summary-num">{newsList.total}</span>
          </strong>
        </div>
        <div className="news-summary-row">
          <div className="news-summary-meta">
            <span className="news-summary-label">Đã xuất bản</span>
            <span className="news-summary-sub">Hiển thị trang chủ</span>
          </div>
          <strong className="news-summary-val">
            <span className="news-summary-num">{publishedCount}</span>
          </strong>
        </div>
        <div className="news-summary-row">
          <div className="news-summary-meta">
            <span className="news-summary-label">Bản nháp</span>
            <span className="news-summary-sub">Chờ duyệt đăng</span>
          </div>
          <strong className="news-summary-val">
            <span className="news-summary-num">{draftCount}</span>
          </strong>
        </div>
        <div className="news-summary-row">
          <div className="news-summary-meta">
            <span className="news-summary-label">Chuyên mục tin</span>
            <span className="news-summary-sub">4 nhóm chủ đề</span>
          </div>
          <strong className="news-summary-val">
            <span className="news-summary-num">4</span>
          </strong>
        </div>
      </section>

      {/* Bộ lọc & Danh sách bài viết */}
      <div className="filter-bar" style={{ marginTop: 16 }}>
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
        <span className="filter-bar-count">
          Hiển thị <strong>{newsList.rows.length}</strong> bài viết
        </span>
      </div>

      <div className="table-wrap">
        <table className="news-admin-table">
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
              const imgSrc = isSafeMediaUrl(article.imageUrl) ? article.imageUrl : "/landing/news-field-visit.jpg";
              const isPublished = article.status === "published";

              return (
                <tr key={article.id}>
                  <td className="news-admin-thumb-cell">
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
                  <td className="news-admin-main-cell">
                    <div className="news-admin-main-wrap">
                      <div className="news-admin-mobile-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc} alt={article.imageAlt || article.title} />
                      </div>
                      <div className="news-admin-main-text">
                        <div className="news-admin-title-line">
                          {article.featured && (
                            <span className="badge badge-gold news-admin-featured-badge">
                              Tiêu điểm
                            </span>
                          )}
                          <span className="news-admin-title">{article.title}</span>
                        </div>
                        <div className="news-admin-excerpt">{article.excerpt}</div>
                      </div>
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
                        {canUpdateNews && (
                          <button
                            type="button"
                            className={`btn btn-sm ${isPublished ? "btn-outline" : "btn-primary"}`}
                            disabled={togglePublish.pending}
                            onClick={() => void handleTogglePublish(article)}
                          >
                            {isPublished ? "Gỡ đăng" : "Xuất bản"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setPreviewArticle(article)}
                        >
                          Xem
                        </button>
                        {canUpdateNews && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setEditingArticle(article)}
                          >
                            Sửa
                          </button>
                        )}
                        {canDeleteNews && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingArticle(article)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
