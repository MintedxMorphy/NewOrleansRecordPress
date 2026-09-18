import type { MetadataRoute } from "next"
import { SITE_URL, getBlogPosts, postUrl } from "@/lib/blog"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-18")

  const marketing: MetadataRoute.Sitemap = [
    "",
    "/quote",
    "/resources",
    "/team",
    "/vinyl-colors",
    "/story",
    "/blog",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === "/blog" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/blog" ? 0.7 : 0.8,
  }))

  const posts: MetadataRoute.Sitemap = getBlogPosts().map((post) => ({
    url: postUrl(post),
    lastModified: new Date(post.dateModified),
    changeFrequency: "monthly",
    priority: 0.8,
  }))

  return [...marketing, ...posts]
}
