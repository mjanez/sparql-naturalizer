'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from './dictionary-provider';
import dynamic from 'next/dynamic';
import LanguageSelector from '@/components/LanguageSelector';

function EditorLoading() {
  const t = useTranslations();
  return (
    <div className="h-96 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('loading.generic')}</p>
      </div>
    </div>
  );
}

const DynamicSparqlEditor = dynamic(() => import('@/components/SparqlEditor'), { 
  ssr: false,
  loading: () => <EditorLoading />
});

export default function Home() {
  const t = useTranslations();
  const [nlInput, setNlInput] = useState('');
  const [sparqlOutput, setSparqlOutput] = useState('SELECT * WHERE {\n  ?s ?p ?o\n} LIMIT 10');
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<string>(t('loading.provider'));
  const [llmModel, setLlmModel] = useState<string>('');
  const [endpoint, setEndpoint] = useState('https://datos.gob.es/virtuoso/sparql');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  
  const endpoints = [
    { name: t('endpoint.default'), url: 'https://datos.gob.es/virtuoso/sparql' },
    { name: t('endpoint.europa'), url: 'https://data.europa.eu/sparql' },
  ];

  const examples = [
    t('input.exampleQueries.csv'),
    t('input.exampleQueries.health'),
    t('input.exampleQueries.ministry'),
    t('input.exampleQueries.license'),
  ];

  useEffect(() => {
    // Verificar que el LLM provider esté disponible
    const checkLLMProvider = async () => {
      try {
        setIsModelLoading(true);
        setModelError(null);
        
        const response = await fetch('/api/generate-sparql');
        const data = await response.json();
        
        if (data.status === 'ok') {
          setLlmProvider(data.provider);
          setLlmModel(data.model || '');
          console.log(`✅ LLM Provider available: ${data.provider} (${data.model})`);
        } else {
          setLlmProvider(data.provider || 'unknown');
          setLlmModel('');
          setModelError(t('errors.connectionFailed'));
        }
      } catch (error) {
        setModelError(t('errors.connectionFailed'));
      } finally {
        setIsModelLoading(false);
      }
    };
    checkLLMProvider();
  }, []);

  const handleGenerate = async () => {
    if (!nlInput.trim()) return;
    setIsGenerating(true);
    setModelError(null);
    setSparqlOutput(''); // Limpiar output anterior
    setGenerationProgress(0);
    setCurrentStep(t('status.step.initializing'));
    
    // Simular progreso mientras se genera
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev < 90) return prev + 2;
        return prev;
      });
    }, 500);
    
    try {
      setCurrentStep(t('status.step.analyzing'));
      setGenerationProgress(10);
      const response = await fetch('/api/generate-sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlInput, stream: true })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate SPARQL');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response stream available');
      }

      let accumulatedSparql = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remover "data: "
            
            if (data === '[DONE]') {
              console.log('Streaming completed');
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'metadata') {
                console.log(`Using ${parsed.model} with ${parsed.examples} examples`);
                setCurrentStep(t('status.step.searching'));
                setGenerationProgress(30);
              } else if (parsed.type === 'chunk') {
                // Actualizar output en tiempo real
                accumulatedSparql = parsed.accumulated;
                setCurrentStep(t('status.step.generating'));
                setGenerationProgress(50 + (accumulatedSparql.length / 10));
                
                // Limpiar SPARQL en tiempo real
                let cleanedSparql = accumulatedSparql.trim();
                cleanedSparql = cleanedSparql.replace(/```sparql\n?/g, '').replace(/```\n?/g, '');
                const prefixMatch = cleanedSparql.match(/(PREFIX[\s\S]*)/);
                if (prefixMatch) {
                  cleanedSparql = prefixMatch[1].trim();
                }
                
                setSparqlOutput(cleanedSparql);
              } else if (parsed.type === 'done') {
                // Respuesta final completa
                setSparqlOutput(parsed.sparql);
                setCurrentStep(t('status.step.generating'));
                setGenerationProgress(100);
                clearInterval(progressInterval);
                console.log(`Generated using ${parsed.model} with ${parsed.examples} examples`);
              } else if (parsed.type === 'error') {
                clearInterval(progressInterval);
                throw new Error(parsed.error);
              }
            } catch (parseError) {
              // Ignorar errores de parsing (líneas incompletas)
              if (parseError instanceof Error && !parseError.message.includes('Unexpected')) {
                console.error('Parse error:', parseError);
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Generation error:', error);
      setModelError(error instanceof Error ? error.message : t('errors.generationFailed'));
      // Restaurar query por defecto en caso de error
      setSparqlOutput('SELECT * WHERE {\n  ?s ?p ?o\n} LIMIT 10');
      clearInterval(progressInterval);
    } finally {
      setIsGenerating(false);
      clearInterval(progressInterval);
      setTimeout(() => {
        setGenerationProgress(0);
        setCurrentStep('');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4UzAgOC4wNiAwIDE4czguMDYgMTggMTggMTggMTgtOC4wNiAxOC0xOHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40"></div>
      
      {/* Language Selector - Top Right */}
      <div className="absolute top-6 right-6 z-20">
        <LanguageSelector />
      </div>
      
      <div className="relative container mx-auto px-4 py-8 max-w-7xl">
        {/* Elegant Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full blur opacity-30"></div>
              <div className="relative bg-white dark:bg-slate-900 rounded-full p-3 shadow-lg">
                <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
            {t('app.title')}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {t('app.subtitle')}
          </p>
        </header>
        
        {modelError && (
          <div className="mb-8 mx-auto max-w-2xl">
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-100 dark:border-red-900">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{t('status.modelLoadingFailed')}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{modelError}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Premium Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-stretch">
          {/* Left Column - Input */}
          <div className="flex flex-col space-y-6 lg:h-auto">

            {/* LLM Status Cards */}
            {isModelLoading && (
              <div>
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-indigo-100 dark:border-indigo-900">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
              <div className="p-6 flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 relative">
                    <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{t('status.connecting')}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('status.checking', {provider: llmProvider})}</p>
                </div>
              </div>
            </div>
              </div>
            )}

            {!isModelLoading && !modelError && (
              <div>
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-emerald-100 dark:border-emerald-900">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
              <div className="p-6 flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                    {t('status.ready', {provider: llmModel ? `${llmProvider}: ${llmModel}` : llmProvider})}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{t('status.readyDescription')}</p>
                </div>
              </div>
            </div>
              </div>
            )}

            {/* Input Card */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full"></div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('input.title')}</h2>
                </div>
                <textarea
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  placeholder={t('input.exampleQueries.csv')}
                  className="w-full h-40 p-4 border-2 border-slate-200 dark:border-slate-700 rounded-xl
                           bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-base
                           placeholder:text-slate-400 dark:placeholder:text-slate-500
                           focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/50
                           transition-all duration-200 resize-none"
                  disabled={isModelLoading}
                />
                {/* Progress Bar */}
                {isGenerating && (
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                        {currentStep}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 font-semibold">
                        {Math.round(generationProgress)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || isModelLoading || !nlInput.trim()}
                    className="flex-1 relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 
                             hover:from-indigo-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500
                             text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-xl
                             transform hover:scale-[1.02] active:scale-95 transition-all duration-200
                             disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                        {t('actions.generating')}
                      </span>
                    ) : (
                      t('actions.generate') + ' ⚡'
                    )}
                  </button>
                  <button
                    onClick={() => setNlInput('')}
                    disabled={isGenerating}
                    className="px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                             text-slate-700 dark:text-slate-200 font-semibold rounded-xl
                             transform hover:scale-105 active:scale-95 transition-all duration-200 shadow-md
                             disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {t('actions.clear')}
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                  {t('input.placeholder')}
                </p>
              </div>
            </div>

            {/* Examples Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-xl">💡</span> {t('input.examples')}
              </h3>
              <div className="space-y-2.5">
                {examples.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => setNlInput(example)}
                    className="w-full text-left p-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700
                             hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30
                             text-sm text-slate-700 dark:text-slate-300 font-medium
                             transform hover:scale-[1.01] transition-all duration-200 group"
                  >
                    <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{example}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Endpoint Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-xl">🌐</span> {t('tech.endpointLabel')}
              </h3>
              <div className="flex gap-2 mb-4 flex-wrap">
                {endpoints.map((ep, idx) => (
                  <button
                    key={idx}
                    onClick={() => setEndpoint(ep.url)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm
                      ${endpoint === ep.url
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg scale-105'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:scale-105'
                      }`}
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono
                         bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white
                         focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 transition-all"
                placeholder="https://example.com/sparql"
              />
            </div>

          </div>

          {/* Right Column - Output */}
          <div className="flex flex-col lg:min-h-[800px]">
            <div className="group relative flex flex-col">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-8 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full"></div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('output.title')}</h2>
                </div>
                <div className="flex-1 overflow-auto">
                  <DynamicSparqlEditor 
                    sparqlQuery={sparqlOutput}
                    endpoint={endpoint}
                    onQueryChange={(query) => setSparqlOutput(query)}
                  />
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* Premium Footer */}
        <footer className="mt-16 text-center">
          <div className="inline-flex items-center gap-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl px-8 py-5 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 flex-wrap justify-center">
              <span className="font-semibold">{t('footer.poweredBy')}</span>
              <a 
                href="https://langchain.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-bold text-xs hover:shadow-lg hover:scale-105 transition-all"
              >
                {t('tech.langchain')}
              </a>
              <span className="text-slate-400">+</span>
              {llmProvider && !isModelLoading && (
                <>
                  <a 
                    href={
                      llmProvider === 'ollama' ? 'https://ollama.com/' :
                      llmProvider === 'github' ? 'https://github.com/marketplace/models' :
                      llmProvider === 'openai' ? 'https://openai.com/api/' :
                      llmProvider === 'openrouter' ? 'https://openrouter.ai/' :
                      '#'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-3 py-1 text-white rounded-lg font-bold text-xs hover:shadow-lg hover:scale-105 transition-all ${
                      llmProvider === 'ollama' 
                        ? 'bg-gradient-to-r from-orange-500 to-red-600'
                        : llmProvider === 'github'
                        ? 'bg-gradient-to-r from-gray-700 to-gray-900'
                        : llmProvider === 'openai'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                        : llmProvider === 'openrouter'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-600'
                        : 'bg-gradient-to-r from-slate-500 to-slate-700'
                    }`}
                  >
                    {llmProvider === 'ollama' ? 'Ollama' : 
                     llmProvider === 'github' ? 'GitHub Models' :
                     llmProvider === 'openai' ? 'OpenAI' :
                     llmProvider === 'openrouter' ? 'OpenRouter' :
                     llmProvider}
                  </a>
                  {llmModel && (
                    <>
                      <span className="text-slate-400">/</span>
                      <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-bold text-xs">
                        {llmModel}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-700"></div>
            <a 
              href="https://github.com/mjanez/sparql-naturalizer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold text-sm transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {t('footer.github')}
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
