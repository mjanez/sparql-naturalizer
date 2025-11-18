import { NextRequest, NextResponse } from 'next/server';
import { 
  loadDCATContext, 
  getRelevantExamplesWithEmbeddings,
  getContextForQuery 
} from '@/lib/vectorStoreService';
import { invokeLLM, getLLMProvider, checkLLMAvailability } from '@/lib/llmService';

/**
 * Limpia la respuesta del LLM para extraer solo SPARQL válido
 */
function cleanSparqlResponse(response: string): string {
  let sparql = response.trim();
  
  // Eliminar bloques de markdown
  sparql = sparql.replace(/```sparql\n?/g, '').replace(/```\n?/g, '');
  
  // Buscar desde PREFIX hasta el final o hasta texto no-SPARQL
  const prefixMatch = sparql.match(/(PREFIX[\s\S]*?LIMIT\s+\d+)/i);
  if (prefixMatch) {
    sparql = prefixMatch[1].trim();
  } else {
    // Si no hay PREFIX, buscar SELECT
    const selectMatch = sparql.match(/(SELECT[\s\S]*?LIMIT\s+\d+)/i);
    if (selectMatch) {
      sparql = selectMatch[1].trim();
    }
  }
  
  // Eliminar texto antes de PREFIX si existe
  const firstPrefix = sparql.indexOf('PREFIX');
  if (firstPrefix > 0) {
    sparql = sparql.substring(firstPrefix);
  }
  
  // Eliminar texto después de LIMIT
  const limitMatch = sparql.match(/^([\s\S]*?LIMIT\s+\d+)/i);
  if (limitMatch) {
    sparql = limitMatch[1];
  }
  
  // VALIDAR: Si no tiene PREFIX, agregarlos (critical fix)
  if (!sparql.includes('PREFIX')) {
    const requiredPrefixes = `PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

`;
    sparql = requiredPrefixes + sparql;
  }
  
  // VALIDAR: Cerrar WHERE clause si está incompleta
  const openBraces = (sparql.match(/{/g) || []).length;
  const closeBraces = (sparql.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    // Agregar cierre antes de LIMIT
    sparql = sparql.replace(/(\s*)(LIMIT\s+\d+)/i, '\n}$1$2');
  }
  
  return sparql;
}

/**
 * API Route para generar consultas SPARQL usando RAG + Ollama
 * Soporta streaming de respuestas para mejor UX
 * 
 * POST /api/generate-sparql
 * Body: { query: string, stream?: boolean }
 * Response: { sparql: string, examples: number, model: string } | SSE Stream
 */
export async function POST(request: NextRequest) {
  try {
    const { query, stream = true } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 Incoming query: "${query}"`);
    console.log(`🔄 Streaming: ${stream ? 'enabled' : 'disabled'}`);
    console.log('='.repeat(60));

    // ESTRATEGIA 1: Usar Knowledge Base indexada (preferido)
    console.log('🔍 Buscando en Knowledge Base...');
    const kbContext = await getContextForQuery(query);
    
    let prompt: string;
    let contextSource: string;
    
    if (kbContext.metadata.totalDocs > 0) {
      console.log(`✅ Encontrados ${kbContext.metadata.totalDocs} documentos relevantes`);
      console.log(`   - Vocabularios: ${kbContext.vocabularies.length}`);
      console.log(`   - Patrones: ${kbContext.patterns.length}`);
      console.log(`   - Ejemplos: ${kbContext.examples.length}`);
      
      const cleanExamples = kbContext.examples
        .map(ex => {
          const sparqlMatch = ex.match(/```sparql\n([\s\S]*?)```/);
          return sparqlMatch ? sparqlMatch[1].trim() : null;
        })
        .filter(ex => ex !== null)
        .slice(0, 3);
      
      // Extraer templates de patrones (solo SPARQL, sin explicaciones)
      const cleanPatterns = kbContext.patterns
        .map(pattern => {
          const sparqlMatches = pattern.match(/```sparql\n([\s\S]*?)```/g);
          if (sparqlMatches && sparqlMatches.length > 0) {
            return sparqlMatches[0].replace(/```sparql\n?/g, '').replace(/```/g, '').trim();
          }
          return null;
        })
        .filter(p => p !== null)
        .slice(0, 2);
      
      prompt = `You are a SPARQL expert for datos.gob.es catalog. Generate ONLY valid SPARQL code.

MANDATORY STRUCTURE:
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?variable1 ?variable2
WHERE {
  # Main pattern
  ?dataset a dcat:Dataset .
  
  # Additional patterns with proper indentation (2 spaces)
  
  # Filters at the end
}
LIMIT 100

CRITICAL RULES:
1. ALWAYS start with PREFIX declarations (3 required)
2. ALWAYS use proper indentation (2 spaces per level)
3. For text search: FILTER(CONTAINS(LCASE(?title), "keyword"))
4. For language: FILTER(LANG(?title) = "es")
5. For publisher search: ?dataset dct:publisher ?pub . ?pub foaf:name ?name . FILTER(CONTAINS(LCASE(?name), "keyword"))
6. For format: ?dataset dcat:distribution ?dist . ?dist dct:format ?format . FILTER(CONTAINS(LCASE(?format), "csv"))
7. For license: ?dataset dct:license ?license . FILTER(CONTAINS(STR(?license), "creativecommons"))
8. NEVER use dcat:format (doesn't exist)
9. NEVER search dcat:theme with strings (use URI or text search in title)
10. ALWAYS close WHERE clause properly
11. ALWAYS add LIMIT 100

CORRECT EXAMPLES:${cleanExamples.length > 0 ? '\n' + cleanExamples.slice(0, 2).map((ex, i) => `\n${ex}`).join('\n\n') : ''}

USER QUESTION: "${query}"

Generate complete, valid SPARQL (with PREFIX, proper indentation, closed braces):`;
      
      contextSource = 'knowledge-base';
      
    } else {
      // FALLBACK: Usar contexto legacy
      console.log('⚠️ Knowledge Base vacía, usando contexto legacy');
      
      const dcatContext = loadDCATContext();
      const relevantExamples = await getRelevantExamplesWithEmbeddings(query, 3);
      
      const examplesText = relevantExamples
        .map((ex, idx) => 
          `Ejemplo ${idx + 1}:\nPregunta: "${ex.query}"\nRespuesta SPARQL:\n${ex.sparql}`
        )
        .join('\n\n');

      prompt = `Eres un experto en SPARQL para el catálogo de datos abiertos datos.gob.es.

${dcatContext}

EJEMPLOS DE CONSULTAS:
${examplesText}

PREGUNTA DEL USUARIO: "${query}"

INSTRUCCIONES:
1. Analiza la pregunta del usuario
2. Genera una consulta SPARQL válida usando el vocabulario DCAT mostrado arriba
3. Inspírate en los ejemplos pero adapta la consulta a la pregunta específica
4. Usa FILTER para búsquedas de texto (CONTAINS, LCASE)
5. Incluye LIMIT 100 para evitar resultados masivos
6. NO incluyas explicaciones, SOLO la consulta SPARQL
7. Asegúrate de que la sintaxis sea correcta

CONSULTA SPARQL:`;
      
      contextSource = 'legacy';
    }

    const llmProvider = getLLMProvider();
    console.log(`🤖 Calling LLM (${llmProvider})...`);

    // 5. Streaming o respuesta normal
    if (stream) {
      const encoder = new TextEncoder();
      
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            console.log('🌊 Starting stream...');
            
            const metadata = {
              type: 'metadata',
              contextSource,
              kbDocs: kbContext.metadata.totalDocs,
              provider: llmProvider,
              timestamp: new Date().toISOString()
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));
            
            const llmResponse = await invokeLLM(prompt);
            const accumulatedText = llmResponse.content;

            for (const char of accumulatedText) {
              const chunkData = {
                type: 'chunk',
                content: char,
                accumulated: accumulatedText.substring(0, accumulatedText.indexOf(char) + 1)
              };
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkData)}\n\n`));
            }
            
            // Limpiar respuesta final
            const sparql = cleanSparqlResponse(accumulatedText);
            
            console.log('✅ Streaming completed');
            console.log('Generated SPARQL:');
            console.log(sparql.substring(0, 200) + '...');
            console.log('='.repeat(60) + '\n');
            
            // Enviar evento final
            const finalData = {
              type: 'done',
              sparql,
              contextSource,
              kbDocs: kbContext.metadata.totalDocs,
              provider: llmResponse.provider,
              model: llmResponse.model
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
            
            // Cerrar stream
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            
          } catch (error) {
            console.error('❌ Streaming error:', error);
            const errorData = {
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown streaming error'
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
      
    } else {
      // MODO NORMAL (sin streaming)
      const llmResponse = await invokeLLM(prompt);
      const response = llmResponse.content;
      
      console.log('✅ Generated SPARQL:');
      console.log(response.substring(0, 200) + '...');
      console.log('='.repeat(60) + '\n');

      // Limpiar respuesta
      const sparql = cleanSparqlResponse(response);

      return NextResponse.json({
        sparql,
        contextSource,
        kbDocs: kbContext.metadata.totalDocs,
        provider: llmResponse.provider,
        model: llmResponse.model,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Error generating SPARQL:', error);
    
    // Manejo de errores específicos
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        return NextResponse.json(
          { 
            error: 'Cannot connect to Ollama. Make sure it is running (docker-compose up -d)',
            details: error.message 
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Failed to generate SPARQL query',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Healthcheck endpoint
 */
export async function GET() {
  try {
    const provider = getLLMProvider();
    const available = await checkLLMAvailability();
    
    if (!available) {
      return NextResponse.json({ 
        status: 'error',
        provider,
        message: `LLM provider ${provider} is not available. Check configuration.`
      }, { status: 503 });
    }
    
    // Obtener modelo configurado
    let model = 'unknown';
    switch (provider) {
      case 'ollama':
        model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
        break;
      case 'github':
        model = process.env.GITHUB_MODEL || 'openai/gpt-4.1-mini';
        break;
      case 'openrouter':
        model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free';
        break;
      case 'openai':
        model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        break;
    }
    
    return NextResponse.json({ 
      status: 'ok',
      provider,
      model
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const provider = getLLMProvider();
    
    return NextResponse.json({ 
      status: 'error',
      provider,
      error: errorMessage,
      message: `LLM provider ${provider} is not available.`
    }, { status: 503 });
  }
}
