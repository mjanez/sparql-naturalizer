'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/app/[locale]/dictionary-provider';

// Tipos para YASGUI (importaciones condicionales)
type YasguiType = any;
type YasguiInstanceType = any;

interface SparqlEditorProps {
  sparqlQuery: string;
  endpoint?: string;
  onQueryChange?: (query: string) => void;
}

/**
 * Componente YASGUI para editar y ejecutar consultas SPARQL
 * 
 * IMPORTANTE: Este componente usa carga dinámica para evitar errores de SSR,
 * ya que YASGUI manipula el DOM del navegador.
 */
const SparqlEditor: React.FC<SparqlEditorProps> = ({ 
  sparqlQuery, 
  endpoint = 'https://datos.gob.es/virtuoso/sparql',
  onQueryChange 
}) => {
  const t = useTranslations();
  const yasguiContainerRef = useRef<HTMLDivElement>(null);
  const yasguiInstanceRef = useRef<YasguiInstanceType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Solo cargar YASGUI en el cliente
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const loadYasgui = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Cargar CSS base de YASGUI (los estilos custom están en yasgui-theme.css)
        if (!document.getElementById('yasgui-css')) {
          const link = document.createElement('link');
          link.id = 'yasgui-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/@triply/yasgui@4.2.28/build/yasgui.min.css';
          document.head.appendChild(link);
        }

        // Importación dinámica de YASGUI
        const Yasgui = (await import('@triply/yasgui')).default;

        // Verificar que el componente sigue montado
        if (!isMounted || !yasguiContainerRef.current) return;

        // Crear instancia de YASGUI solo si no existe
        if (!yasguiInstanceRef.current) {
          yasguiInstanceRef.current = new Yasgui(yasguiContainerRef.current, {
            requestConfig: { 
              endpoint: endpoint 
            },
            copyEndpointOnNewTab: false,
            persistenceId: null, // Deshabilitar persistencia para evitar conflictos
          });

          const tab = yasguiInstanceRef.current.getTab();
          if (tab && tab.yasqe) {
            tab.yasqe.setValue(sparqlQuery);
            
            if (onQueryChange) {
              tab.yasqe.on('change', () => {
                const newQuery = tab.yasqe.getValue();
                onQueryChange(newQuery);
              });
            }
          }
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading YASGUI:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : t('editor.loadFailed'));
          setIsLoading(false);
        }
      }
    };

    loadYasgui();

    // Cleanup
    return () => {
      isMounted = false;
      if (yasguiContainerRef.current) {
        yasguiContainerRef.current.innerHTML = '';
      }
      yasguiInstanceRef.current = null;
    };
  }, []); // Solo ejecutar una vez al montar

  // Actualizar la consulta cuando la prop cambie
  useEffect(() => {
    if (yasguiInstanceRef.current && sparqlQuery) {
      const tab = yasguiInstanceRef.current.getTab();
      if (tab && tab.yasqe) {
        const currentQuery = tab.yasqe.getValue();
        // Solo actualizar si la consulta es diferente
        if (currentQuery !== sparqlQuery) {
          tab.yasqe.setValue(sparqlQuery);
        }
      }
    }
  }, [sparqlQuery]);

  if (error) {
    return (
      <div className="border border-red-300 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
        <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">
          {t('editor.errorTitle')}
        </h3>
        <p className="text-red-600 dark:text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('editor.loading')}</p>
          </div>
        </div>
      )}
      <div 
        ref={yasguiContainerRef} 
        className="yasgui-container"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
};

// Usar React.memo para optimizar re-renders
export default React.memo(SparqlEditor);
