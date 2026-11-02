"use client";

import { Modal } from "@/components/ui/Modal";
import { formatVnDate, NEWS_CATEGORY_META } from "@/lib/news-store";
import type { NewsRecord } from "@/types/news";

export default function NewsPreviewModal({
  article,
  onClose,
  onEdit,
}: {
  article: NewsRecord;
  onClose: () => void;
  onEdit: (article: NewsRecord) => void;
}) {
  const catMeta = NEWS_CATEGORY_META[article.category] ?? NEWS_CATEGORY_META.visit;
  const imgSrc = article.imageUrl || "/landing/news-field-visit.jpg";
  const content = article.content ?? { lead: article.excerpt, sections: [] };

  return (
    <Modal
      title="Xem trước bài viết"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng xem trước
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onEdit(article);
            }}
          >
            Chỉnh sửa bài này
          </button>
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span className={`badge ${catMeta.badge}`}>{catMeta.label}</span>
        <span className={`badge ${article.status === "published" ? "badge-green" : "badge-gold"}`}>
          {article.status === "published" ? "Đã xuất bản" : "Bản nháp"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {formatVnDate(article.publishedOn)} · {article.readTime || "4 phút đọc"}
        </span>
      </div>

      <h2 style={{ fontSize: 21, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3, marginBottom: 8 }}>
        {article.title}
      </h2>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 14 }}>
        Tác giả: <strong>{article.author}</strong> · Slug: <code>{article.slug}</code>
      </div>

      <div style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", marginBottom: 16, border: "1px solid var(--border)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={article.imageAlt || article.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink)" }}>
        <p style={{ fontWeight: 600, fontSize: 15.5, marginBottom: 14 }}>{content.lead || article.excerpt}</p>

        {(content.sections ?? []).map((sec, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--green-700)", margin: "14px 0 6px" }}>{sec.heading}</h3>
            {(sec.paragraphs ?? []).map((p, pIdx) => (
              <p key={pIdx} style={{ margin: "0 0 8px" }}>
                {p}
              </p>
            ))}
            {sec.bulletPoints && sec.bulletPoints.length > 0 && (
              <ul style={{ paddingLeft: 18, margin: "6px 0 12px" }}>
                {sec.bulletPoints.map((bp, bpIdx) => (
                  <li key={bpIdx} style={{ marginBottom: 3 }}>
                    {bp}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {content.takeaway && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(234, 179, 8, 0.12)",
              borderLeft: "4px solid #eab308",
              marginTop: 14,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#854d0e", letterSpacing: "0.06em", marginBottom: 4 }}>
              KHUYẾN CÁO NHÀ NÔNG
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#713f12" }}>{content.takeaway}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
