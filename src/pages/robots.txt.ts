import type { APIRoute } from "astro";
import { siteConfig } from "../data/site";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const baseUrl = site ?? new URL(siteConfig.url);
  const sitemapUrl = new URL("/sitemap-index.xml", baseUrl).toString();

  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
