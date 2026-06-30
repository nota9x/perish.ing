export const siteConfig = {
  name: 'a9x',
  url: 'https://we.are.slowly.perish.ing',
  description: 'a9x is a personal site with a little about me and the best ways to say hi.',
  email: 'a9x@is.perish.ing',
  locale: 'en_US',
  defaultSocialImage: '/social-card.svg',
  defaultSocialImageAlt: 'Social preview card for a9x.',
  sameAs: ['https://discord.com/users/693893365380546571'],
  interests: ['New Jersey', 'urbex photography', 'cats', 'the color black'],
} as const;

export const makeAbsoluteUrl = (path: string) => new URL(path, siteConfig.url).toString();
