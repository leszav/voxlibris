#!/bin/bash

# =============================================================================
# xLibris GitHub Actions Generator
# =============================================================================
# Генерация GitHub Actions workflows для xLibris compliance
# Модульный компонент CI/CD системы

# Import common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Generate GitHub Actions workflow for compliance
generate_compliance_workflow() {
    log_info "Generating GitHub Actions compliance workflow..."
    
    create_directory ".github/workflows" "GitHub workflows directory"
    
    cat > .github/workflows/compliance-ci.yml << 'EOF'
name: xLibris Compliance CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

env:
  FORCE_COLOR: 1

jobs:
  compliance-check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x]
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      
    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        
    - name: Setup pnpm
      uses: pnpm/action-setup@v3
      with:
        version: latest
        
    - name: Install dependencies
      run: pnpm install
      
    - name: Run compliance tests
      run: |
        chmod +x scripts/test-compliance-system.sh
        scripts/test-compliance-system.sh
        
    - name: Run LTS validation
      run: |
        chmod +x script/validate-lts.sh
        script/validate-lts.sh
        
    - name: Check blocking aliases
      run: |
        chmod +x scripts/setup-compliance-aliases.sh
        bash -n scripts/setup-compliance-aliases.sh
        
    - name: Validate xlibris-manager.sh
      run: |
        chmod +x xlibris-manager.sh
        ./xlibris-manager.sh --help
EOF

    log_success "GitHub Actions compliance workflow created"
}

# Generate security workflow
generate_security_workflow() {
    log_info "Generating GitHub Actions security workflow..."
    
    cat > .github/workflows/security.yml << 'EOF'
name: Security Scan

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday at 6 AM

jobs:
  security-audit:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.x'
        
    - name: Setup pnpm
      uses: pnpm/action-setup@v3
      with:
        version: latest
        
    - name: Install dependencies
      run: pnpm install
      
    - name: Run security audit
      run: pnpm audit
      
    - name: Run vulnerability scan
      uses: securecodewarrior/github-action-add-sarif@v1
      with:
        sarif-file: 'security-scan-results.sarif'
      continue-on-error: true
EOF

    log_success "GitHub Actions security workflow created"
}

# Generate deployment workflow
generate_deployment_workflow() {
    log_info "Generating GitHub Actions deployment workflow..."
    
    cat > .github/workflows/deploy.yml << 'EOF'
name: Production Deployment

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  compliance-gate:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      
    - name: Run compliance validation
      run: |
        chmod +x scripts/test-compliance-system.sh
        scripts/test-compliance-system.sh
        
  build-and-test:
    needs: compliance-gate
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.x'
        
    - name: Setup pnpm
      uses: pnpm/action-setup@v3
      with:
        version: latest
        
    - name: Install dependencies
      run: pnpm install
      
    - name: Run build
      run: pnpm run build
      
    - name: Run tests
      run: pnpm run test
      
  docker-build:
    needs: [compliance-gate, build-and-test]
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
      
    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
        
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
EOF

    log_success "GitHub Actions deployment workflow created"
}

# Main function for GitHub Actions setup
setup_github_actions() {
    log_info "Setting up GitHub Actions workflows..."
    
    if ! is_git_repository; then
        log_warning "Not a Git repository - GitHub Actions workflows created but won't be active"
    fi
    
    generate_compliance_workflow
    generate_security_workflow
    generate_deployment_workflow
    
    log_success "GitHub Actions setup completed"
}

# Export main function
export -f setup_github_actions