#!/bin/bash

# Простой тест системы compliance Voxlibris Platform
# Минималистичная проверка без излишних украшений

echo "=== Voxlibris Platform Compliance Test ==="

# Проверка структуры проекта
echo -n "1. Project structure: "
if [[ -f "xlibris-manager.sh" && -f "pnpm-workspace.yaml" && -f "package.json" ]]; then
    echo "OK"
else
    echo "FAIL - missing core files"
    exit 1
fi

# Проверка blocking aliases
echo -n "2. Blocking aliases: "
if [[ -f "scripts/setup-compliance-aliases.sh" ]]; then
    if grep -q "npm()" scripts/setup-compliance-aliases.sh && grep -q "npx()" scripts/setup-compliance-aliases.sh; then
        echo "OK"
    else
        echo "FAIL - aliases incomplete"
    fi
else
    echo "FAIL - aliases script missing"
fi

# Проверка xlibris-manager.sh
echo -n "3. xlibris-manager.sh: "
if [[ -x "xlibris-manager.sh" ]]; then
    echo "OK"
else
    echo "FAIL - not executable"
    chmod +x xlibris-manager.sh 2>/dev/null && echo "FIXED"
fi

# Проверка AI Memory
echo -n "4. AI Memory system: "
if [[ -d "data/ai-memory" && -f "scripts/ai-memory-startup.sh" ]]; then
    echo "OK"
else
    echo "FAIL - AI Memory missing"
fi

# Проверка pre-commit hooks
echo -n "5. Pre-commit hooks: "
if [[ -f ".git/hooks/pre-commit" ]]; then
    echo "OK"
else
    echo "FAIL - hooks missing"
fi

# Проверка LTS validation
echo -n "6. LTS validation: "
if [[ -f "script/validate-lts.sh" ]]; then
    echo "OK"
else
    echo "FAIL - LTS script missing"
fi

echo "=== Test Complete ==="