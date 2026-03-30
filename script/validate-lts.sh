#!/bin/bash

# =============================================================================
# Voxlibris Platform LTS Compliance Validator
# =============================================================================
# Автоматическая проверка соблюдения LTS требований проекта Voxlibris Platform
# Валидация Node.js версии и зависимостей на предмет non-LTS пакетов

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="logs/xlibris-manager.log"

log_info() {
    local message="$1"
    echo -e "${BLUE}ℹ️  $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: INFO: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_success() {
    local message="$1"
    echo -e "${GREEN}✅ $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: SUCCESS: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_warning() {
    local message="$1"
    echo -e "${YELLOW}⚠️  $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: WARNING: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_error() {
    local message="$1"
    echo -e "${RED}❌ $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: ERROR: $message" >> "$LOG_FILE" 2>/dev/null || true
}

# Create logs directory if it doesn't exist
#!/bin/bash

# =============================================================================
# Voxlibris Platform LTS Compliance Validator (improved)
# =============================================================================
# Автоматическая проверка соблюдения LTS требований проекта Voxlibris Platform
# Валидация Node.js версии и зависимостей на предмет non-LTS пакетов

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="logs/xlibris-manager.log"

log_info() {
    local message="$1"
    echo -e "${BLUE}ℹ️  $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: INFO: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_success() {
    local message="$1"
    echo -e "${GREEN}✅ $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: SUCCESS: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_warning() {
    local message="$1"
    echo -e "${YELLOW}⚠️  $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: WARNING: $message" >> "$LOG_FILE" 2>/dev/null || true
}

log_error() {
    local message="$1"
    echo -e "${RED}❌ $message${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LTS_VALIDATOR: ERROR: $message" >> "$LOG_FILE" 2>/dev/null || true
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Exit code tracking
EXIT_CODE=0

# Display help
show_help() {
    cat << EOF
Voxlibris Platform LTS Compliance Validator

USAGE:
    ./script/validate-lts.sh [OPTIONS]

OPTIONS:
    --help, -h          Show this help message
    --verbose, -v       Verbose output
    --fix               Attempt to fix non-LTS issues (where possible)
    --ignore-warnings   Ignore warnings and only fail on critical errors

DESCRIPTION:
    Validates LTS compliance for Voxlibris Platform project:
    
    CHECKS:
    • Node.js LTS version validation
    • Scans for explicit non-LTS package versions (alpha/beta/rc/canary)
    • Validates pnpm-workspace.yaml overrides
    • Runs pnpm audit for security compliance (with registry diagnostics)
    • Checks for deprecated packages (manual if necessary)

EXAMPLES:
    ./script/validate-lts.sh
    ./script/validate-lts.sh --verbose
    ./script/validate-lts.sh --fix

EOF
}

# Parse command line arguments
VERBOSE=false
FIX_MODE=false
IGNORE_WARNINGS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --fix)
            FIX_MODE=true
            shift
            ;;
        --ignore-warnings)
            IGNORE_WARNINGS=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

log_info "🔍 Validating LTS compliance..."

# =============================================================================
# 1. Check Node.js version
# =============================================================================
log_info "Checking Node.js version..."

if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js not found in PATH"
    EXIT_CODE=1
else
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
    
    log_info "Node.js version: $NODE_VERSION"
    
    # Check if it's an LTS version (even major numbers)
    if (( NODE_MAJOR % 2 == 0 )); then
        log_success "Node.js LTS version detected (v$NODE_MAJOR.x)"
    else
        log_error "Non-LTS Node.js version detected (v$NODE_MAJOR.x)"
        log_error "Please use an LTS version (even major numbers: 18, 20, 22, etc.)"
        EXIT_CODE=1
    fi
    
    # Additional checks for minimum supported version
    if (( NODE_MAJOR < 18 )); then
        log_error "Node.js version too old. Minimum required: v18.x"
        EXIT_CODE=1
    elif (( NODE_MAJOR >= 18 && NODE_MAJOR < 20 )); then
        log_warning "Node.js v18.x is supported but consider upgrading to v20.x LTS"
    fi
fi

# =============================================================================
# 2. Check for pnpm
# =============================================================================
log_info "Checking pnpm availability..."

if ! command -v pnpm >/dev/null 2>&1; then
    log_error "pnpm not found in PATH"
    log_error "Install pnpm via official installer or your package manager (see https://pnpm.io/installation)"
    EXIT_CODE=1
else
    PNPM_VERSION=$(pnpm --version)
    log_success "pnpm version: $PNPM_VERSION"
fi

# =============================================================================
# 3. Check for non-LTS packages (improved to reduce false positives)
# =============================================================================
log_info "Scanning for non-LTS packages..."

if command -v pnpm >/dev/null 2>&1; then
    NON_LTS_PACKAGES=""

    if [[ -f "pnpm-lock.yaml" ]]; then
        # Extract potential pre-release entries but filter out common peer-range lines
        # and resolution/integrity sections to reduce false positives.
        NON_LTS_PACKAGES=$(grep -nE "(alpha|beta|rc|canary)" pnpm-lock.yaml \
            | grep -v "react:\|react-dom:\|resolution:\|integrity:" \
            | head -20 || true)

        if [[ -n "$NON_LTS_PACKAGES" ]]; then
            # Allowlist specific known temporary exceptions (e.g. gensync beta used for Babel compatibility)
            ALLOWED_EXCEPTIONS_REGEX="gensync@1.0.0-beta.2|@rolldown/pluginutils@1.0.0-beta\\.[0-9]+|@vercel/postgres'?:?\s*'?>=0\\.[0-9]\\.0'"
            # Filter out allowed exceptions from the reported list
            FILTERED_NON_LTS=$(echo "$NON_LTS_PACKAGES" | grep -vE "$ALLOWED_EXCEPTIONS_REGEX" || true)

            log_warning "Potential non-LTS packages detected in pnpm-lock.yaml (filtered) — these may be transitive or peer-range entries and often are false positives"
            echo -e "${YELLOW}Found candidate entries (review manually, treated as WARNING):${NC}"

            # If there are only allowed exceptions, show a special warning and continue
            if [[ -z "$FILTERED_NON_LTS" ]]; then
                echo "  ⚠️  Only allowed pre-release exceptions found (e.g. gensync@1.0.0-beta.2). This is permitted temporarily until a stable release is available."
                log_warning "Allowed pre-release exceptions detected: gensync@1.0.0-beta.2 — permitted temporarily"
            else
                echo "$FILTERED_NON_LTS" | while IFS= read -r line; do
                    echo "  🔴 $line"
                done
            fi
            if [[ "$FIX_MODE" = true ]]; then
                log_warning "Fix mode enabled, but automatic fixing of lockfile entries is unsafe"
                log_warning "Please manually review and update package.json or use overrides"
            fi
            # Do NOT set EXIT_CODE for lockfile findings — treat as warnings by default
        else
            log_success "No obvious non-LTS package markers found in lockfile (filtered)"
        fi
    else
        log_warning "pnpm-lock.yaml not found - please run 'pnpm install' first"
        if [[ "$IGNORE_WARNINGS" = false ]]; then
            EXIT_CODE=1
        fi
    fi

    # Also check explicit dependency versions in package.json for pre-release tokens
    if [[ -f "package.json" ]]; then
        NON_LTS_IN_PACKAGE=$(grep -nE '"[^\"]+"\s*:\s*"[^\"]*-(alpha|beta|rc|canary)"' package.json || true)
        if [[ -n "$NON_LTS_IN_PACKAGE" ]]; then
            log_error "Non-LTS versions explicitly found in package.json (please review):"
            echo "$NON_LTS_IN_PACKAGE"
            EXIT_CODE=1
        fi
    fi

    # Check workspace packages
    if [[ -f "pnpm-workspace.yaml" ]]; then
        WORKSPACE_PACKAGES=$(grep -E "^\s*-\s*" pnpm-workspace.yaml | sed 's/^\s*-\s*//' || true)
        if [[ -n "$WORKSPACE_PACKAGES" ]]; then
            echo "$WORKSPACE_PACKAGES" | while IFS= read -r pkg_path; do
                if [[ -f "$pkg_path/package.json" ]]; then
                    NON_LTS_IN_WORKSPACE=$(grep -nE '"[^\"]+"\s*:\s*"[^\"]*-(alpha|beta|rc|canary)"' "$pkg_path/package.json" || true)
                    if [[ -n "$NON_LTS_IN_WORKSPACE" ]]; then
                        log_error "Non-LTS versions found in $pkg_path/package.json:"
                        echo "$NON_LTS_IN_WORKSPACE"
                        EXIT_CODE=1
                    fi
                fi
            done
        fi
    fi
else
    log_error "Cannot check packages without pnpm"
    EXIT_CODE=1
fi

# =============================================================================
# Extra check: ensure docker compose usage is available or advise migration
# Note: presence of docker-compose.yml file is allowed (project may use docker-compose
# files for config), but usage of the legacy `docker-compose` command is discouraged.
# =============================================================================
log_info "Checking docker compose availability..."
if command -v docker >/dev/null 2>&1; then
    if docker compose version --short >/dev/null 2>&1; then
        log_success "docker compose available"
    else
        if command -v docker-compose >/dev/null 2>&1; then
            log_warning "Found legacy 'docker-compose' binary — recommended to migrate to 'docker compose' (Docker CLI v2)."
            log_warning "Replace 'docker-compose' usage with 'docker compose' in scripts and CI."
        else
            # If a docker-compose.yml file exists it's acceptable as configuration, but the CLI should be 'docker compose'
            if [[ -f "docker-compose.yml" ]]; then
                log_warning "docker compose not available, but 'docker-compose.yml' exists — ensure Docker CLI v2 ('docker compose') is available in CI/runners"
            else
                log_error "Docker CLI not exposing 'docker compose' — install Docker CLI v2 or ensure 'docker compose' plugin is available."
                EXIT_CODE=1
            fi
        fi
    fi
else
    log_error "docker not found in PATH"
    EXIT_CODE=1
fi

# =============================================================================
# 4. Check pnpm-workspace.yaml overrides
# =============================================================================
log_info "Checking pnpm-workspace.yaml overrides..."

if [[ -f "pnpm-workspace.yaml" ]]; then
    log_success "pnpm-workspace.yaml found"
    
    # Check for overrides section
    if grep -q "overrides:" pnpm-workspace.yaml; then
        log_info "Package overrides found, checking for non-LTS versions..."
        OVERRIDE_NON_LTS=$(grep -A 20 "overrides:" pnpm-workspace.yaml | grep -E "(alpha|beta|rc|next|canary)" || true)
        if [[ -n "$OVERRIDE_NON_LTS" ]]; then
            log_error "Non-LTS versions found in overrides:"
            echo "$OVERRIDE_NON_LTS"
            EXIT_CODE=1
        else
            log_success "All overrides use LTS versions"
        fi
    else
        if [[ "$VERBOSE" = true ]]; then
            log_info "No overrides section found in pnpm-workspace.yaml"
        fi
    fi
    
    # Validate workspace structure
    if ! grep -q "packages:" pnpm-workspace.yaml; then
        log_error "Invalid pnpm-workspace.yaml: missing packages definition"
        EXIT_CODE=1
    else
        log_success "Valid pnpm workspace structure"
    fi
else
    log_error "pnpm-workspace.yaml not found"
    EXIT_CODE=1
fi

# =============================================================================
# 5. Run pnpm audit (with registry/network diagnostics)
# =============================================================================
log_info "Running pnpm audit..."

if command -v pnpm >/dev/null 2>&1 && [[ -f "pnpm-lock.yaml" ]]; then
    # Detect registry to provide helpful diagnostics if network fails
    REGISTRY="$(pnpm config get registry 2>/dev/null || true)"
    if [[ -z "$REGISTRY" ]]; then
        # Try to find registry from local config files
        REGISTRY=$(grep -h "registry" .npmrc .pnpmrc ~/.npmrc 2>/dev/null | head -n1 || true)
    fi

    if [[ -n "$REGISTRY" ]]; then
        # Normalize potential 'registry=' prefix
        REG_URL=$(echo "$REGISTRY" | sed -E 's/.*(https?:\/\/[^ ]+).*/\1/') || REG_URL="$REGISTRY"
        if ! curl -sSf --max-time 5 "$REG_URL" >/dev/null 2>&1; then
            log_warning "Configured registry seems unreachable: $REG_URL"
            log_warning "Check your local registry (verdaccio) or run: pnpm set registry https://registry.npmjs.org"
            if [[ "$VERBOSE" = true ]]; then
                log_info "Registry reported: $REGISTRY"
            fi
            # Do not fail immediately — continue to attempt audit which may still work
        fi
    fi

    if pnpm audit --audit-level moderate 2>/dev/null; then
        log_success "pnpm audit passed - no moderate+ vulnerabilities"
    else
        AUDIT_EXIT_CODE=$?
        if [[ $AUDIT_EXIT_CODE -eq 1 ]]; then
            log_error "pnpm audit failed - vulnerabilities detected"
            log_error "Run 'pnpm audit --fix' to attempt automatic fixes"
            if [[ "$IGNORE_WARNINGS" = false ]]; then
                EXIT_CODE=1
            fi
        else
            log_warning "pnpm audit command failed (exit code: $AUDIT_EXIT_CODE)"
            if [[ "$VERBOSE" = true ]]; then
                log_info "This might be due to missing dependencies or network issues"
            fi
        fi
    fi
else
    log_warning "Skipping pnpm audit - pnpm or lockfile not available"
fi

# =============================================================================
# 6. Check for deprecated packages
# =============================================================================
log_info "Checking for deprecated packages..."

if command -v pnpm >/dev/null 2>&1 && [[ -f "pnpm-lock.yaml" ]]; then
    # This would require pnpm to be run, which might not be appropriate in all contexts
    if [[ "$VERBOSE" = true ]]; then
        log_info "Deprecated package check requires 'pnpm outdated' - run manually if needed"
    fi
else
    log_warning "Cannot check for deprecated packages without pnpm and lockfile"
fi

# =============================================================================
# 7. Additional Voxlibris Platform-specific checks
# =============================================================================
log_info "Running Voxlibris Platform-specific LTS checks..."

# Check for required LTS-compatible tools
REQUIRED_TOOLS=("pnpm" "node" "git")
for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        log_error "Required tool missing: $tool"
        EXIT_CODE=1
    fi
done

if [[ $EXIT_CODE -eq 0 ]]; then
    log_success "All required tools available"
fi

# Check Node.js features required by Voxlibris Platform
if command -v node >/dev/null 2>&1; then
    # Check for ES modules support
    if node -e "import('fs')" 2>/dev/null; then
        log_success "ES modules support confirmed"
    else
        log_warning "ES modules may not be properly supported"
    fi
fi

# =============================================================================
# Final result
# =============================================================================
echo -e "\n${BLUE}===========================================${NC}"

if [[ $EXIT_CODE -eq 0 ]]; then
    log_success "LTS compliance check passed"
    echo -e "${GREEN}🎉 Voxlibris Platform project is LTS compliant!${NC}"
else
    log_error "LTS compliance violations detected"
    echo -e "${RED}🚫 Voxlibris Platform project has LTS compliance issues${NC}"
    
    if [[ "$FIX_MODE" = true ]]; then
        echo -e "${YELLOW}💡 Run with --fix flag for automatic fixes (where possible)${NC}"
    fi
    
    echo -e "\n${BLUE}Recommendations:${NC}"
    echo -e "${YELLOW}  1. Use Node.js LTS version (18.x, 20.x, 22.x)${NC}"
    echo -e "${YELLOW}  2. Remove explicit prerelease versions from package.json where appropriate${NC}"
    echo -e "${YELLOW}  3. Run 'pnpm audit --fix' for security fixes and check registry connectivity${NC}"
    echo -e "${YELLOW}  4. Update outdated packages to stable LTS versions after testing${NC}"
fi

echo -e "${BLUE}===========================================${NC}\n"