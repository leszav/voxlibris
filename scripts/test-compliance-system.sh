#!/bin/bash

# =============================================================================
# Voxlibris Platform Compliance System Test Suite
# =============================================================================
# Комплексное тестирование всех блокировочных механизмов и систем compliance
# Валидация aliases, hooks, xlibris-manager.sh интеграции и AI Memory
# Часть ЭТАП 5.2: ИТОГОВОЕ ТЕСТИРОВАНИЕ (err-fix.md:322-341)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[0;37m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNINGS=0

# Test result arrays
declare -a FAILED_TESTS=()
declare -a WARNING_TESTS=()

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  [COMPLIANCE-TEST] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_success() {
    echo -e "${GREEN}✅ [COMPLIANCE-TEST] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_warning() {
    echo -e "${YELLOW}⚠️  [COMPLIANCE-TEST] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

log_error() {
    echo -e "${RED}❌ [COMPLIANCE-TEST] $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> logs/xlibris-manager.log 2>/dev/null || true
}

# Test tracking functions
test_pass() {
    local test_name="$1"
    log_success "PASS: $test_name"
    ((TESTS_PASSED++))
}

test_fail() {
    local test_name="$1"
    log_error "FAIL: $test_name"
    FAILED_TESTS+=("$test_name")
    ((TESTS_FAILED++))
}

test_warning() {
    local test_name="$1"
    log_warning "WARNING: $test_name"
    WARNING_TESTS+=("$test_name")
    ((TESTS_WARNINGS++))
}

# Detect Voxlibris Platform project root
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
    else
        log_error "Not in Voxlibris Platform project directory"
        exit 1
    fi
}

# Test 1: Project structure validation
test_project_structure() {
    log_info "Testing project structure..."
    ((TESTS_TOTAL++))
    
    local required_files=(
        "xlibris-manager.sh"
        "pnpm-workspace.yaml"
        "pnpm-lock.yaml"
        "package.json"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -eq 0 ]]; then
        test_pass "Project structure validation"
    else
        test_fail "Missing required files: ${missing_files[*]}"
    fi
}

# Test 2: Tools availability
test_tool_versions() {
    log_info "Testing tool versions compliance..."
    ((TESTS_TOTAL++))
    
    local tools_ok=true
    
    # Test pnpm
    if ! command -v pnpm >/dev/null 2>&1; then
        tools_ok=false
        test_fail "pnpm not installed"
    fi
    
    # Test docker compose v2
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        log_success "docker compose v2 available"
    else
        tools_ok=false
        test_fail "docker compose v2 not available"
    fi
    
    # Test Node.js
    if command -v node >/dev/null 2>&1; then
        log_success "node $(node --version) available"
    else
        tools_ok=false
        test_fail "node not installed"
    fi
    
    if [[ "$tools_ok" == "true" ]]; then
        test_pass "Tool versions compliance"
    fi
}

# Test 3: Blocking aliases
test_blocking_aliases() {
    log_info "Testing blocking aliases functionality..."
    ((TESTS_TOTAL++))
    
    local aliases_script="scripts/setup-compliance-aliases.sh"
    
    if [[ ! -f "$aliases_script" ]]; then
        test_fail "Aliases script not found: $aliases_script"
        return 1
    fi
    
    if [[ ! -x "$aliases_script" ]]; then
        test_warning "Aliases script not executable: $aliases_script"
    fi
    
    # Check for key blocking functions
    if grep -q "npm()" "$aliases_script" && \
       grep -q "npx()" "$aliases_script" && \
       grep -q "docker-compose()" "$aliases_script"; then
        test_pass "Blocking aliases functions present"
    else
        test_fail "Blocking aliases functions missing or incomplete"
    fi
}

# Test 4: Git hooks validation
test_git_hooks() {
    log_info "Testing git hooks configuration..."
    ((TESTS_TOTAL++))
    
    if [[ ! -d ".git" ]]; then
        test_warning "Not a git repository - skipping git hooks test"
        return 0
    fi
    
    local hooks_ok=true
    
    # Test pre-commit hook
    if [[ -f ".git/hooks/pre-commit" ]]; then
        if [[ -x ".git/hooks/pre-commit" ]]; then
            if grep -q "Voxlibris Platform compliance checks" ".git/hooks/pre-commit"; then
                log_success "Pre-commit hook configured correctly"
            else
                hooks_ok=false
                test_warning "Pre-commit hook missing compliance checks"
            fi
        else
            hooks_ok=false
            test_fail "Pre-commit hook exists but not executable"
        fi
    else
        hooks_ok=false
        test_fail "Pre-commit hook not installed"
    fi
    
    if [[ "$hooks_ok" == "true" ]]; then
        test_pass "Git hooks validation"
    fi
}

# Test 5: xlibris-manager.sh integration
test_xlibris_manager() {
    log_info "Testing xlibris-manager.sh integration..."
    ((TESTS_TOTAL++))
    
    if [[ ! -f "xlibris-manager.sh" ]]; then
        test_fail "xlibris-manager.sh not found"
        return 1
    fi
    
    # Check if executable
    if [[ ! -x "xlibris-manager.sh" ]]; then
        test_warning "xlibris-manager.sh not executable"
        chmod +x xlibris-manager.sh
    fi
    
    # Test basic functionality
    if ./xlibris-manager.sh --help >/dev/null 2>&1; then
        test_pass "xlibris-manager.sh basic functionality"
    else
        test_fail "xlibris-manager.sh --help command failed"
    fi
}

# Test 6: AI Memory system
test_ai_memory() {
    log_info "Testing AI Memory system..."
    ((TESTS_TOTAL++))
    
    # Check data directory
    if [[ -d "data/ai-memory" ]]; then
        local memory_files_count
        memory_files_count=$(find data/ai-memory -name "*.json" 2>/dev/null | wc -l)
        if [[ $memory_files_count -gt 0 ]]; then
            test_pass "AI Memory system active ($memory_files_count memory files)"
        else
            test_warning "AI Memory directory exists but no memory files found"
        fi
    else
        test_fail "AI Memory data directory not found"
    fi
    
    # Check server components
    if [[ -d "server/ai-memory" ]]; then
        local required_files=(
            "server/ai-memory/manager.ts"
            "server/ai-memory/storage.ts"
            "server/ai-memory/types.ts"
            "server/ai-memory/routes.ts"
        )
        
        local missing_ai_files=()
        for file in "${required_files[@]}"; do
            if [[ ! -f "$file" ]]; then
                missing_ai_files+=("$file")
            fi
        done
        
        if [[ ${#missing_ai_files[@]} -eq 0 ]]; then
            test_pass "AI Memory server components present"
        else
            test_fail "Missing AI Memory components: ${missing_ai_files[*]}"
        fi
    else
        test_fail "AI Memory server directory not found"
    fi
}

# Test 7: LTS validation
test_lts_validation() {
    log_info "Testing LTS validation..."
    ((TESTS_TOTAL++))
    
    local lts_script="script/validate-lts.sh"
    
    if [[ ! -f "$lts_script" ]]; then
        test_fail "LTS validation script not found: $lts_script"
        return 1
    fi
    
    if [[ ! -x "$lts_script" ]]; then
        test_warning "LTS validation script not executable"
        chmod +x "$lts_script"
    fi
    
    # Test LTS script syntax
    if bash -n "$lts_script"; then
        test_pass "LTS validation script syntax correct"
    else
        test_fail "LTS validation script has syntax errors"
    fi
}

# Generate comprehensive compliance report
generate_compliance_report() {
    echo -e "\n${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║                    COMPLIANCE TEST REPORT                    ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"

    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}📅 Report Generated: $timestamp${NC}"
    echo -e "${CYAN}🏠 Project Root: $(pwd)${NC}"

    echo -e "\n${WHITE}📊 TEST SUMMARY:${NC}"
    echo -e "   ${CYAN}Total Tests: ${WHITE}$TESTS_TOTAL${NC}"
    echo -e "   ${GREEN}Passed: ${WHITE}$TESTS_PASSED${NC}"
    echo -e "   ${RED}Failed: ${WHITE}$TESTS_FAILED${NC}"
    echo -e "   ${YELLOW}Warnings: ${WHITE}$TESTS_WARNINGS${NC}"

    if [[ $TESTS_TOTAL -gt 0 ]]; then
        local success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
        echo -e "   ${CYAN}Success Rate: ${WHITE}$success_rate%${NC}"

        if [[ $success_rate -ge 90 ]]; then
            echo -e "   ${GREEN}✅ COMPLIANCE STATUS: EXCELLENT${NC}"
        elif [[ $success_rate -ge 75 ]]; then
            echo -e "   ${YELLOW}⚠️  COMPLIANCE STATUS: GOOD${NC}"
        else
            echo -e "   ${RED}❌ COMPLIANCE STATUS: NEEDS ATTENTION${NC}"
        fi
    fi

    # Show failed tests
    if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
        echo -e "\n${RED}❌ FAILED TESTS:${NC}"
        for failed_test in "${FAILED_TESTS[@]}"; do
            echo -e "   ${RED}• $failed_test${NC}"
        done
    fi

    # Show warnings
    if [[ ${#WARNING_TESTS[@]} -gt 0 ]]; then
        echo -e "\n${YELLOW}⚠️  WARNINGS:${NC}"
        for warning_test in "${WARNING_TESTS[@]}"; do
            echo -e "   ${YELLOW}• $warning_test${NC}"
        done
    fi

    echo -e "\n${CYAN}📝 RECOMMENDATIONS:${NC}"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "   ${RED}• Fix failed tests before proceeding with deployment${NC}"
        echo -e "   ${BLUE}• Run individual component setup scripts to resolve issues${NC}"
    fi

    if [[ $TESTS_WARNINGS -gt 0 ]]; then
        echo -e "   ${YELLOW}• Review warnings to ensure optimal compliance${NC}"
        echo -e "   ${BLUE}• Consider running full setup scripts to complete configuration${NC}"
    fi

    if [[ $TESTS_FAILED -eq 0 && $TESTS_WARNINGS -eq 0 ]]; then
        echo -e "   ${GREEN}• All systems operational - ready for production use${NC}"
        echo -e "   ${GREEN}• Continue with confidence in your compliance setup${NC}"
    fi

    echo -e "\n${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║                    END COMPLIANCE REPORT                     ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
}

# Main execution function
main() {
    echo -e "${CYAN}🧪 Voxlibris Platform Compliance System Test Suite${NC}"
    echo -e "${CYAN}==========================================${NC}"
    
    # Initialize environment
    init_environment
    
    # Run all tests
    test_project_structure
    test_tool_versions
    test_blocking_aliases
    test_git_hooks
    test_xlibris_manager
    test_ai_memory
    test_lts_validation
    
    # Generate report
    generate_compliance_report
    
    # Exit with appropriate code
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Compliance test suite completed with failures"
        exit 1
    elif [[ $TESTS_WARNINGS -gt 0 ]]; then
        log_warning "Compliance test suite completed with warnings"
        exit 0
    else
        log_success "Compliance test suite completed successfully"
        exit 0
    fi
}

# Check for help argument
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
Voxlibris Platform Compliance System Test Suite

USAGE:
    ./scripts/test-compliance-system.sh [OPTIONS]

OPTIONS:
    --help, -h          Show this help message

DESCRIPTION:
    Comprehensive testing of all Voxlibris Platform compliance mechanisms:
    
    TESTS:
    • Project structure validation
    • Tool versions compliance
    • Blocking aliases functionality
    • Git hooks configuration
    • xlibris-manager.sh integration
    • AI Memory system
    • LTS validation

EXAMPLES:
    ./scripts/test-compliance-system.sh

EOF
    exit 0
fi

# Execute main function
main "$@"