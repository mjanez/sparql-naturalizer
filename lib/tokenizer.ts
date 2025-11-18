/**
 * Tokenizer simplificado para T5/SentencePiece en el navegador
 * 
 * NOTA: Esta es una implementación simplificada. Para producción,
 * deberías usar el vocabulario exacto exportado desde el modelo T5 entrenado.
 * 
 * El tokenizer real de T5 usa SentencePiece con un vocabulario de ~32k tokens.
 * Este tokenizer debe cargarse desde los archivos exportados durante el entrenamiento.
 */

export interface TokenizerConfig {
  vocabSize: number;
  padTokenId: number;
  eosTokenId: number;
  unkTokenId: number;
}

export class SimpleTokenizer {
  private vocab: Map<string, number>;
  private reverseVocab: Map<number, string>;
  private config: TokenizerConfig;

  constructor(vocabData?: Record<string, number>, config?: Partial<TokenizerConfig>) {
    this.config = {
      vocabSize: config?.vocabSize || 32128,
      padTokenId: config?.padTokenId || 0,
      eosTokenId: config?.eosTokenId || 1,
      unkTokenId: config?.unkTokenId || 2,
    };

    if (vocabData) {
      this.vocab = new Map(Object.entries(vocabData).map(([k, v]) => [k, v]));
    } else {
      this.vocab = this.createBasicVocab();
    }
    this.reverseVocab = new Map(
      Array.from(this.vocab.entries()).map(([token, id]) => [id, token])
    );
  }

  /**
   * Crea un vocabulario básico de ejemplo
   * IMPORTANTE: Esto debe ser reemplazado con el vocabulario real del modelo T5
   */
  private createBasicVocab(): Map<string, number> {
    const basicVocab = new Map<string, number>();
    
    // Tokens especiales
    basicVocab.set('<pad>', 0);
    basicVocab.set('</s>', 1);
    basicVocab.set('<unk>', 2);
    
    // Tokens comunes SPARQL
    const sparqlTokens = [
      'SELECT', 'WHERE', 'FILTER', 'OPTIONAL', 'UNION', 'LIMIT', 'OFFSET',
      'ORDER', 'BY', 'ASC', 'DESC', 'DISTINCT', 'REDUCED', 'FROM', 'NAMED',
      'PREFIX', 'BASE', 'CONSTRUCT', 'DESCRIBE', 'ASK', 'GRAPH', 'SERVICE',
      '?', '{', '}', '.', ';', ',', '(', ')', '[', ']',
      'a', 'rdf:type', 'rdfs:label', 'owl:sameAs',
    ];
    
    sparqlTokens.forEach((token, idx) => {
      basicVocab.set(token, idx + 3);
    });

    return basicVocab;
  }

  /**
   * Codifica texto a IDs de tokens
   */
  encode(text: string, addEos: boolean = false): number[] {
    const normalized = this.normalizeText(text);
    const tokens = this.tokenize(normalized);

    const ids = tokens.map(token => 
      this.vocab.get(token) ?? this.config.unkTokenId
    );
    if (addEos) {
      ids.push(this.config.eosTokenId);
    }

    return ids;
  }

  /**
   * Decodifica IDs de tokens a texto
   */
  decode(ids: number[], skipSpecialTokens: boolean = true): string {
    const tokens = ids.map(id => {
      const token = this.reverseVocab.get(id);

      if (skipSpecialTokens && this.isSpecialToken(id)) {
        return '';
      }
      
      return token ?? '<unk>';
    });

    return this.detokenize(tokens.filter(t => t !== ''));
  }

  /**
   * Normaliza el texto de entrada
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * Tokeniza el texto normalizado
   * IMPORTANTE: Esta es una tokenización básica. 
   * T5 usa SentencePiece que debe ser replicado exactamente.
   */
  private tokenize(text: string): string[] {
    const pattern = /([?{}.,;()[\]]|\w+)/g;
    const matches = text.match(pattern);
    return matches || [];
  }

  /**
   * Reensambla tokens en texto
   */
  private detokenize(tokens: string[]): string {
    return tokens.join(' ')
      .replace(/\s+([?{}.,;()[\]])/g, '$1')
      .replace(/([?{}.,;()[\]])\s+/g, '$1 ')
      .trim();
  }

  /**
   * Verifica si un ID es un token especial
   */
  private isSpecialToken(id: number): boolean {
    return id === this.config.padTokenId || 
           id === this.config.eosTokenId || 
           id === this.config.unkTokenId;
  }

  /**
   * Añade padding a una secuencia
   */
  pad(ids: number[], maxLength: number): number[] {
    if (ids.length >= maxLength) {
      return ids.slice(0, maxLength);
    }
    return [...ids, ...Array(maxLength - ids.length).fill(this.config.padTokenId)];
  }

  /**
   * Crea attention mask
   */
  createAttentionMask(ids: number[]): number[] {
    return ids.map(id => id === this.config.padTokenId ? 0 : 1);
  }
}

/**
 * Carga el vocabulario desde un archivo JSON
 * Este archivo debe ser exportado durante el entrenamiento del modelo
 */
export async function loadVocabulary(vocabPath: string): Promise<Record<string, number>> {
  try {
    const response = await fetch(vocabPath);
    if (!response.ok) {
      throw new Error(`Failed to load vocabulary: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading vocabulary:', error);
    throw error;
  }
}

/**
 * Crea una instancia del tokenizer
 */
export async function createTokenizer(
  vocabPath?: string,
  config?: Partial<TokenizerConfig>
): Promise<SimpleTokenizer> {
  let vocabData: Record<string, number> | undefined;
  
  if (vocabPath) {
    try {
      vocabData = await loadVocabulary(vocabPath);
    } catch (error) {
      console.warn('Using basic vocabulary due to load error:', error);
    }
  }

  return new SimpleTokenizer(vocabData, config);
}
