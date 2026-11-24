import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/gioi-thieu",
          "/trace",
          "/favicon.ico",
          "/icon.png",
          "/icon-48.png",
          "/icon-192.png",
          "/apple-touch-icon.png",
          "/newlogo.png",
          "/manifest.webmanifest",
          "/landing/",
        ],
        disallow: [
          "/admin",
          "/portal",
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/t/",
          "/trace/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

