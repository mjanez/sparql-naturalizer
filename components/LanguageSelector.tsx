'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import Flag from 'react-world-flags'

const languages = [
  { code: 'es', name: 'Español', countryCode: 'ES' },
  { code: 'en', name: 'English', countryCode: 'GB' },
];

export default function LanguageSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  
  const currentLocale = pathname.startsWith('/en') ? 'en' : 'es';
  const currentLanguage = languages.find(lang => lang.code === currentLocale) || languages[0];

  const switchLocale = (newLocale: string) => {
    if (newLocale === currentLocale) {
      setIsOpen(false);
      return;
    }
    
    let newPathname = pathname;
    if (currentLocale === 'es' && newLocale === 'en') {
      newPathname = '/en' + pathname;
    } else if (currentLocale === 'en' && newLocale === 'es') {
      newPathname = pathname.replace('/en', '');
    }
    
    router.push(newPathname || '/');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:border-indigo-300 dark:hover:border-indigo-600"
        aria-label="Select language"
      >
        <Flag code={currentLanguage.countryCode} className="w-6 h-4 rounded-sm" />
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {currentLanguage.code.toUpperCase()}
        </span>
        <svg 
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => switchLocale(lang.code)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  lang.code === currentLocale
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Flag code={lang.countryCode} className="w-6 h-4 rounded-sm flex-shrink-0" />
                <span className="flex-1 font-medium">{lang.name}</span>
                {lang.code === currentLocale && (
                  <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
