#!/bin/bash

# =============================================================================
# xLibris CI/CD Common Utilities
# =============================================================================
# Общие утилиты для модульной CI/CD системы
# Логирование, определение проекта, валидации

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  [CI-CD] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CI-CD-INFO] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_success() {
    echo -e "${GREEN}✅ [CI-CD] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CI-CD-SUCCESS] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_warning() {
    echo -e "${YELLOW}⚠️  [CI-CD] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CI-CD-WARNING] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_error() {
    echo -e "${RED}❌ [CI-CD] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CI-CD-ERROR] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

# Detect xLibris project root
detect_project_root() {
    local current_dir="$PWD"
    while [[ "$current_dir" != "/" ]]; do
        if [[ -f "$current_dir/xlibris-manager.sh" && -f "$current_dir/pnpm-workspace.yaml" ]]; then
            echo "$current_dir"
            return 0
        fi
        current_dir="$(dirname "$current_dir")"
    done
    return 1
}

# Initialize environment
init_environment() {
    mkdir -p logs
    
    local project_root
    if project_root=$(detect_project_root); then
        cd "$project_root"
        log_success "Project root detected: $project_root"
        return 0
    else
        log_error "Not in xLibris project directory"
        return 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate required tools
validate_tools() {
    local missing_tools=()
    
    if ! command_exists "pnpm"; then
        missing_tools+=("pnpm")
    fi
    
    if ! command_exists "docker"; then
        missing_tools+=("docker")
    fi
    
    if ! command_exists "node"; then
        missing_tools+=("node")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        return 1
    fi
    
    log_success "All required tools available"
    return 0
}

# Create directory with logging
create_directory() {
    local dir_path="$1"
    local description="${2:-directory}"
    
    if [[ ! -d "$dir_path" ]]; then
        mkdir -p "$dir_path"
        log_success "Created $description: $dir_path"
    else
        log_info "$description already exists: $dir_path"
    fi
}

# Backup file with timestamp
backup_file() {
    local file_path="$1"
    
    if [[ -f "$file_path" ]]; then
        local backup_path="${file_path}.backup.$(date +%s)"
        cp "$file_path" "$backup_path"
        log_success "Backup created: $backup_path"
    fi
}

# Check if git repository
is_git_repository() {
    [[ -d ".git" ]]
}

# Export functions for use in other scripts
export -f log_info log_success log_warning log_error
export -f detect_project_root init_environment command_exists validate_tools
export -f create_directory backup_file is_git_repository