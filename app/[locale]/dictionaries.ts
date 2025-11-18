import 'server-only';

const dictionaries = {
  es: () => import('@/messages/es.json').then((module) => module.default),
  en: () => import('@/messages/en.json').then((module) => module.default),
};

export const getDictionary = async (locale: 'es' | 'en') =>
  dictionaries[locale]?.() ?? dictionaries.es();

export const locales = ['es', 'en'] as const;
export const defaultLocale = 'es';
export type Locale = (typeof locales)[number];
