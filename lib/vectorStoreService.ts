/**
 * Servicio de vectorización y ejemplos SPARQL para RAG
 * Carga contexto y ejemplos desde archivos MD
 * Usa embeddings semánticos para selección de ejemplos
 * Integra knowledge base indexada para retrieval avanzado
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenAIEmbeddings } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";

const CONTEXT_DIR = join(process.cwd(), 'context');
const VECTOR_STORE_PATH = join(CONTEXT_DIR, 'vector-store.json');

interface Example {
  query: string;
  sparql: string;
}

interface Document {
  id: string;
  content: string;
  metadata: {
    type: string;
    category?: string;
    difficulty?: string;
    source: string;
    filePath: string;
    [key: string]: any;
  };
  embedding?: number[];
}

interface VectorStore {
  documents: Document[];
  metadata: {
    indexed_at: string;
    total_documents: number;
    embedding_model: string;
  };
}

interface RetrievedDocument {
  document: Document;
  score: number;
}

let embeddingsModel: OllamaEmbeddings | OpenAIEmbeddings | null = null;
let embeddingsCache: Map<string, number[]> = new Map();
let vectorStore: VectorStore | null = null;

// Cargar contexto DCAT desde archivo MD
export function loadDCATContext(): string {
  try {
    return readFileSync(join(CONTEXT_DIR, 'dcat-vocabulary.md'), 'utf-8');
  } catch (error) {
    console.error('Error loading DCAT context:', error);
    return 'Error: No se pudo cargar el contexto DCAT';
  }
}

// Cargar ejemplos desde archivo MD
export function loadExamples(): Example[] {
  try {
    const content = readFileSync(join(CONTEXT_DIR, 'examples.md'), 'utf-8');
    const examples: Example[] = [];
    
    // Extraer ejemplos usando regex
    // Formato: **Pregunta:** "texto" seguido de ```sparql ... ```
    const exampleRegex = /\*\*Pregunta:\*\*\s+"([^"]+)"[\s\S]*?```sparql\n([\s\S]*?)```/g;
    let match;
    
    while ((match = exampleRegex.exec(content)) !== null) {
      examples.push({
        query: match[1],
        sparql: match[2].trim()
      });
    }
    
    return examples;
  } catch (error) {
    console.error('Error loading examples:', error);
    return [];
  }
}

/**
 * Inicializa el modelo de embeddings (lazy loading)
 * Soporta múltiples proveedores basándose en LLM_PROVIDER
 */
async function getEmbeddingsModel(): Promise<OllamaEmbeddings | OpenAIEmbeddings> {
  if (!embeddingsModel) {
    // Usar EMBEDDINGS_PROVIDER si está definido, sino usar LLM_PROVIDER
    const provider = (process.env.EMBEDDINGS_PROVIDER || process.env.LLM_PROVIDER)?.toLowerCase() || 'ollama';
    console.log(`🤖 Inicializando modelo de embeddings (${provider})...`);
    
    try {
      if (provider === 'ollama') {
        // Ollama usa su propia API nativa de embeddings
        const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
        const embeddingsModelName = process.env.OLLAMA_EMBEDDINGS_MODEL || 'nomic-embed-text';
        embeddingsModel = new OllamaEmbeddings({
          model: embeddingsModelName,
          baseUrl: ollamaUrl,
        });
      } else if (provider === 'openrouter') {
        // OpenRouter soporta embeddings vía API compatible OpenAI
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          throw new Error('OPENROUTER_API_KEY not set');
        }
        embeddingsModel = new OpenAIEmbeddings({
          modelName: 'openai/text-embedding-3-small',
          openAIApiKey: apiKey,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_SITE_NAME || 'SPARQL Naturalizer',
            },
          },
        });
      } else if (provider === 'openai') {
        // OpenAI directo
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY not set');
        }
        embeddingsModel = new OpenAIEmbeddings({
          modelName: 'text-embedding-3-small',
          openAIApiKey: apiKey,
        });
      } else if (provider === 'github') {
        // GitHub Models - soporta embeddings vía API compatible OpenAI
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          throw new Error('GITHUB_TOKEN not set (scope: models:read)');
        }
        embeddingsModel = new OpenAIEmbeddings({
          modelName: 'text-embedding-3-small',
          openAIApiKey: token,
          configuration: {
            baseURL: 'https://models.github.ai/inference',
            defaultHeaders: {
              'Authorization': `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'Accept': 'application/vnd.github+json',
              'HTTP-Referer': process.env.GITHUB_SITE_URL || 'http://localhost:3000',
              'X-Title': process.env.GITHUB_SITE_NAME || 'SPARQL Naturalizer',
            },
          },
        });
      } else {
        throw new Error(`Unsupported provider for embeddings: ${provider}`);
      }
      
      console.log(`✅ Modelo de embeddings cargado (${provider})`);
    } catch (error) {
      console.error('❌ Error cargando modelo de embeddings:', error);
      throw error;
    }
  }
  return embeddingsModel;
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Selecciona ejemplos relevantes usando embeddings semánticos
 */
export async function getRelevantExamplesWithEmbeddings(
  query: string, 
  k: number = 3
): Promise<Example[]> {
  try {
    const allExamples = loadExamples();
    
    if (allExamples.length === 0) {
      console.warn('⚠️ No examples found, using empty array');
      return [];
    }

    // Inicializar modelo de embeddings
    const model = await getEmbeddingsModel();
    
    // Generar embedding de la query del usuario
    const queryEmbedding = await model.embedQuery(query);
    
    // Calcular similitud con todos los ejemplos
    const examplesWithScores = await Promise.all(
      allExamples.map(async (example, idx) => {
        // Cachear embeddings de ejemplos para evitar recalcular
        let exampleEmbedding: number[];
        
        if (embeddingsCache.has(example.query)) {
          exampleEmbedding = embeddingsCache.get(example.query)!;
        } else {
          exampleEmbedding = await model.embedQuery(example.query);
          embeddingsCache.set(example.query, exampleEmbedding);
        }
        
        const score = cosineSimilarity(queryEmbedding, exampleEmbedding);
        
        return { example, score, idx };
      })
    );
    
    // Ordenar por similitud y tomar top-k
    const topExamples = examplesWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    
    console.log(`🔍 Selected ${topExamples.length} relevant examples using embeddings:`);
    topExamples.forEach(({ example, score, idx }) => {
      console.log(`   ${idx}: "${example.query.substring(0, 50)}..." (score: ${score.toFixed(3)})`);
    });
    
    return topExamples.map(item => item.example);
    
  } catch (error) {
    console.error('❌ Error with embeddings, falling back to keyword matching:', error);
    return getRelevantExamples(query, k);
  }
}

/**
 * Selecciona ejemplos relevantes basándose en keywords (FALLBACK)
 */
export function getRelevantExamples(query: string, k: number = 3): Example[] {
  const allExamples = loadExamples();
  const queryLower = query.toLowerCase();
  
  // Mapeo de keywords a índices de ejemplos (0-based)
  const keywords = [
    { terms: ['todos', 'listar', 'dame'], examples: [0] },
    { terms: ['csv', 'formato', 'json', 'xml'], examples: [1, 6] },
    { terms: ['salud', 'sanidad', 'sanitario'], examples: [2, 5] },
    { terms: ['cuantos', 'total', 'count', 'contar'], examples: [3] },
    { terms: ['fecha', 'año', '2023', '2024', 'publicado', 'reciente'], examples: [4, 8] },
    { terms: ['ministerio', 'gobierno', 'organismo', 'publicador'], examples: [5] },
    { terms: ['categoria', 'tema', 'medio ambiente'], examples: [7] },
    { terms: ['licencia', 'creative commons'], examples: [9] },
  ];
  
  const selectedIndices = new Set<number>();
  
  // Buscar por keywords
  for (const { terms, examples } of keywords) {
    if (terms.some(term => queryLower.includes(term))) {
      examples.forEach(idx => {
        if (idx < allExamples.length) {
          selectedIndices.add(idx);
        }
      });
    }
  }
  
  // Si no hay matches específicos, tomar los primeros ejemplos generales
  if (selectedIndices.size === 0) {
    selectedIndices.add(0); // "Dame todos los datasets"
    selectedIndices.add(1); // "Busca datasets por formato"
    selectedIndices.add(2); // "Datasets sobre salud"
  }
  
  const selected = Array.from(selectedIndices)
    .slice(0, k)
    .map(idx => allExamples[idx]);
  
  console.log(`🔍 Selected ${selected.length} relevant examples (keyword matching)`);
  return selected;
}

/**
 * ============================================================================
 * Integración base de conocimiento
 * ============================================================================
 */

/**
 * Carga el vector store indexado desde disco
 */
export function loadVectorStore(): VectorStore | null {
  if (vectorStore) {
    return vectorStore; // Cache
  }
  
  try {
    const content = readFileSync(VECTOR_STORE_PATH, 'utf-8');
    vectorStore = JSON.parse(content);
    
    console.log(`📚 Vector store cargado:`);
    console.log(`   Total documentos: ${vectorStore!.metadata.total_documents}`);
    console.log(`   Modelo: ${vectorStore!.metadata.embedding_model}`);
    console.log(`   Indexado: ${vectorStore!.metadata.indexed_at}`);
    
    return vectorStore;
  } catch (error) {
    console.warn('⚠️ Vector store no encontrado. Ejecuta "npm run index-kb" primero.');
    return null;
  }
}

/**
 * Busca documentos relevantes en la knowledge base usando embeddings
 */
export async function searchKnowledgeBase(
  query: string,
  k: number = 5,
  filter?: { type?: string; category?: string; difficulty?: string }
): Promise<RetrievedDocument[]> {
  const store = loadVectorStore();
  
  if (!store || !store.documents.length) {
    console.warn('⚠️ Knowledge base vacía');
    return [];
  }
  
  try {
    // Inicializar modelo de embeddings
    const model = await getEmbeddingsModel();
    
    // Generar embedding de la query
    const queryEmbedding = await model.embedQuery(query);
    
    // Filtrar documentos si se especifica
    let documentsToSearch = store.documents;
    
    if (filter) {
      documentsToSearch = documentsToSearch.filter(doc => {
        if (filter.type && doc.metadata.type !== filter.type) return false;
        if (filter.category && doc.metadata.category !== filter.category) return false;
        if (filter.difficulty && doc.metadata.difficulty !== filter.difficulty) return false;
        return true;
      });
    }
    
    // Calcular similitud con todos los documentos
    const docsWithScores: RetrievedDocument[] = documentsToSearch
      .filter(doc => doc.embedding) // Solo documentos con embedding
      .map(doc => ({
        document: doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    
    console.log(`🔍 Knowledge base search: "${query}"`);
    console.log(`   Encontrados: ${docsWithScores.length} documentos`);
    docsWithScores.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.document.id} (${item.document.metadata.type}) - Score: ${item.score.toFixed(3)}`);
    });
    
    return docsWithScores;
    
  } catch (error) {
    console.error('❌ Error buscando en knowledge base:', error);
    return [];
  }
}

/**
 * Busca documentos por tipo específico
 */
export async function searchKnowledgeBaseByType(
  query: string,
  type: 'vocabulary' | 'pattern' | 'example' | 'documentation',
  k: number = 3
): Promise<RetrievedDocument[]> {
  return searchKnowledgeBase(query, k, { type });
}

/**
 * Obtiene contexto completo para generar SPARQL
 * Combina vocabularios, patrones y ejemplos relevantes
 */
export async function getContextForQuery(
  query: string
): Promise<{
  vocabularies: string[];
  patterns: string[];
  examples: string[];
  metadata: { totalDocs: number; types: Record<string, number> };
}> {
  try {
    // Buscar en paralelo por cada tipo
    const [vocabularies, patterns, examples] = await Promise.all([
      searchKnowledgeBaseByType(query, 'vocabulary', 2),
      searchKnowledgeBaseByType(query, 'pattern', 2),
      searchKnowledgeBaseByType(query, 'example', 3),
    ]);
    
    const allDocs = [...vocabularies, ...patterns, ...examples];
    const typeCount = allDocs.reduce((acc, item) => {
      const type = item.document.metadata.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      vocabularies: vocabularies.map(item => item.document.content),
      patterns: patterns.map(item => item.document.content),
      examples: examples.map(item => item.document.content),
      metadata: {
        totalDocs: allDocs.length,
        types: typeCount,
      }
    };
  } catch (error) {
    console.error('❌ Error obteniendo contexto:', error);
    return {
      vocabularies: [],
      patterns: [],
      examples: [],
      metadata: { totalDocs: 0, types: {} }
    };
  }
}
