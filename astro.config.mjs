// @ts-check
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import { defineConfig, envField } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://perish.ing",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  session: {
    driver: "cookie",
  },
  env: {
    schema: {
      DISCORD_WEBHOOK_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: "client",
        access: "public",
      }),
    },
  },
  integrations: [sitemap()],
  output: "server",
});
