"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import ImageUploadField from "@/components/admin/catalog/ImageUploadField";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { NEWS_CATEGORY_META } from "@/lib/news-store";
import type { NewsCategory, NewsInput, NewsRecord } from "@/types/news";

const DEFAULT_SAMPLE_IMAGES = [
  { label: "Lãnh đạo thăm vườn", src: "/landing/news-field-visit.jpg" },
  { label: "Tập huấn thực địa", src: "/landing/news-training.jpg" },
  { label: "Thuốc & Sâu bệnh", src: "/landing/news-protection.jpg" },
  { label: "Hoa sầu riêng nở", src: "/landing/durian-flower.jpg" },
  { label: "Cơm vàng sầu riêng", src: "/landing/durian-open.jpg" },
  { label: "Đồi sầu riêng Krông Búk", src: "/landing/durian-landscape-real.jpg" },
];

export function slugifyVietnamese(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface SectionDraft {
  heading: string;
  contentText: string;
  bulletsText: string;
}

export default function NewsFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: NewsRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [category, setCategory] = useState<NewsCategory>(initial?.category ?? "visit");
  const [author, setAuthor] = useState(initial?.author ?? "Ban Kỹ thuật & Truyền thông HTX");
  const [readTime, setReadTime] = useState(initial?.readTime ?? "4 phút đọc");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [lead, setLead] = useState(initial?.content?.lead ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? "/landing/news-field-visit.jpg");
  const [imageAlt, setImageAlt] = useState(initial?.imageAlt ?? "Hoạt động vườn sầu riêng Krông Búk");
  const [takeaway, setTakeaway] = useState(initial?.content?.takeaway ?? "");
  const [featured, setFeatured] = useState(Boolean(initial?.featured));
  const [publishNow, setPublishNow] = useState(initial ? initial.status === "published" : true);
  const [sections, setSections] = useState<SectionDraft[]>(() => {
    const rawSections = initial?.content?.sections;
    if (Array.isArray(rawSections) && rawSections.length > 0) {
      return rawSections.map((s) => ({
        heading: s.heading ?? "",
        contentText: (s.paragraphs ?? []).join("\n\n"),
        bulletsText: (s.bulletPoints ?? []).join("\n"),
      }));
    }
    return [{ heading: "Nội dung chi tiết", contentText: "", bulletsText: "" }];
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      setSlug(slugifyVietnamese(val));
    }
  };

  const handleAddSection = () => {
    setSections((prev) => [...prev, { heading: "", contentText: "", bulletsText: "" }]);
  };

  const handleRemoveSection = (idx: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const { run, pending, error } = useMutation(async () => {
    const finalSlug = slug.trim() || slugifyVietnamese(title) || `ban-tin-${Date.now()}`;
    const payload: NewsInput = {
      slug: finalSlug,
      category,
      title: title.trim(),
      excerpt: excerpt.trim(),
      author: author.trim() || "Ban Kỹ thuật & Truyền thông HTX",
      readTime: readTime.trim() || "4 phút đọc",
      imageUrl: imageUrl || "/landing/news-field-visit.jpg",
      imageAlt: imageAlt.trim() || title.trim(),
      featured,
      content: {
        lead: lead.trim() || excerpt.trim(),
        sections: sections.map((s) => ({
          heading: s.heading.trim() || "Nội dung kỹ thuật",
          paragraphs: s.contentText
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean),
          bulletPoints: s.bulletsText
            .split("\n")
            .map((b) => b.trim())
            .filter(Boolean),
        })),
        takeaway: takeaway.trim() || undefined,
      },
    };

    const saved = initial
      ? await api.patch<NewsRecord>(`/news/${initial.id}`, payload)
      : await api.post<NewsRecord>("/news", payload);

    const recordId = saved?.id ?? initial?.id;
    if (recordId) {
      const currentStatus = saved?.status ?? initial?.status ?? "draft";
      if (publishNow && currentStatus !== "published") {
        await api.post(`/news/${recordId}/publish`);
      } else if (!publishNow && currentStatus === "published") {
        await api.post(`/news/${recordId}/unpublish`);
      }
    }
    return saved ?? true;
  });

  const submit = async () => {
    if (!title.trim()) return setLocalError("Vui lòng nhập tiêu đề bài viết.");
    if (!excerpt.trim()) return setLocalError("Vui lòng nhập tóm tắt ngắn cho bài viết.");
    const finalSlug = slug.trim() || slugifyVietnamese(title);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalSlug)) {
      return setLocalError("Đường dẫn (slug) chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật bài viết." : "Đã tạo bài viết mới.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? "Chỉnh sửa bài viết" : "Đăng bài viết mới cho bà con"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      submitLabel={publishNow ? "Lưu & Xuất bản" : "Lưu bản nháp"}
      width={780}
    >
      <FormGrid>
        <TextField
          label="Tiêu đề bài viết"
          required
          value={title}
          onChange={handleTitleChange}
          maxLength={250}
          placeholder="VD: Cảnh báo nấm bệnh mùa mưa & danh mục thuốc sinh học..."
        />
        <TextField
          label="Đường dẫn tĩnh (slug)"
          required
          value={slug}
          onChange={(v) => {
            setSlugTouched(true);
            setSlug(v);
          }}
          maxLength={120}
          placeholder="VD: canh-bao-nam-benh-mua-mua"
        />
        <SelectField
          label="Chuyên mục"
          required
          value={category}
          onChange={(v) => setCategory(v as NewsCategory)}
          options={(Object.entries(NEWS_CATEGORY_META) as [NewsCategory, { label: string }][]).map(([value, info]) => ({
            value,
            label: info.label,
          }))}
        />
        <TextField label="Tác giả / Nguồn phát hành" value={author} onChange={setAuthor} maxLength={120} />
        <TextField label="Thời gian đọc dự kiến" value={readTime} onChange={setReadTime} maxLength={40} placeholder="VD: 4 phút đọc" />
        <TextField label="Chú thích ảnh (Alt / Caption)" value={imageAlt} onChange={setImageAlt} maxLength={200} />
      </FormGrid>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "4px 0 8px" }}>
        <CheckboxField label="Đánh dấu là bài tiêu điểm (Featured)" checked={featured} onChange={setFeatured} />
        <CheckboxField label="Xuất bản hiển thị ngay trên trang chủ" checked={publishNow} onChange={setPublishNow} />
      </div>

      <ImageUploadField
        label="Hình ảnh đại diện bài viết"
        value={imageUrl}
        onChange={(url, file) => {
          setImageUrl(url);
          if (file && !imageAlt.trim()) {
            setImageAlt(file.name.replace(/\.[^/.]+$/, ""));
          }
        }}
        purpose="news"
        presets={DEFAULT_SAMPLE_IMAGES}
      />

      <TextAreaField
        label="Tóm tắt ngắn (Hiển thị trên thẻ bài báo ngoài trang chủ)"
        required
        value={excerpt}
        onChange={setExcerpt}
        rows={2}
        maxLength={600}
      />

      <TextAreaField
        label="Lời dẫn mở đầu bài viết (Lead paragraph)"
        value={lead}
        onChange={setLead}
        rows={2}
        maxLength={1000}
      />

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5 }}>Nội dung chi tiết từng phân đoạn</strong>
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
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green-700)" }}>Phần {idx + 1}</span>
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
            <TextField
              label="Tiêu đề mục"
              value={sec.heading}
              onChange={(val) => setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, heading: val } : s)))}
              placeholder="VD: Hướng dẫn kỹ thuật tỉa chồi vượt..."
            />
            <TextAreaField
              label="Nội dung diễn giải (các đoạn văn cách nhau 1 dòng trống)"
              value={sec.contentText}
              onChange={(val) => setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, contentText: val } : s)))}
              rows={3}
            />
            <TextAreaField
              label="Các gạch đầu dòng kỹ thuật (mỗi dòng 1 ý)"
              value={sec.bulletsText}
              onChange={(val) => setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, bulletsText: val } : s)))}
              rows={2}
            />
          </div>
        ))}
      </div>

      <TextAreaField
        label="Khuyến cáo nhà nông (Khung vàng nhấn mạnh cuối bài)"
        value={takeaway}
        onChange={setTakeaway}
        rows={2}
        maxLength={600}
      />
    </FormModal>
  );
}
