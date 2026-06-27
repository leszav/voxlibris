#!/bin/bash

# Voxlibris Platform Service Manager v1.0
# Унифицированный скрипт управления всеми сервисами платформы Voxlibris Platform

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Константы
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/xlibris-manager.log"
ENV_FILE="$SCRIPT_DIR/.env"
BACKEND_PID=""

# Создание папки для логов
mkdir -p "$LOG_DIR"

# Функция логирования
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# Функция вывода с логированием
print_log() {
    local color="$1"
    local level="$2"
    shift 2
    local message="$*"
    echo -e "${color}$message${NC}"
    log "$level" "$message"
}

# Проверка наличия .env файла
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        print_log "$YELLOW" "WARN" "⚠️  Файл .env не найден, используются значения по умолчанию"
        return 0
    fi
    print_log "$GREEN" "INFO" "✅ Файл .env найден"
}

# Проверка зависимостей
check_dependencies() {
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v pnpm &> /dev/null; then
        missing_deps+=("pnpm")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_log "$RED" "ERROR" "❌ Отсутствуют зависимости: ${missing_deps[*]}"
        echo -e "${YELLOW}Установите недостающие зависимости:${NC}"
        for dep in "${missing_deps[@]}"; do
            echo -e "  - $dep"
        done
        exit 1
    fi
    
    print_log "$GREEN" "INFO" "✅ Все зависимости установлены"
}

# Проверка статуса Docker сервисов
check_docker_services() {
    local services=("postgres" "minio" "redis" "icecast")
    local running_services=()
    local stopped_services=()
    
    for service in "${services[@]}"; do
        if docker compose ps --services --filter "status=running" | grep -q "^$service$"; then
            running_services+=("$service")
        else
            stopped_services+=("$service")
        fi
    done
    
    if [ ${#running_services[@]} -gt 0 ]; then
        print_log "$GREEN" "INFO" "🟢 Запущенные сервисы: ${running_services[*]}"
    fi
    
    if [ ${#stopped_services[@]} -gt 0 ]; then
        print_log "$YELLOW" "WARN" "🔴 Остановленные сервисы: ${stopped_services[*]}"
    fi
}

# Проверка статуса порта
check_port() {
    local port="$1"
    local timeout=3
    
    if timeout "$timeout" bash -c "</dev/tcp/localhost/$port" 2>/dev/null; then
        return 0  # Порт доступен
    else
        return 1  # Порт недоступен
    fi
}

# Ожидание доступности порта с проверкой, что процесс не завершился раньше времени
wait_for_port() {
    local port="$1"
    local label="$2"
    local max_attempts="${3:-30}"
    local delay_seconds="${4:-1}"
    local attempt=1

    print_log "$CYAN" "INFO" "⏳ Ожидание готовности $label на порту $port..."

    while [ $attempt -le $max_attempts ]; do
        if check_port "$port"; then
            print_log "$GREEN" "INFO" "✅ $label готов на порту $port"
            return 0
        fi

        if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            print_log "$RED" "ERROR" "❌ Процесс $label завершился до готовности порта $port"
            return 1
        fi

        echo -n "."
        sleep "$delay_seconds"
        ((attempt++))
    done

    echo ""
    print_log "$RED" "ERROR" "❌ $label не стал доступен на порту $port за ${max_attempts} попыток"
    return 1
}

# Остановка локальных dev-процессов приложения (без PostgreSQL)
stop_local_dev_processes() {
    local ports=(3000 4010 5000)
    local pids=""

    for port in "${ports[@]}"; do
        pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            for pid in $pids; do
                kill "$pid" 2>/dev/null || true
            done
            sleep 1

            # Если процесс не завершился мягко, завершаем принудительно
            pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
            if [[ -n "$pids" ]]; then
                for pid in $pids; do
                    kill -9 "$pid" 2>/dev/null || true
                done
            fi
            print_log "$GREEN" "INFO" "✅ Освобожден порт $port"
        else
            print_log "$GREEN" "INFO" "✅ Порт $port уже свободен"
        fi
    done
}

# Запуск локального YooKassa emulator для UI/dev checkout flow
start_yookassa_emulator() {
    local emulator_script="$SCRIPT_DIR/.tmp/yooksssa_emulator/server.mjs"

    if [ ! -f "$emulator_script" ]; then
        print_log "$YELLOW" "WARN" "⚠️  YooKassa emulator не найден: $emulator_script"
        return 0
    fi

    if check_port 4010; then
        print_log "$GREEN" "INFO" "✅ YooKassa emulator уже запущен (http://127.0.0.1:4010)"
        return 0
    fi

    print_log "$BLUE" "INFO" "💳 Запуск YooKassa emulator..."
    YOOKASSA_EMULATOR_WEBHOOK_URL="${YOOKASSA_EMULATOR_WEBHOOK_URL:-http://127.0.0.1:5000/api/commerce/webhooks/yookassa}" \
        node "$emulator_script" \
        > >(sed 's/^/[yookassa-emulator] /') \
        2> >(sed 's/^/[yookassa-emulator] /' >&2) &

    wait_for_port 4010 "YooKassa emulator" 20 1
}

# Проверка: занят ли PostgreSQL порт внешним процессом
is_postgres_port_occupied() {
    lsof -tiTCP:5432 -sTCP:LISTEN >/dev/null 2>&1
}

# Показать владельца порта PostgreSQL
print_postgres_port_owner() {
    local owner_info
    owner_info=$(lsof -nP -iTCP:5432 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1 "(PID:" $2 ")"}' | paste -sd ', ' -)

    if [[ -n "$owner_info" ]]; then
        print_log "$YELLOW" "WARN" "ℹ️ Порт 5432 уже занят: $owner_info"
    else
        print_log "$YELLOW" "WARN" "ℹ️ Порт 5432 уже занят внешним процессом"
    fi
}

# Проверка статуса приложений
check_app_services() {
    echo -e "${CYAN}Статус приложений:${NC}"
    
    # Проверка Backend (порт 5000)
    if check_port 5000; then
        echo -e "  🟢 Backend API: ${GREEN}Запущен${NC} (http://localhost:5000)"
    else
        echo -e "  🔴 Backend API: ${RED}Остановлен${NC} (http://localhost:5000)"
    fi
    
    # Проверка Frontend (порт 3000)
    if check_port 3000; then
        echo -e "  🟢 Frontend: ${GREEN}Запущен${NC} (http://localhost:3000)"
    else
        echo -e "  🔴 Frontend: ${RED}Остановлен${NC} (http://localhost:3000)"
    fi

    # Проверка Icecast (порт 8000)
    if check_port 8000; then
        echo -e "  🟢 Icecast: ${GREEN}Запущен${NC} (http://localhost:8000)"
    else
        echo -e "  🔴 Icecast: ${RED}Остановлен${NC} (http://localhost:8000)"
    fi

    # Проверка YooKassa emulator (порт 4010)
    if check_port 4010; then
        echo -e "  🟢 YooKassa emulator: ${GREEN}Запущен${NC} (http://127.0.0.1:4010)"
    else
        echo -e "  🔴 YooKassa emulator: ${RED}Остановлен${NC} (http://127.0.0.1:4010)"
    fi
}

# Запуск Icecast
start_icecast() {
    print_log "$BLUE" "INFO" "🎙️  Запуск Icecast..."
    docker compose up -d icecast
    
    local max_attempts=15
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if check_port 8000; then
            print_log "$GREEN" "INFO" "✅ Icecast готов (http://localhost:8000)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    
    print_log "$YELLOW" "WARN" "⚠️  Icecast не ответил за ${max_attempts}с — продолжаем без него"
    return 0  # Не блокируем запуск если Icecast недоступен
}

# Запуск Docker сервисов
start_docker_services() {
    print_log "$BLUE" "INFO" "🚀 Запуск Docker сервисов..."

    if check_port 5432 && ! docker compose ps --services --filter "status=running" | grep -q "^postgres$"; then
        print_postgres_port_owner
        print_log "$YELLOW" "WARN" "⚠️ Обнаружен PostgreSQL на :5432 вне docker compose. Не используем его повторно: останавливаем compose-окружение и поднимаем контейнеры начисто, чтобы избежать подключения к старому экземпляру."
    fi

    docker compose down --remove-orphans 2>/dev/null || true
    docker compose up -d postgres minio redis

    start_icecast
    
    # Ожидание готовности сервисов
    print_log "$CYAN" "INFO" "⏳ Ожидание готовности сервисов..."
    sleep 5
    
    # Проверка здоровья сервисов
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        local minio_ready=0
        local postgres_ready=0

        if docker compose ps --services --filter "status=running" | grep -q "^minio$"; then
            minio_ready=1
        fi

        if docker compose ps --services --filter "status=running" | grep -q "^postgres$"; then
            postgres_ready=1
        fi

        if [[ $minio_ready -eq 1 && $postgres_ready -eq 1 ]]; then
            print_log "$GREEN" "INFO" "✅ Все сервисы готовы к работе"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    print_log "$RED" "ERROR" "❌ Сервисы не готовы после $max_attempts попыток"
    return 1
}

# Остановка Docker сервисов
stop_docker_services() {
    print_log "$BLUE" "INFO" "🛑 Остановка Docker сервисов..."

    print_log "$BLUE" "INFO" "🧹 Остановка локальных dev-процессов на портах проекта..."
    if stop_local_dev_processes; then
        print_log "$GREEN" "INFO" "✅ Локальные dev-процессы остановлены"
    else
        print_log "$YELLOW" "WARN" "⚠️ Не удалось полностью остановить dev-процессы, продолжаем остановку Docker"
    fi

    docker compose down
    print_log "$GREEN" "INFO" "✅ Сервисы остановлены"
}

# Инициализация хранилища
init_storage() {
    print_log "$BLUE" "INFO" "🗄️  Инициализация хранилища..."
    if pnpm run init-storage; then
        print_log "$GREEN" "INFO" "✅ Хранилище инициализировано"
    else
        print_log "$RED" "ERROR" "❌ Ошибка инициализации хранилища"
        return 1
    fi
}

# Запуск приложения в режиме разработки
start_dev() {
    print_log "$BLUE" "INFO" "🚀 Запуск приложения в режиме разработки..."
    
    # Освобождение портов
    stop_local_dev_processes
    
    # Запуск сервисов
    start_docker_services || return 1
    
    # Инициализация хранилища
    init_storage || return 1

    # Запуск YooKassa emulator до backend, чтобы checkout сразу работал из UI
    start_yookassa_emulator || return 1
     
    # Запуск backend с ожиданием готовности до старта frontend
    print_log "$GREEN" "INFO" "🌟 Запуск backend..."
    pnpm run dev:server \
        > >(sed 's/^/[backend] /') \
        2> >(sed 's/^/[backend] /' >&2) &
    BACKEND_PID=$!

    wait_for_port 5000 "Backend API" 60 1 || return 1

    print_log "$GREEN" "INFO" "🌐 Backend готов, запускаем frontend..."
    pnpm run dev:client
}

# Сборка проекта
build_project() {
    print_log "$BLUE" "INFO" "🔨 Сборка проекта..."
    if pnpm run build; then
        print_log "$GREEN" "INFO" "✅ Проект собран успешно"
    else
        print_log "$RED" "ERROR" "❌ Ошибка сборки проекта"
        return 1
    fi
}

# Проверка типов
check_types() {
    print_log "$BLUE" "INFO" "🔍 Проверка типов TypeScript..."
    if pnpm run check; then
        print_log "$GREEN" "INFO" "✅ Типы корректны"
    else
        print_log "$RED" "ERROR" "❌ Ошибки типизации"
        return 1
    fi
}

# Показать статус всех сервисов
show_status() {
    echo -e "${CYAN}=== Voxlibris Platform Service Status ===${NC}"
    echo ""
    
    check_docker_services
    
    echo ""
    check_app_services
    
    echo ""
    echo -e "${CYAN}Docker Compose Services:${NC}"
    docker compose ps
    
    echo ""
    echo -e "${CYAN}Порты:${NC}"
    echo -e "  🌐 Frontend: http://localhost:3000"
    echo -e "  🔧 Backend API: http://localhost:5000"
    echo -e "  🗄️  PostgreSQL: localhost:5432"
    echo -e "  📦 MinIO: http://localhost:9000 (Console: http://localhost:9001)"
    echo -e "  🔴 Redis: localhost:6379"
    echo -e "  🎙️  Icecast: http://localhost:8000 (Admin: http://localhost:8000/admin)"
    echo -e "  💳 YooKassa emulator: http://127.0.0.1:4010"
}

# Очистка логов
clean_logs() {
    print_log "$BLUE" "INFO" "🧹 Очистка логов..."
    rm -f "$LOG_FILE"
    print_log "$GREEN" "INFO" "✅ Логи очищены"
}

# Быстрая проверка compliance (30 сек)
compliance_check() {
    print_log "$BLUE" "INFO" "🔍 Проверка системы compliance..."
    local failed_checks=0
    
    echo -e "${CYAN}=== Voxlibris Platform Compliance Check ===${NC}"
    echo ""
    
    # 1. Проверка структуры проекта
    echo -n "1. Структура проекта: "
    if [[ -f "xlibris-manager.sh" && -f "pnpm-workspace.yaml" && -f "package.json" ]]; then
        echo -e "${GREEN}OK${NC}"
        print_log "INFO" "INFO" "✅ Структура проекта корректна"
    else
        echo -e "${RED}FAIL${NC} - отсутствуют ключевые файлы"
        print_log "ERROR" "ERROR" "❌ Нарушена структура проекта"
        ((failed_checks++))
    fi
    
    # 2. Проверка блокирующих aliases
    echo -n "2. Блокирующие aliases: "
    if [[ -f "scripts/setup-compliance-aliases.sh" ]]; then
        if grep -q "npm()" scripts/setup-compliance-aliases.sh && grep -q "npx()" scripts/setup-compliance-aliases.sh; then
            echo -e "${GREEN}OK${NC}"
            print_log "INFO" "INFO" "✅ Блокирующие aliases настроены"
        else
            echo -e "${RED}FAIL${NC} - aliases неполные"
            print_log "ERROR" "ERROR" "❌ Неполные блокирующие aliases"
            ((failed_checks++))
        fi
    else
        echo -e "${RED}FAIL${NC} - скрипт aliases отсутствует"
        print_log "ERROR" "ERROR" "❌ Отсутствует setup-compliance-aliases.sh"
        ((failed_checks++))
    fi
    
    # 3. Проверка исполняемости xlibris-manager.sh
    echo -n "3. xlibris-manager.sh: "
    if [[ -x "xlibris-manager.sh" ]]; then
        echo -e "${GREEN}OK${NC}"
        print_log "INFO" "INFO" "✅ xlibris-manager.sh исполняем"
    else
        echo -e "${YELLOW}ИСПРАВЛЕНО${NC} - установлены права"
        chmod +x xlibris-manager.sh 2>/dev/null
        print_log "WARN" "WARN" "⚠️ Исправлены права доступа xlibris-manager.sh"
    fi
    
    # 4. Проверка LTS validation
    echo -n "4. LTS validation: "
    if [[ -f "script/validate-lts.sh" ]]; then
        echo -e "${GREEN}OK${NC}"
        print_log "INFO" "INFO" "✅ LTS validation доступен"
    else
        echo -e "${RED}FAIL${NC} - LTS скрипт отсутствует"
        print_log "ERROR" "ERROR" "❌ Отсутствует script/validate-lts.sh"
        ((failed_checks++))
    fi
    
    echo ""
    if [ $failed_checks -eq 0 ]; then
        echo -e "${GREEN}🎉 Все проверки прошли успешно!${NC}"
        print_log "INFO" "SUCCESS" "🎉 Compliance check: все проверки пройдены"
        return 0
    else
        echo -e "${RED}❌ Обнаружено нарушений: $failed_checks${NC}"
        print_log "ERROR" "ERROR" "❌ Compliance check: $failed_checks нарушений"
        return 1
    fi
}

# Полный статус соблюдения принципов
compliance_dashboard() {
    print_log "$BLUE" "INFO" "📊 Запуск compliance dashboard..."
    
    echo -e "${MAGENTA}📊 Voxlibris Platform Compliance Dashboard${NC}"
    echo -e "${MAGENTA}================================${NC}"
    echo ""
    
    # Проверка версий инструментов (с отключением set -e)
    echo -e "${CYAN}🛠️ Версии инструментов:${NC}"
    
    set +e  # Временно отключаем exit on error
    
    if command -v pnpm >/dev/null 2>&1; then
        local pnpm_version=$(pnpm --version 2>/dev/null || echo "unknown")
        echo -e "   ${GREEN}pnpm: $pnpm_version${NC}"
        print_log "INFO" "SUCCESS" "pnpm версия: $pnpm_version"
    else
        echo -e "   ${RED}pnpm: НЕ УСТАНОВЛЕН${NC}"
        print_log "ERROR" "ERROR" "pnpm не найден"
    fi
    
    if command -v docker >/dev/null 2>&1; then
        local docker_compose_version=$(docker compose version --short 2>/dev/null || echo "недоступен")
        if [[ "$docker_compose_version" != "недоступен" ]]; then
            echo -e "   ${GREEN}docker compose: $docker_compose_version${NC}"
            print_log "INFO" "SUCCESS" "docker compose версия: $docker_compose_version"
        else
            echo -e "   ${RED}docker compose: НЕДОСТУПЕН${NC}"
            print_log "ERROR" "ERROR" "docker compose недоступен"
        fi
    else
        echo -e "   ${RED}docker: НЕ УСТАНОВЛЕН${NC}"
        print_log "ERROR" "ERROR" "docker не найден"
    fi
    
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version 2>/dev/null || echo "unknown")
        echo -e "   ${GREEN}node: $node_version${NC}"
        print_log "INFO" "SUCCESS" "node версия: $node_version"
    else
        echo -e "   ${RED}node: НЕ УСТАНОВЛЕН${NC}"
        print_log "ERROR" "ERROR" "node не найден"
    fi
    
    set -e  # Включаем обратно exit on error
    
    # Проверка compliance скриптов
    echo -e "\n${CYAN}📋 Статус compliance скриптов:${NC}"
    
    local scripts_to_check=(
        "scripts/setup-compliance-aliases.sh"
        "scripts/validate-with-memory.sh"
        "scripts/xlibris-workflow.sh"
        "xlibris-manager.sh"
    )
    
    for script in "${scripts_to_check[@]}"; do
        if [[ -f "$script" ]]; then
            if [[ -x "$script" ]]; then
                echo -e "   ${GREEN}✅ $script (исполняемый)${NC}"
                print_log "INFO" "SUCCESS" "Скрипт доступен: $script"
            else
                echo -e "   ${YELLOW}⚠️ $script (неисполняемый)${NC}"
                print_log "WARN" "WARNING" "Скрипт неисполняемый: $script"
            fi
        else
            echo -e "   ${RED}❌ $script (отсутствует)${NC}"
            print_log "ERROR" "ERROR" "Скрипт отсутствует: $script"
        fi
    done
    
    # Проверка конфигурации workspace
    echo -e "\n${CYAN}⚙️ Конфигурация workspace:${NC}"
    
    if [[ -f "pnpm-workspace.yaml" ]]; then
        echo -e "   ${GREEN}✅ pnpm-workspace.yaml найден${NC}"
        print_log "INFO" "SUCCESS" "pnpm workspace конфигурация найдена"
    else
        echo -e "   ${RED}❌ pnpm-workspace.yaml отсутствует${NC}"
        print_log "ERROR" "ERROR" "pnpm workspace конфигурация отсутствует"
    fi
    
    if [[ -f "package.json" ]]; then
        echo -e "   ${GREEN}✅ package.json найден${NC}"
        print_log "INFO" "SUCCESS" "package.json найден"
        
        if grep -q '"packageManager".*"pnpm@' package.json 2>/dev/null; then
            echo -e "   ${GREEN}✅ Package manager корректно установлен на pnpm${NC}"
            print_log "INFO" "SUCCESS" "Package manager корректно настроен"
        else
            echo -e "   ${YELLOW}⚠️ Package manager не установлен явно на pnpm${NC}"
            print_log "WARN" "WARNING" "Package manager должен быть установлен на pnpm"
        fi
    else
        echo -e "   ${RED}❌ package.json отсутствует${NC}"
        print_log "ERROR" "ERROR" "package.json отсутствует"
    fi
    
    if [[ -f "docker-compose.yml" ]]; then
        echo -e "   ${GREEN}✅ docker-compose.yml найден (consider migrating to 'docker compose')${NC}"
        print_log "INFO" "SUCCESS" "docker-compose.yml найден"
    else
        echo -e "   ${YELLOW}⚠️ docker-compose.yml отсутствует${NC}"
        print_log "WARN" "WARNING" "docker-compose.yml не найден"
    fi
    
    
        echo -e "\n${CYAN}🔒 LTS Compliance:${NC}"

        if [[ -f "script/validate-lts.sh" ]]; then
            echo -e "   ${BLUE}ℹ️ Запуск LTS validation...${NC}"
            # capture output to temp file to show key lines and summary
            TMP_VALIDATION_OUTPUT=$(mktemp /tmp/xlibris_validate_lts.XXXXXX)
            set +e
            bash script/validate-lts.sh --verbose > "$TMP_VALIDATION_OUTPUT" 2>&1
            VALIDATE_EXIT=$?
            set -e

            # Show first 50 lines for context
            echo -e "\n   ${CYAN}--- validate-lts summary (first 50 lines) ---${NC}"
            sed -n '1,50p' "$TMP_VALIDATION_OUTPUT" | sed 's/^/   /'

            # Show last 20 lines as summary
            echo -e "\n   ${CYAN}--- validate-lts tail (summary) ---${NC}"
            tail -n 20 "$TMP_VALIDATION_OUTPUT" | sed 's/^/   /'

            if [[ $VALIDATE_EXIT -eq 0 ]]; then
                echo -e "\n   ${GREEN}✅ LTS validation пройден${NC}"
                print_log "INFO" "SUCCESS" "LTS validation пройден"
                LTS_STATUS="ok"
            else
                echo -e "\n   ${YELLOW}⚠️ LTS validation показал предупреждения или ошибки${NC}"
                print_log "WARN" "WARNING" "LTS validation показал предупреждения/ошибки"
                LTS_STATUS="warn"
            fi

            # categorize lines in validate output: critical if contain 'ERROR' or 'Non-LTS' or 'vulnerabilities'
            CRITICAL_COUNT=$(grep -iE "error|non-lts|vulnerab" "$TMP_VALIDATION_OUTPUT" | wc -l || true)
            WARNING_COUNT=$(grep -iE "warn|warning|deprecated|not found|not available" "$TMP_VALIDATION_OUTPUT" | wc -l || true)
            INFO_COUNT=$(grep -iE "info|success|found|confirmed" "$TMP_VALIDATION_OUTPUT" | wc -l || true)

            # expose counts
            echo -e "\n   ${CYAN}🔍 LTS validation details:${NC} ${GREEN}info:${NC} $INFO_COUNT ${YELLOW}warn:${NC} $WARNING_COUNT ${RED}critical:${NC} $CRITICAL_COUNT"
            rm -f "$TMP_VALIDATION_OUTPUT"
        else
            echo -e "   ${YELLOW}⚠️ LTS validation скрипт недоступен${NC}"
            print_log "WARN" "WARNING" "LTS validation скрипт отсутствует"
            LTS_STATUS="missing"
            CRITICAL_COUNT=0
            WARNING_COUNT=1
            INFO_COUNT=0
        fi
    
    # Генерация сводки
    echo -e "\n${MAGENTA}📊 Сводка соблюдения:${NC}"
    echo -e "${MAGENTA}================================${NC}"
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "   ${CYAN}📅 Отчет создан: $timestamp${NC}"
    
    # Подсчет активных систем
    local active_systems=0
    local total_systems=5
    
    command -v pnpm >/dev/null 2>&1 && active_systems=$((active_systems + 1))
    command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && active_systems=$((active_systems + 1))
    [[ -f "xlibris-manager.sh" ]] && active_systems=$((active_systems + 1))
    [[ -f "pnpm-workspace.yaml" ]] && active_systems=$((active_systems + 1))
    [[ -f "script/validate-lts.sh" ]] && active_systems=$((active_systems + 1))
    
    local compliance_percentage=$((active_systems * 100 / total_systems))
    
    if [[ $compliance_percentage -ge 90 ]]; then
        echo -e "   ${GREEN}✅ Статус соблюдения: ОТЛИЧНО ($compliance_percentage%)${NC}"
        print_log "INFO" "SUCCESS" "Высокий уровень соблюдения: $compliance_percentage%"
    elif [[ $compliance_percentage -ge 70 ]]; then
        echo -e "   ${YELLOW}⚠️ Статус соблюдения: ХОРОШО ($compliance_percentage%)${NC}"
        print_log "WARN" "WARNING" "Средний уровень соблюдения: $compliance_percentage%"
    else
        echo -e "   ${RED}❌ Статус соблюдения: ТРЕБУЕТ ВНИМАНИЯ ($compliance_percentage%)${NC}"
        print_log "ERROR" "ERROR" "Низкий уровень соблюдения: $compliance_percentage%"
    fi
    
    echo -e "   ${CYAN}🎯 Активные системы: $active_systems/$total_systems${NC}"
    
    print_log "INFO" "SUCCESS" "Compliance dashboard завершен успешно"
        # Подсчет активных систем (разделение на critical/warn/info с весами)
        local total_checks=5
        local critical_score=0
        local warning_score=0
        local info_score=0

        # Evaluate basic checks as info/warn/critical
        if command -v pnpm >/dev/null 2>&1; then info_score=$((info_score + 1)); else warning_score=$((warning_score + 1)); fi
        if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then info_score=$((info_score + 1)); else warning_score=$((warning_score + 1)); fi
        if [[ -f "xlibris-manager.sh" ]]; then info_score=$((info_score + 1)); else critical_score=$((critical_score + 1)); fi
        if [[ -f "pnpm-workspace.yaml" ]]; then info_score=$((info_score + 1)); else warning_score=$((warning_score + 1)); fi
        # LTS assessment weight: critical if CRITICAL_COUNT>0
        if [[ -n "${CRITICAL_COUNT:-}" && ${CRITICAL_COUNT:-0} -gt 0 ]]; then
            critical_score=$((critical_score + 1))
        elif [[ -n "${WARNING_COUNT:-}" && ${WARNING_COUNT:-0} -gt 0 ]]; then
            warning_score=$((warning_score + 1))
        else
            info_score=$((info_score + 1))
        fi

        # Compute weighted compliance percent (critical=0, warning=50, info=100 per check)
        total_points=$((total_checks * 100))
        obtained_points=$((info_score * 100 + warning_score * 50 + critical_score * 0))
        compliance_percentage=$((obtained_points * 100 / total_points))

        if [[ $compliance_percentage -ge 90 ]]; then
            echo -e "   ${GREEN}✅ Статус соблюдения: ОТЛИЧНО ($compliance_percentage%)${NC}"
            print_log "INFO" "SUCCESS" "Высокий уровень соблюдения: $compliance_percentage%"
        elif [[ $compliance_percentage -ge 70 ]]; then
            echo -e "   ${YELLOW}⚠️ Статус соблюдения: ХОРОШО ($compliance_percentage%)${NC}"
            print_log "WARN" "WARNING" "Средний уровень соблюдения: $compliance_percentage%"
        else
            echo -e "   ${RED}❌ Статус соблюдения: ТРЕБУЕТ ВНИМАНИЯ ($compliance_percentage%)${NC}"
            print_log "ERROR" "ERROR" "Низкий уровень соблюдения: $compliance_percentage%"
        fi

        echo -e "   ${CYAN}🎯 Активные системы оценки (info/warn/critical): ${GREEN}$info_score${NC}/${YELLOW}$warning_score${NC}/${RED}$critical_score${NC} (checks: $total_checks)"

        print_log "INFO" "SUCCESS" "Compliance dashboard завершен успешно"
}

# Установка/переустановка compliance системы
compliance_setup() {
    print_log "$BLUE" "INFO" "🔧 Установка compliance системы..."
    
    echo -e "${CYAN}=== Установка Voxlibris Platform Compliance ===${NC}"
    echo ""
    
    # Проверка наличия скрипта
    if [[ ! -f "scripts/setup-compliance-aliases.sh" ]]; then
        print_log "$RED" "ERROR" "❌ Скрипт setup-compliance-aliases.sh не найден"
        echo -e "${RED}❌ scripts/setup-compliance-aliases.sh не найден${NC}"
        return 1
    fi
    
    # Запуск установки
    echo -e "${BLUE}🚀 Запуск установки compliance aliases...${NC}"
    print_log "INFO" "INFO" "Запуск установки compliance aliases"
    
    if bash scripts/setup-compliance-aliases.sh; then
        echo ""
        echo -e "${GREEN}✅ Compliance система установлена успешно!${NC}"
        print_log "$GREEN" "SUCCESS" "✅ Compliance система установлена"
        
        echo ""
        echo -e "${YELLOW}📋 Установленные блокировки:${NC}"
        echo -e "   • ${RED}npm${NC} → используйте ${GREEN}pnpm${NC}"
        echo -e "   • ${RED}npx${NC} → используйте ${GREEN}pnpm dlx${NC}"
        echo -e "   • ${RED}docker-compose (legacy)${NC} → используйте ${GREEN}docker compose${NC}"
        
        echo ""
        echo -e "${YELLOW}🚀 Новые shortcuts:${NC}"
        echo -e "   • ${GREEN}xcheck${NC} → ./xlibris-manager.sh compliance-check"
        echo -e "   • ${GREEN}xdev${NC} → ./xlibris-manager.sh start"
        echo -e "   • ${GREEN}xstatus${NC} → ./xlibris-manager.sh status"
        
        echo ""
        echo -e "${CYAN}⚠️ Перезапустите терминал или выполните: source ~/.bashrc${NC}"
        
        return 0
    else
        echo -e "${RED}❌ Ошибка установки compliance системы${NC}"
        print_log "$RED" "ERROR" "❌ Ошибка установки compliance системы"
        return 1
    fi
}

# Показать помощь
show_help() {
    echo -e "${CYAN}Voxlibris Platform Service Manager v1.0${NC}"
    echo ""
    echo -e "${YELLOW}Использование:${NC}"
    echo -e "  $0 [команда]"
    echo ""
    echo -e "${YELLOW}Основные команды:${NC}"
    echo -e "  ${GREEN}start${NC}        Запуск всех сервисов и приложения"
    echo -e "  ${GREEN}stop${NC}         Остановка всех сервисов"
    echo -e "  ${GREEN}restart${NC}      Перезапуск всех сервисов"
    echo -e "  ${GREEN}status${NC}       Показать статус сервисов"
    echo -e "  ${GREEN}services${NC}     Запуск только Docker сервисов"
    echo -e "  ${GREEN}icecast${NC}      Запуск только Icecast"
    echo -e "  ${GREEN}build${NC}        Сборка проекта"
    echo -e "  ${GREEN}check${NC}        Проверка типов TypeScript"
    echo -e "  ${GREEN}logs${NC}         Показать логи"
    echo -e "  ${GREEN}clean${NC}        Очистка логов"
    echo ""
    echo -e "${YELLOW}Compliance команды:${NC}"
    echo -e "  ${GREEN}compliance-check${NC}     Быстрая проверка системы compliance (30 сек)"
    echo -e "  ${GREEN}compliance-dashboard${NC} Полный статус соблюдения принципов"
    echo -e "  ${GREEN}compliance-setup${NC}     Установка/переустановка compliance системы"
    echo ""
    echo -e "  ${GREEN}help${NC}         Показать эту справку"
    echo ""
    echo -e "${YELLOW}Примеры:${NC}"
    echo -e "  $0 start                 # Полный запуск для разработки"
    echo -e "  $0 services              # Только Docker сервисы"
    echo -e "  $0 status                # Проверить статус"
    echo -e "  $0 compliance-check      # Быстрая проверка compliance"
    echo -e "  $0 compliance-dashboard  # Полный отчет соблюдения"
    echo ""
    echo -e "${CYAN}💡 Совет: Используйте ${GREEN}xcheck${CYAN} alias для быстрой проверки compliance${NC}"
}

# Основная логика
main() {
    local command="${1:-help}"
    
    case "$command" in
        "start")
            check_dependencies
            check_env_file
            start_dev
            ;;
        "stop")
            stop_docker_services
            ;;
        "restart")
            stop_docker_services
            sleep 2
            check_dependencies
            check_env_file
            start_dev
            ;;
        "status")
            show_status
            ;;
        "services")
            check_dependencies
            check_env_file
            start_docker_services
            ;;
        "icecast")
            check_dependencies
            check_env_file
            start_icecast
            ;;
        "build")
            check_dependencies
            build_project
            ;;
        "check")
            check_dependencies
            check_types
            ;;
        "logs")
            if [ -f "$LOG_FILE" ]; then
                tail -f "$LOG_FILE"
            else
                echo -e "${YELLOW}Логи не найдены${NC}"
            fi
            ;;
        "clean")
            clean_logs
            ;;
        "compliance-check")
            compliance_check
            ;;
        "compliance-dashboard")
            compliance_dashboard
            ;;
        "compliance-setup")
            compliance_setup
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo -e "${RED}❌ Неизвестная команда: $command${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Обработка сигналов
trap 'if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then kill "$BACKEND_PID" 2>/dev/null || true; fi; print_log "INFO" "INFO" "🛑 Получен сигнал завершения"; exit 0' SIGINT SIGTERM EXIT

# Запуск
main "$@"
