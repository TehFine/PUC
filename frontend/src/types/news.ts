// Kiểu dữ liệu thô (DTO) cho bản tin: CRUD /api/news (quản trị) và /api/public/news (trang chủ).

export type NewsCategory = "visit" | "training" | "protection" | "farming";
export type NewsStatus = "draft" | "published";

export interface NewsContentSection {
  heading: string;
  paragraphs: string[];
  bulletPoints?: string[];
}

export interface NewsContent {
  lead: string;
  sections: NewsContentSection[];
  takeaway?: string;
}

/** Bài viết công khai (GET /public/news). */
export interface PublicNewsRecord {
  slug: string;
  category: NewsCategory;
  title: string;
  excerpt: string;
  content: NewsContent;
  author: string;
  imageUrl: string | null;
  imageAlt: string | null;
  readTime: string | null;
  featured: boolean;
  publishedOn: string | null;
}

/** Bài viết trong khu quản trị (GET /news). */
export interface NewsRecord extends PublicNewsRecord {
  id: number;
  status: NewsStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** Thân yêu cầu POST/PATCH /news. */
export interface NewsInput {
  slug: string;
  category: NewsCategory;
  title: string;
  excerpt: string;
  content: NewsContent;
  author: string;
  imageUrl: string | null;
  imageAlt: string | null;
  readTime: string | null;
  featured: boolean;
}
