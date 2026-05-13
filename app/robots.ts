import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api", "/api/", "/dashboard", "/dashboard/"],
      },
    ],
    sitemap: "https://rubberfit.app/sitemap.xml",
  }
}
