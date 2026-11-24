import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        `${SITE_URL}/landing/real-hero-cune.jpg`,
        `${SITE_URL}/landing/cune-orchard-village.jpg`,
        `${SITE_URL}/newlogo.png`,
      ],
    },
    {
      url: `${SITE_URL}/trace`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];
}

