/**
 * Servicio unificado de LLM
 * Soporta múltiples proveedores: Ollama (local), GitHub Models, OpenAI
 */

import { Ollama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

export type LLMProvider = "ollama" | "openrouter" | "openai" | "github";

export interface LLMConfig {
  provider: LLMProvider;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
}

/**
 * Obtiene el proveedor configurado desde variables de entorno
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || "ollama";
  
  if (!["ollama", "openrouter", "openai", "github"].includes(provider)) {
    console.warn(`⚠️ Invalid LLM_PROVIDER: ${provider}, defaulting to ollama`);
    return "ollama";
  }
  
  return provider as LLMProvider;
}

/**
 * Crea una instancia de LLM según el proveedor configurado
 */
export function createLLM(config?: Partial<LLMConfig>) {
  const provider = config?.provider || getLLMProvider();
  const temperature = config?.temperature ?? 0.2;
  const maxTokens = config?.maxTokens ?? 300;
  
  console.log(`🤖 Initializing LLM: ${provider}`);
  
  switch (provider) {
    case "ollama":
      return createOllamaLLM(temperature, maxTokens);
    
    case "openrouter":
      return createOpenRouterLLM(temperature, maxTokens);
    
    case "openai":
      return createOpenAILLM(temperature, maxTokens);
    
    case "github":
      return createGitHubModelsLLM(temperature, maxTokens);
    
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Ollama (local)
 */
function createOllamaLLM(temperature: number, maxTokens: number) {
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  
  return {
    llm: new Ollama({
      baseUrl: ollamaUrl,
      model: ollamaModel,
      temperature,
      numPredict: maxTokens,
      numCtx: 8192,
      repeatPenalty: 1.2,
      topP: 0.9,
    }),
    model: ollamaModel,
    provider: 'ollama' as LLMProvider,
  };
}

/**
 * OpenRouter (remote - compatible con OpenAI SDK)
 */
function createOpenRouterLLM(temperature: number, maxTokens: number) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free';
  const siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
  const siteName = process.env.OPENROUTER_SITE_NAME || 'SPARQL Naturalizer';
  
  console.log('🔑 OpenRouter config:', {
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey?.substring(0, 10) + '...',
    model,
    siteUrl,
    siteName,
  });
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment variables');
  }
  
  return {
    llm: new ChatOpenAI({
      modelName: model,
      openAIApiKey: apiKey,
      temperature,
      maxTokens,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': siteUrl,
          'X-Title': siteName,
        },
      },
    }),
    model,
    provider: 'openrouter' as LLMProvider,
  };
}

/**
 * OpenAI (remote)
 */
function createOpenAILLM(temperature: number, maxTokens: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }
  
  return {
    llm: new ChatOpenAI({
      modelName: model,
      openAIApiKey: apiKey,
      temperature,
      maxTokens,
    }),
    model,
    provider: 'openai' as LLMProvider,
  };
}

/**
 * GitHub Models (remote - compatible con OpenAI API)
 * Endpoint: https://models.github.ai/inference/chat/completions
 * Requiere Personal Access Token con scope models:read
 */
function createGitHubModelsLLM(temperature: number, maxTokens: number) {
  const token = process.env.GITHUB_TOKEN;
  const model = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
  const siteUrl = process.env.GITHUB_SITE_URL || 'http://localhost:3000';
  const siteName = process.env.GITHUB_SITE_NAME || 'SPARQL Naturalizer';
  
  console.log('🐙 GitHub Models config:', {
    hasToken: !!token,
    tokenPrefix: token?.substring(0, 10) + '...',
    model,
    siteUrl,
    siteName,
  });
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not found in environment variables. Get one at: https://github.com/settings/tokens (scope: models:read)');
  }
  
  return {
    llm: new ChatOpenAI({
      modelName: model,
      openAIApiKey: token,
      temperature,
      maxCompletionTokens: maxTokens, // GitHub Models usa max_completion_tokens
      configuration: {
        baseURL: 'https://models.github.ai/inference',
        defaultHeaders: {
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Accept': 'application/vnd.github+json',
          'HTTP-Referer': siteUrl,
          'X-Title': siteName,
        },
      },
    }),
    model,
    provider: 'github' as LLMProvider,
  };
}

/**
 * Invoca el LLM con el prompt dado
 */
export async function invokeLLM(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const { llm, model, provider } = createLLM(config);
  
  try {
    const response = await llm.invoke(prompt);
    const content = typeof response === 'string' 
      ? response 
      : response.content?.toString() || response.toString();
    
    return {
      content,
      provider,
      model,
    };
  } catch (error) {
    console.error(`❌ Error invoking ${provider} LLM:`, error);
    throw error;
  }
}

/**
 * Verifica disponibilidad del LLM configurado
 */
export async function checkLLMAvailability(): Promise<{
  available: boolean;
  provider: LLMProvider;
  error?: string;
}> {
  const provider = getLLMProvider();
  
  try {
    switch (provider) {
      case 'ollama': {
        const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
        const response = await fetch(`${ollamaUrl}/api/tags`);
        
        if (!response.ok) {
          return { 
            available: false, 
            provider, 
            error: 'Ollama server not responding' 
          };
        }
        
        return { available: true, provider };
      }
      
      case 'openrouter': {
        if (!process.env.OPENROUTER_API_KEY) {
          return { 
            available: false, 
            provider, 
            error: 'OPENROUTER_API_KEY not configured' 
          };
        }
        return { available: true, provider };
      }
      
      case 'openai': {
        if (!process.env.OPENAI_API_KEY) {
          return { 
            available: false, 
            provider, 
            error: 'OPENAI_API_KEY not configured' 
          };
        }
        return { available: true, provider };
      }
      
      case 'github': {
        if (!process.env.GITHUB_TOKEN) {
          return { 
            available: false, 
            provider, 
            error: 'GITHUB_TOKEN not configured (scope: models:read)' 
          };
        }
        try {
          const response = await fetch('https://models.github.ai/inference/models', {
            headers: {
              'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
          
          if (!response.ok) {
            return { 
              available: false, 
              provider, 
              error: `GitHub Models API error: ${response.status}` 
            };
          }
          
          return { available: true, provider };
        } catch (error) {
          return { 
            available: false, 
            provider, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      }
      
      default:
        return { 
          available: false, 
          provider, 
          error: 'Unknown provider' 
        };
    }
  } catch (error) {
    return { 
      available: false, 
      provider, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
