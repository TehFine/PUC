/**
 * Cấu hình SEO tập trung, định danh thương hiệu và dữ liệu có cấu trúc (Schema.org JSON-LD)
 * cho Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né / HTX Cune) tại Krông Búk, Đắk Lắk.
 */

import { FAQ } from "@/components/landing/data";

function normalizeSiteUrl(raw?: string): string {
  const fallback = "https://htxcune.com";
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const COOP_BRAND = {
  shortName: "HTX Cư Né",
  legalName: "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né",
  abbreviatedLegalName: "Hợp tác xã KDTH Cư Né",
  registrationCode: "4007E00008",
  foundingDate: "2004-10-27",
  telephone: "+84982576648",
  streetAddress: "Km 67, Thôn Ea Plai",
  district: "Xã Krông Búk",
  province: "Tỉnh Đắk Lắk",
  country: "VN",
  alternateNames: [
    "HTX Cư Né",
    "HTX Cune",
    "Hợp tác xã Cư Né",
    "Hop tac xa Cu Ne",
    "HTX Nông nghiệp Cư Né",
    "Hợp tác xã KDTH Cư Né",
    "Sầu riêng Cư Né",
    "Sầu riêng Krông Búk",
    "Vùng trồng sầu riêng Cư Né Krông Búk",
  ],
} as const;

export const CORE_SEO_KEYWORDS: string[] = [
  "sầu riêng Cư Né",
  "sau rieng cu ne",
  "Hợp tác xã Cư Né",
  "hop tac xa cu ne",
  "HTX Cư Né",
  "htx cune",
  "Hợp tác xã Kinh doanh Dịch vụ Tổng hợp Cư Né",
  "sầu riêng Krông Búk",
  "sau rieng krong buk",
  "sầu riêng krongbuk",
  "sầu riêng Đắk Lắk",
  "mã vùng trồng sầu riêng Cư Né",
  "mã số vùng trồng Krông Búk",
  "truy xuất nguồn gốc sầu riêng Cư Né",
  "sầu riêng xuất khẩu chính ngạch GACC",
  "sầu riêng VietGAP Krông Búk Đắk Lắk",
  "nhật ký canh tác sầu riêng điện tử",
];

/**
 * Xây dựng đồ thị Schema.org (`@graph`) chuẩn Google Search Central:
 * 1. `WebSite` (tên trang hiển thị cạnh favicon trên kết quả tìm kiếm + ô tìm kiếm mã truy xuất)
 * 2. `Organization` & `LocalBusiness` (pháp nhân HTX Cư Né 4007E00008, logo chính thức, địa chỉ Krông Búk - Đắk Lắk)
 * 3. `Product` / vùng nguyên liệu đặc sản (Sầu riêng vùng trồng Cư Né - Krông Búk)
 * 4. `FAQPage` (khớp 100% bộ câu hỏi hiển thị trên trang chủ)
 */
export function buildHomeStructuredDataJson(): string {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: COOP_BRAND.shortName,
        alternateName: [
          "Hợp tác xã Cư Né",
          "HTX Cune",
          "Sầu riêng Cư Né - Krông Búk",
          COOP_BRAND.legalName,
        ],
        inLanguage: "vi-VN",
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/trace/{search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": ["Organization", "LocalBusiness"],
        "@id": `${SITE_URL}/#organization`,
        name: COOP_BRAND.legalName,
        legalName: COOP_BRAND.legalName,
        alternateName: [...COOP_BRAND.alternateNames],
        taxID: COOP_BRAND.registrationCode,
        foundingDate: COOP_BRAND.foundingDate,
        url: SITE_URL,
        telephone: COOP_BRAND.telephone,
        priceRange: "$$",
        logo: {
          "@type": "ImageObject",
          "@id": `${SITE_URL}/#logo`,
          url: `${SITE_URL}/newlogo.png`,
          contentUrl: `${SITE_URL}/newlogo.png`,
          width: 512,
          height: 512,
          caption: "Biểu trưng Hợp tác xã Cư Né - Vùng trồng sầu riêng Krông Búk, Đắk Lắk",
        },
        image: [
          `${SITE_URL}/landing/real-hero-cune.jpg`,
          `${SITE_URL}/landing/cune-orchard-village.jpg`,
          `${SITE_URL}/newlogo.png`,
        ],
        description:
          "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né (HTX Cư Né - HTX Cune) quản lý vùng trồng sầu riêng liên kết chuẩn VietGAP, nhật ký canh tác điện tử, kiểm nghiệm an toàn và truy xuất nguồn gốc QR xuất khẩu chính ngạch tại xã Krông Búk, tỉnh Đắk Lắk.",
        address: {
          "@type": "PostalAddress",
          streetAddress: COOP_BRAND.streetAddress,
          addressLocality: COOP_BRAND.district,
          addressRegion: COOP_BRAND.province,
          addressCountry: COOP_BRAND.country,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: 13.085,
          longitude: 108.215,
        },
        areaServed: [
          { "@type": "AdministrativeArea", name: "Xã Krông Búk" },
          { "@type": "AdministrativeArea", name: "Xã Ea Khăl" },
          { "@type": "AdministrativeArea", name: "Tỉnh Đắk Lắk" },
          { "@type": "Country", name: "Việt Nam" },
        ],
        knowsAbout: [
          "Sầu riêng Cư Né",
          "Sầu riêng Krông Búk",
          "Sầu riêng Đắk Lắk",
          "Sầu riêng Ri6 và Dona Monthong",
          "Mã số vùng trồng sầu riêng xuất khẩu PUC GACC",
          "Truy xuất nguồn gốc nông sản theo Nghị định 37/2026/NĐ-CP",
        ],
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: "HTX Cư Né - Sầu riêng Cư Né, Krông Búk, Đắk Lắk chuẩn xuất khẩu",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${SITE_URL}/landing/real-hero-cune.jpg`,
        },
        inLanguage: "vi-VN",
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };

  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

