export const siteConfig = {
  name: "a9x",
  url: "https://perish.ing",
  description:
    "a9x designs and builds fast websites, full-stack apps, and managed hosting infrastructure that feels stable and easy to trust.",
  email: "a9x@is.perish.ing",
  locale: "en_US",
  defaultSocialImage: "/social-card.svg",
  defaultSocialImageAlt:
    "Social preview card for a9x at perish.ing with web design, full-stack development, and managed hosting.",
  sameAs: ["https://discord.com/users/693893365380546571"],
  expertise: [
    "Web design",
    "Full-stack application development",
    "Managed hosting",
    "Infrastructure hardening",
    "Cloudflare",
    "DNS and CDN setup",
    "Linux server administration",
    "Website performance optimization",
  ],
} as const;

export const makeAbsoluteUrl = (path: string) =>
  new URL(path, siteConfig.url).toString();
