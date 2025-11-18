'use client';

import { createContext, useContext, ReactNode } from 'react';

type Messages = Record<string, any>;

const DictionaryContext = createContext<Messages>({});

export function DictionaryProvider({
  children,
  messages,
}: {
  children: ReactNode;
  messages: Messages;
}) {
  return (
    <DictionaryContext.Provider value={messages}>
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionary() {
  return useContext(DictionaryContext);
}

export function useTranslations() {
  const dict = useDictionary();
  
  return (key: string, vars?: Record<string, any>) => {
    const keys = key.split('.');
    let value: any = dict;
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    if (typeof value === 'string' && vars) {
      return value.replace(/\{(\w+)\}/g, (_, varKey) => vars[varKey] ?? '');
    }
    
    return value ?? key;
  };
}
