#!/bin/bash

# =============================================================================
# xLibris CI/CD Setup - Modular Architecture
# =============================================================================
# Рефакторизованная модульная версия CI/CD настройки
# Замена для монолитного scripts/ci-cd-setup.sh (1890 строк -> модули)

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_CD_DIR="$SCRIPT_DIR/ci-cd"

# Import common utilities
source "$CI_CD_DIR/common.sh"

# Import modular components
source "$CI_CD_DIR/github-actions.sh"
source "$CI_CD_DIR/docker-setup.sh"

# Display help
show_help() {
    cat << EOF
xLibris CI/CD Setup (Modular)

USAGE:
    ./scripts/ci-cd-setup-modular.sh [OPTIONS]

OPTIONS:
    --help, -h              Show this help message
    --github-actions        Setup GitHub Actions workflows only
    --docker               Setup Docker configurations only
    --all                  Setup all CI/CD components (default)
    --validate             Validate existing setup

DESCRIPTION:
    Modular CI/CD setup replacing the monolithic 1890-line script.
    
    COMPONENTS:
    • GitHub Actions workflows (compliance, security, deployment)
    • Docker configurations (dev, production, nginx)
    • Environment validation
    • Compliance integration

EXAMPLES:
    ./scripts/ci-cd-setup-modular.sh --all
    ./scripts/ci-cd-setup-modular.sh --github-actions
    ./scripts/ci-cd-setup-modular.sh --docker

EOF
}

# Validate existing CI/CD setup
validate_setup() {
    log_info "Validating existing CI/CD setup..."
    
    local validation_passed=true
    
    # Check GitHub Actions
    if [[ -d ".github/workflows" ]]; then
        log_success "GitHub workflows directory exists"
        
        if [[ -f ".github/workflows/compliance-ci.yml" ]]; then
            log_success "Compliance workflow exists"
        else
            log_warning "Compliance workflow missing"
            validation_passed=false
        fi
    else
        log_warning "GitHub workflows not setup"
        validation_passed=false
    fi
    
    # Check Docker files
    if [[ -f "Dockerfile" ]]; then
        log_success "Dockerfile exists"
    else
        log_warning "Dockerfile missing"
        validation_passed=false
    fi
    
    if [[ -f "docker-compose.yml" ]]; then
        log_success "Docker Compose file exists"
    else
        log_warning "Docker Compose file missing"
        validation_passed=false
    fi
    
    # Check compliance components
    if [[ -x "scripts/test-compliance-system.sh" ]]; then
        log_success "Compliance test system available"
    else
        log_warning "Compliance test system missing or not executable"
        validation_passed=false
    fi
    
    if [[ "$validation_passed" == "true" ]]; then
        log_success "CI/CD setup validation passed"
        return 0
    else
        log_warning "CI/CD setup validation found issues"
        return 1
    fi
}

# Setup environment files
setup_environment_files() {
    log_info "Setting up environment configuration files..."
    
    # Generate .env.example
    if [[ ! -f ".env.example" ]]; then
        cat > .env.example << 'EOF'
# xLibris Environment Configuration

# Database
DATABASE_URL=postgresql://xlibris:password@localhost:5432/xlibris
POSTGRES_DB=xlibris
POSTGRES_USER=xlibris
POSTGRES_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://localhost:6379

# MinIO S3 Compatible Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ROOT_USER=xlibris
MINIO_ROOT_PASSWORD=your_secure_minio_password
MINIO_BUCKET=xlibris-storage

# Application
NODE_ENV=development
APP_PORT=5000
JWT_SECRET=your_jwt_secret_key_here
SESSION_SECRET=your_session_secret_here

# External APIs (if needed)
# OPENAI_API_KEY=your_openai_key
# STRIPE_SECRET_KEY=your_stripe_secret

# Docker Production
IMAGE_NAME=xlibris:latest
EOF
        log_success "Created .env.example"
    else
        log_info ".env.example already exists"
    fi
    
    # Backup existing .env if present
    if [[ -f ".env" ]]; then
        backup_file ".env"
    fi
}

# Complete CI/CD setup
setup_all_components() {
    log_info "Setting up all CI/CD components..."
    
    # Initialize environment
    if ! init_environment; then
        log_error "Failed to initialize environment"
        exit 1
    fi
    
    # Validate tools
    if ! validate_tools; then
        log_error "Required tools validation failed"
        exit 1
    fi
    
    # Setup components
    setup_environment_files
    setup_github_actions
    setup_docker_configs
    
    log_success "Complete CI/CD setup finished"
}

# Main execution
main() {
    local action="all"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --github-actions)
                action="github"
                shift
                ;;
            --docker)
                action="docker"
                shift
                ;;
            --all)
                action="all"
                shift
                ;;
            --validate)
                action="validate"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Execute based on action
    case "$action" in
        "github")
            init_environment || exit 1
            setup_github_actions
            ;;
        "docker")
            init_environment || exit 1
            setup_docker_configs
            ;;
        "validate")
            init_environment || exit 1
            validate_setup
            ;;
        "all")
            setup_all_components
            ;;
        *)
            log_error "Invalid action: $action"
            exit 1
            ;;
    esac
    
    log_success "CI/CD setup completed successfully"
}

# Check if required modules exist
if [[ ! -f "$CI_CD_DIR/common.sh" ]]; then
    echo "❌ Required module missing: $CI_CD_DIR/common.sh"
    exit 1
fi

if [[ ! -f "$CI_CD_DIR/github-actions.sh" ]]; then
    echo "❌ Required module missing: $CI_CD_DIR/github-actions.sh"
    exit 1
fi

if [[ ! -f "$CI_CD_DIR/docker-setup.sh" ]]; then
    echo "❌ Required module missing: $CI_CD_DIR/docker-setup.sh"
    exit 1
fi

# Execute main function
main "$@"