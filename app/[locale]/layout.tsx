import type { Metadata } from "next";
import {notFound} from 'next/navigation';
import {getDictionary, locales, type Locale} from './dictionaries';
import {DictionaryProvider} from './dictionary-provider';
import "./globals.css";
import "./yasgui-theme.css";

export async function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: {params: Promise<{locale: string}>}): Promise<Metadata> {
  const {locale} = await params;
  const dict = await getDictionary(locale as Locale);
  
  return {
    title: dict.app.title + " - datos.gob.es",
    description: dict.app.subtitle,
    keywords: ["SPARQL", "Natural Language", "AI", "Machine Learning", "Semantic Web", "datos.gob.es", "RAG", "LangChain", "Ollama"],
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    manifest: '/site.webmanifest',
    openGraph: {
      title: dict.app.title,
      description: dict.app.subtitle,
      type: 'website',
      locale: locale,
      siteName: 'SPARQL Naturalizer',
    },
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;

  if (!locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getDictionary(locale as Locale);

  return (
    <html lang={locale}>
      <body>
        <DictionaryProvider messages={messages}>
          {children}
        </DictionaryProvider>
      </body>
    </html>
  );
}
