# SPARQL Naturalizer

Aplicación web que traduce consultas en lenguaje natural a SPARQL usando inteligencia artificial, optimizada para catálogos de datos abiertos DCAT-AP-ES.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16+-black.svg)

## Características

- **Traducción Lenguaje Natural → SPARQL**: Convierte preguntas en español a consultas SPARQL válidas
- **RAG (Retrieval-Augmented Generation)**: Sistema de recuperación de documentos con knowledge base especializada en web semántica.
- **Múltiples proveedores LLM**: Soporta Ollama (local), GitHub Models, OpenRouter y OpenAI
- **Editor SPARQL integrado**: Interfaz YASGUI con resaltado de sintaxis y ejecución directa
- **Optimizado para DCAT-AP-ES**: Knowledge base con vocabularios controlados, patrones SPARQL y ejemplos documentados
- **Endpoints configurables**: datos.gob.es, data.europa.eu y endpoints personalizados
- **Validación de sintaxis**: Verificación automática de consultas SPARQL generadas

## Instalación

### Inicio Rápido con Ollama (Docker)

Para iniciar rápidamente con Ollama dockerizado (recomendado para desarrollo local):

```bash
git clone https://github.com/mjanez/sparql-naturalizer.git
cd sparql-naturalizer
chmod +x setup-dev.sh
./setup-dev.sh
```

> El script interactivo:
> 1. Verifica prerrequisitos (Docker, Node.js)
> 2. Inicia Docker Compose con Ollama
> 3. Te permite elegir modelos LLM y embeddings
> 4. Descarga y precarga los modelos en memoria
> 5. Configura el archivo `.env` automáticamente
> 6. Instala dependencias npm e indexa la knowledge base
> 7. Inicia el servidor de desarrollo en http://localhost:3000

**Opciones disponibles:**
```bash
./setup-dev.sh               # Menú interactivo (recomendado)
./setup-dev.sh --quick       # Setup rápido con llama3.1:8b + nomic-embed-text
./setup-dev.sh --models-only # Solo descargar modelos
./setup-dev.sh --dev         # Solo iniciar servidor
```

**Modelos LLM disponibles:**
- `llama3.1:8b` (4.7GB, mejor precisión) - **Recomendado**
- `gemma2:2b` (1.6GB, más rápido)
- `phi3:3.8b` (2.2GB, rápido y preciso)
- `qwen3:4b` (2.5GB, multilingüe)

**Modelos embeddings:**
- `nomic-embed-text` (274MB, mejor para búsquedas) - **Recomendado**
- `mxbai-embed-large` (670MB, alta precisión)
- `all-minilm` (47MB, ligero y rápido)

### Instalación Manual

#### Prerrequisitos

- [Node.js 18+ y npm](https://nodejs.org/)
- Proveedor LLM:
  - [**Ollama**](https://ollama.com/) (local): Docker + docker-compose
  - [**GitHub Models**](https://docs.github.com/es/github-models): Personal Access Token con scope `models:read`
  - [**OpenAI**](https://openai.com/es-ES/api/): API Key

#### 1. Clonar el Repositorio

```bash
git clone https://github.com/mjanez/sparql-naturalizer.git
cd sparql-naturalizer
```

#### 2. Instalar Dependencias

```bash
npm install
```

#### 3. Configurar Variables de Entorno

Copia `.env.example` a `.env` y configura tu proveedor LLM preferido:

```bash
cp .env.example .env
```

Ver sección "Configuración" más abajo para detalles de cada proveedor.

#### 4. Indexar Knowledge Base

La aplicación requiere una knowledge base vectorizada para el sistema RAG:

```bash
npm run index-kb
```

Este proceso:
- Lee los documentos markdown de `context/knowledge-base/`
- Genera embeddings con el modelo configurado (por defecto: `nomic-embed-text`)
- Guarda el vector store en `context/vector-store.json` (archivo no versionado en Git)

> [!NOTE]
> El archivo `vector-store.json` está en `.gitignore` para evitar sobrecargar el repositorio. Cada usuario debe ejecutar `npm run index-kb` después de clonar el proyecto.

#### 5. Ejecutar la Aplicación

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Configuración

### Proveedores de LLM

La aplicación soporta múltiples proveedores de IA. Edita `.env` (copia desde `.env.example`):

#### **Ollama** (Recomendado - Local)
```bash
LLM_PROVIDER=ollama
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBEDDINGS_MODEL=nomic-embed-text
```
> [!NOTE]
>✅ **Ventajas**: Gratis, rápido, sin límites, privado
>❌ **Requisitos**: GPU local

#### **GitHub Models** (Gratis con límites)
```bash
LLM_PROVIDER=github
GITHUB_TOKEN=ghp_TuTokenAqui...
GITHUB_MODEL=openai/gpt-4.1-mini  # o gpt-5-mini, llama-4-scout, deepseek-r1...
```
> [!NOTE]
> ✅ **Ventajas**: Gratis, **42 modelos** (OpenAI GPT-5, Meta Llama 4, DeepSeek, Microsoft Phi, Mistral, xAI Grok)
> ❌ **Limitaciones**: Rate limits, requiere internet

**Modelos destacados**:
- `openai/gpt-5-mini` - Cost-effective, 200K context
- `openai/gpt-4.1-mini` - Best coding/reasoning, 1M context
- `meta/llama-4-scout-17b-16e-instruct` - **10M context window!**
- `deepseek/deepseek-r1-0528` - Advanced reasoning
- `microsoft/phi-4-multimodal-instruct` - Text+audio+image

**Lista completa de modelos**:
```bash
curl -L -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://models.github.ai/catalog/models
```

####  **OpenAI**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Configurar Endpoints SPARQL

La aplicación incluye endpoints predefinidos para catálogos DCAT-AP-ES:

```typescript
const endpoints = [
  { name: 'datos.gob.es', url: 'https://datos.gob.es/virtuoso/sparql' },
  { name: 'data.europa.eu', url: 'https://data.europa.eu/sparql' },
];
```

Puedes cambiar el endpoint en la interfaz o modificar el array en `app/page.tsx`.

### Ajustar Parámetros del Modelo

En `lib/modelService.ts`:

```typescript
this.config = {
  modelPath: '/tfjs_model/model.json',
```

## Ejemplos de Uso

### Consultas sobre Datasets DCAT-AP-ES

1. **"Dame todos los datasets en formato [CSV](http://publications.europa.eu/resource/authority/file-type/CSV)"**
   ```sparql
   PREFIX dcat: <http://www.w3.org/ns/dcat#>
   PREFIX dct: <http://purl.org/dc/terms/>
   SELECT DISTINCT ?dataset ?title WHERE {
     ?dataset a dcat:Dataset .
     ?dataset dct:title ?title .
     ?dataset dcat:distribution ?dist .
     ?dist dct:format <http://publications.europa.eu/resource/authority/file-type/CSV> .
     FILTER (lang(?title) = 'es')
   } LIMIT 100
   ```

2. **"Lista datasets sobre [salud](http://datos.gob.es/kos/sector-publico/sector/salud>)"**
   ```sparql
   PREFIX dcat: <http://www.w3.org/ns/dcat#>
   PREFIX dct: <http://purl.org/dc/terms/>
   SELECT DISTINCT ?dataset ?title WHERE {
     ?dataset a dcat:Dataset .
     ?dataset dct:title ?title .
     ?dataset dcat:theme <http://datos.gob.es/kos/sector-publico/sector/salud> .
     FILTER (lang(?title) = 'es')
   } LIMIT 100
   ```

3. **"Busca datasets publicados por el [Ministerio de Sanidad](http://datos.gob.es/recurso/sector-publico/org/Organismo/E05070101)"**
   ```sparql
   PREFIX dcat: <http://www.w3.org/ns/dcat#>
   PREFIX dct: <http://purl.org/dc/terms/>
   PREFIX foaf: <http://xmlns.com/foaf/0.1/>
   SELECT DISTINCT ?dataset ?title WHERE {
     ?dataset a dcat:Dataset .
     ?dataset dct:title ?title .
     ?dataset dct:publisher ?publisher .
     ?publisher foaf:name ?name .
     ?publisher dct:identifier "E05070101" .
   } LIMIT 100
   ```

### Vocabularios Controlados DCAT-AP-ES

La knowledge base incluye mapeos de vocabularios oficiales:

#### Formatos de Archivo (dct:format)
- URI Base: `http://publications.europa.eu/resource/authority/file-type/`
- Ejemplos: CSV, JSON, XML, RDF_XML, PDF, XLSX

#### Temas de Datos (dcat:theme)
- URI España: `http://datos.gob.es/kos/sector-publico/sector/`
- URI Europa: `http://publications.europa.eu/resource/authority/data-theme/`
- Ejemplos: HEAL (salud), ENVI (medio ambiente), TRAN (transporte), ECON (economía)

#### Frecuencia de Actualización (dct:accrualPeriodicity)
- URI Base: `http://publications.europa.eu/resource/authority/frequency/`
- Ejemplos: DAILY, WEEKLY, MONTHLY, ANNUAL

Ver documentación completa: [DCAT-AP-ES](https://datosgobes.github.io/DCAT-AP-ES/)

## Solución de Problemas

### Error: "LLM provider not available"

Verifica la configuración de tu proveedor LLM:

**Ollama:**
```bash
# Verificar que Ollama está corriendo
curl http://localhost:11434/api/tags

# Si no está instalado, descarga desde https://ollama.ai
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

**GitHub Models:**
```bash
# Verificar token
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
     https://models.github.ai/catalog/models
```

### Error: "Vector store not found"

Re-indexa la knowledge base:

```bash
npm run index-kb
```

Si el problema persiste, fuerza re-indexación:

```bash
npm run index-kb:reset
```

## Despliegue

### Vercel

```bash
npm i -g vercel
vercel
```

Configura las variables de entorno en el dashboard de Vercel.

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

**Build:**
```bash
docker build -t sparql-naturalizer .
docker run -p 3000:3000 \
  -e LLM_PROVIDER=ollama \
  -e OLLAMA_API_URL=http://host.docker.internal:11434 \
  sparql-naturalizer
```

## Licencia

El código fuente esta licenciado bajo `CC-BY 4.0`  - Ver `LICENSE` para más detalles.

> [!CAUTION]
> Los productos generados por IA pueden estar sujetos a términos adicionales según el proveedor LLM utilizado.

## Referencias

- [DCAT-AP-ES](https://datosgobes.github.io/DCAT-AP-ES/) - Perfil de aplicación español
- [DCAT-AP](https://joinup.ec.europa.eu/collection/semic) - Perfil europeo
- [datos.gob.es](https://datos.gob.es/) - Catálogo nacional de datos abiertos
- [data.europa.eu](https://data.europa.eu/) - Portal europeo de datos
- [LangChain](https://langchain.com/) - Framework para aplicaciones LLM
- [Next.js](https://nextjs.org/) - Framework React
- [YASGUI](https://triply.cc/docs/yasgui) - Editor SPARQL

## Contacto

Para preguntas o sugerencias, abre un issue en GitHub.
