#!/bin/bash

# ==============================================================================
# SPARQL Naturalizer - Development Setup Script
# ==============================================================================
# Configura el entorno de desarrollo:
# - Inicia Docker Compose
# - Descarga modelos de LLM y embeddings en Ollama
# - Instala dependencias de Node.js
# - Inicia el servidor de desarrollo
# ==============================================================================

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuración
CONTAINER_NAME="sparql-ollama"
DEFAULT_LLM_MODEL="llama3.1:8b"
DEFAULT_EMBED_MODEL="nomic-embed-text"

# ==============================================================================
# Funciones de utilidad
# ==============================================================================

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       SPARQL Naturalizer - Development Setup                  ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# ==============================================================================
# Verificar prerequisitos
# ==============================================================================

check_prerequisites() {
    print_step "Verificando prerequisitos..."
    
    # Verificar Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker no está instalado. Por favor instala Docker primero."
        exit 1
    fi
    
    # Verificar Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose no está instalado. Por favor instala Docker Compose primero."
        exit 1
    fi
    
    # Verificar Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js no está instalado. Por favor instala Node.js primero."
        exit 1
    fi
    
    # Verificar npm
    if ! command -v npm &> /dev/null; then
        print_error "npm no está instalado. Por favor instala npm primero."
        exit 1
    fi
    
    print_success "Todos los prerequisitos están instalados"
}

# ==============================================================================
# Selección de modelos
# ==============================================================================

select_llm_model() {
    echo -e "\n${BLUE}Selecciona el modelo LLM a usar:${NC}"
    echo "1) llama3.1:8b (Default - 4.7GB, mejor precisión)"
    echo "2) gemma2:2b (1.6GB, más rápido)"
    echo "3) gemma3:4b (3.3GB, balance)"
    echo "4) phi3:3.8b (2.2GB, rápido y preciso)"
    echo "5) phi4-mini:3.8b (2.5GB, última versión Phi)"
    echo "6) qwen3:4b (2.5GB, multilingüe)"
    echo "7) Personalizado (escribir nombre)"
    
    read -p "Opción [1-7] (default: 1): " choice
    choice=${choice:-1}
    
    case $choice in
        1) LLM_MODEL="llama3.1:8b" ;;
        2) LLM_MODEL="gemma2:2b" ;;
        3) LLM_MODEL="gemma3:4b" ;;
        4) LLM_MODEL="phi3:3.8b" ;;
        5) LLM_MODEL="phi4-mini:3.8b" ;;
        6) LLM_MODEL="qwen3:4b" ;;
        7) 
            read -p "Introduce el nombre del modelo: " LLM_MODEL
            ;;
        *) 
            print_warning "Opción inválida, usando default: $DEFAULT_LLM_MODEL"
            LLM_MODEL=$DEFAULT_LLM_MODEL
            ;;
    esac
    
    print_success "Modelo LLM seleccionado: $LLM_MODEL"
}

select_embed_model() {
    echo -e "\n${BLUE}Selecciona el modelo de embeddings:${NC}"
    echo "1) nomic-embed-text (Default - 274MB, mejor para búsquedas)"
    echo "2) mxbai-embed-large (670MB, alta precisión)"
    echo "3) all-minilm (47MB, ligero y rápido)"
    echo "4) Usar mismo modelo LLM (no recomendado, lento)"
    
    read -p "Opción [1-4] (default: 1): " choice
    choice=${choice:-1}
    
    case $choice in
        1) EMBED_MODEL="nomic-embed-text" ;;
        2) EMBED_MODEL="mxbai-embed-large" ;;
        3) EMBED_MODEL="all-minilm" ;;
        4) EMBED_MODEL=$LLM_MODEL ;;
        *) 
            print_warning "Opción inválida, usando default: $DEFAULT_EMBED_MODEL"
            EMBED_MODEL=$DEFAULT_EMBED_MODEL
            ;;
    esac
    
    print_success "Modelo embeddings seleccionado: $EMBED_MODEL"
}

# ==============================================================================
# Docker y Ollama
# ==============================================================================

start_docker() {
    print_step "Iniciando Docker Compose..."
    
    if docker ps | grep -q $CONTAINER_NAME; then
        print_warning "El contenedor $CONTAINER_NAME ya está corriendo"
    else
        docker-compose up -d
        print_success "Docker Compose iniciado"
        
        # Esperar a que Ollama esté listo
        print_step "Esperando a que Ollama esté listo..."
        for i in {1..30}; do
            if docker exec $CONTAINER_NAME ollama --version &> /dev/null; then
                print_success "Ollama está listo"
                break
            fi
            echo -n "."
            sleep 2
        done
        echo ""
    fi
}

download_models() {
    print_step "Descargando modelos en Ollama..."
    
    # Descargar modelo LLM
    echo -e "\n${BLUE}📥 Descargando modelo LLM: $LLM_MODEL${NC}"
    echo "   (Esto puede tardar varios minutos dependiendo del tamaño del modelo)"
    
    if docker exec $CONTAINER_NAME ollama list | grep -q "$LLM_MODEL"; then
        print_warning "Modelo $LLM_MODEL ya está descargado"
    else
        docker exec $CONTAINER_NAME ollama pull $LLM_MODEL
        print_success "Modelo LLM descargado: $LLM_MODEL"
    fi
    
    # Descargar modelo de embeddings (si es diferente)
    if [ "$EMBED_MODEL" != "$LLM_MODEL" ]; then
        echo -e "\n${BLUE}📥 Descargando modelo embeddings: $EMBED_MODEL${NC}"
        
        if docker exec $CONTAINER_NAME ollama list | grep -q "$EMBED_MODEL"; then
            print_warning "Modelo $EMBED_MODEL ya está descargado"
        else
            docker exec $CONTAINER_NAME ollama pull $EMBED_MODEL
            print_success "Modelo embeddings descargado: $EMBED_MODEL"
        fi
    fi
    
    # Mostrar modelos descargados
    echo -e "\n${GREEN}Modelos disponibles en Ollama:${NC}"
    docker exec $CONTAINER_NAME ollama list
    
    # Pre-calentar modelos (cargarlos en memoria)
    echo -e "\n${YELLOW}🔥 Pre-calentando modelos (esto los carga en memoria)...${NC}"
    echo "   (Esto evitará la latencia de 50s en la primera consulta)"
    
    # Calentar modelo LLM
    echo -e "${CYAN}   Espere... Cargando modelo LLM: $LLM_MODEL${NC}"
    docker exec $CONTAINER_NAME ollama run $LLM_MODEL "test" > /dev/null 2>&1 &
    WARMUP_PID=$!
    
    # Calentar modelo embeddings
    echo -e "${CYAN}   Espere... Cargando modelo embeddings: $EMBED_MODEL${NC}"
    docker exec $CONTAINER_NAME ollama run $EMBED_MODEL "test" > /dev/null 2>&1
    
    # Esperar a que termine el LLM
    wait $WARMUP_PID 2>/dev/null
    
    print_success "Modelos pre-calentados y listos para usar"
}

# ==============================================================================
# Configuración de Node.js
# ==============================================================================

setup_nodejs() {
    print_step "Configurando Node.js..."
    
    # Verificar si node_modules existe
    if [ ! -d "node_modules" ]; then
        print_step "Instalando dependencias de npm..."
        npm install
        print_success "Dependencias instaladas"
    else
        print_warning "node_modules ya existe, saltando instalación"
        read -p "¿Reinstalar dependencias? (y/N): " reinstall
        if [ "$reinstall" = "y" ] || [ "$reinstall" = "Y" ]; then
            npm install
            print_success "Dependencias reinstaladas"
        fi
    fi
}

setup_env_file() {
    print_step "Configurando variables de entorno..."
    
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# Ollama Configuration
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=$LLM_MODEL
OLLAMA_EMBEDDINGS_MODEL=$EMBED_MODEL

# Next.js Configuration
NEXT_PUBLIC_APP_NAME=SPARQL Naturalizer
NEXT_PUBLIC_APP_VERSION=1.1.0

# Optional: Disable streaming
# ENABLE_STREAMING=false
EOF
        print_success "Archivo .env creado"
    else
        print_warning "El archivo .env ya existe"
        
        # Actualizar modelos si cambiaron
        if grep -q "OLLAMA_MODEL=" .env; then
            sed -i "s/OLLAMA_MODEL=.*/OLLAMA_MODEL=$LLM_MODEL/" .env
            print_success "Modelo LLM actualizado en .env"
        fi
        
        # Añadir o actualizar modelo de embeddings
        if grep -q "OLLAMA_EMBEDDINGS_MODEL=" .env; then
            sed -i "s/OLLAMA_EMBEDDINGS_MODEL=.*/OLLAMA_EMBEDDINGS_MODEL=$EMBED_MODEL/" .env
        else
            sed -i "/OLLAMA_MODEL=/a OLLAMA_EMBEDDINGS_MODEL=$EMBED_MODEL" .env
        fi
        print_success "Modelo embeddings actualizado en .env"
    fi
    
    echo -e "\n${BLUE}Configuración actual (.env):${NC}"
    cat .env
}

# ==============================================================================
# Inicio del servidor
# ==============================================================================

start_dev_server() {
    print_step "Iniciando servidor de desarrollo..."
    
    echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Servidor listo! Abre: http://localhost:3000                  ║${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║  Modelo LLM:        $LLM_MODEL${NC}"
    echo -e "${GREEN}║  Modelo Embeddings: $EMBED_MODEL${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║  Presiona Ctrl+C para detener                                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    npm run dev
}

# ==============================================================================
# Menú principal
# ==============================================================================

show_menu() {
    echo -e "\n${BLUE}¿Qué deseas hacer?${NC}"
    echo "1) Setup completo (recomendado para primera vez)"
    echo "2) Solo iniciar Docker + descargar modelos"
    echo "3) Solo iniciar servidor de desarrollo"
    echo "4) Ver modelos descargados"
    echo "5) Cambiar modelo LLM"
    echo "6) Salir"
    
    read -p "Opción [1-6]: " menu_choice
    
    case $menu_choice in
        1)
            select_llm_model
            select_embed_model
            start_docker
            download_models
            setup_nodejs
            setup_env_file
            start_dev_server
            ;;
        2)
            select_llm_model
            select_embed_model
            start_docker
            download_models
            ;;
        3)
            start_dev_server
            ;;
        4)
            docker exec $CONTAINER_NAME ollama list
            show_menu
            ;;
        5)
            select_llm_model
            setup_env_file
            print_success "Modelo actualizado. Reinicia el servidor para aplicar cambios."
            show_menu
            ;;
        6)
            print_success "¡Hasta luego!"
            exit 0
            ;;
        *)
            print_error "Opción inválida"
            show_menu
            ;;
    esac
}

# ==============================================================================
# Script principal
# ==============================================================================

main() {
    print_header
    check_prerequisites
    
    # Si se pasa un argumento, ejecutar sin menú
    if [ $# -eq 0 ]; then
        show_menu
    else
        case $1 in
            --quick)
                LLM_MODEL=$DEFAULT_LLM_MODEL
                EMBED_MODEL=$DEFAULT_EMBED_MODEL
                start_docker
                download_models
                setup_nodejs
                setup_env_file
                start_dev_server
                ;;
            --models-only)
                select_llm_model
                select_embed_model
                start_docker
                download_models
                ;;
            --dev)
                start_dev_server
                ;;
            --help)
                echo "Uso: $0 [OPCIÓN]"
                echo ""
                echo "Opciones:"
                echo "  (sin argumentos)  Mostrar menú interactivo"
                echo "  --quick          Setup rápido con modelos por defecto"
                echo "  --models-only    Solo descargar modelos"
                echo "  --dev            Solo iniciar servidor de desarrollo"
                echo "  --help           Mostrar esta ayuda"
                ;;
            *)
                print_error "Opción desconocida: $1"
                echo "Usa --help para ver opciones disponibles"
                exit 1
                ;;
        esac
    fi
}

# Ejecutar script principal
main "$@"
