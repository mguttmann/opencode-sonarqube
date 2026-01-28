#!/bin/bash
#
# OpenCode SonarQube Plugin - Installation Script
# Run this script in your project directory to install and configure the plugin.
#
# Interactive usage (recommended):
#   bash <(curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh)
#   # or download and run:
#   curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh -o install.sh
#   chmod +x install.sh && ./install.sh
#
# Non-interactive usage (CI/automation):
#   SONAR_URL=https://sonarqube.example.com SONAR_USER=admin SONAR_PASSWORD=secret ./install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Banner
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     ${GREEN}OpenCode SonarQube Plugin - Installation${NC}              ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}     Enterprise-level code quality integration            ${BLUE}║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running interactively
if [ -t 0 ]; then
    INTERACTIVE=true
else
    INTERACTIVE=false
fi

# If not interactive, check for required environment variables
if [ "$INTERACTIVE" = false ]; then
    if [ -z "$SONAR_URL" ] || [ -z "$SONAR_USER" ] || [ -z "$SONAR_PASSWORD" ]; then
        error "Non-interactive mode detected but required environment variables are missing."
        echo ""
        echo "When running via pipe (curl | bash), the script cannot prompt for input."
        echo ""
        echo -e "${YELLOW}Option 1: Run interactively (recommended):${NC}"
        echo "  bash <(curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh)"
        echo ""
        echo -e "${YELLOW}Option 2: Download and run:${NC}"
        echo "  curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh -o install.sh"
        echo "  chmod +x install.sh && ./install.sh"
        echo ""
        echo -e "${YELLOW}Option 3: Set environment variables:${NC}"
        echo "  export SONAR_URL=https://your-sonarqube-server.com"
        echo "  export SONAR_USER=admin"
        echo "  export SONAR_PASSWORD=your-password"
        echo "  curl -fsSL ... | bash"
        echo ""
        exit 1
    fi
    info "Running in non-interactive mode with environment variables"
fi

# Check prerequisites
info "Checking prerequisites..."

# Check for bun or npm
if command -v bun &> /dev/null; then
    PKG_MANAGER="bun"
    success "Found Bun"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    success "Found npm"
else
    error "Neither Bun nor npm found. Please install one of them first."
    echo "  Install Bun: curl -fsSL https://bun.sh/install | bash"
    echo "  Install Node.js: https://nodejs.org/"
    exit 1
fi

# Check if we're in a project directory
if [ ! -f "package.json" ] && [ ! -f "opencode.json" ]; then
    warn "No package.json or opencode.json found in current directory."
    if [ "$INTERACTIVE" = true ]; then
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        warn "Continuing anyway (non-interactive mode)"
    fi
fi

# Get configuration - either from env vars or interactively
if [ "$INTERACTIVE" = true ]; then
    echo ""
    info "Please enter your SonarQube server details:"
    echo ""

    # Get SonarQube URL
    while true; do
        read -p "SonarQube URL (e.g., https://sonarqube.example.com): " SONAR_URL
        
        # Remove trailing slash
        SONAR_URL="${SONAR_URL%/}"
        
        if [ -z "$SONAR_URL" ]; then
            error "URL cannot be empty"
            continue
        fi
        
        # Validate URL format
        if [[ ! "$SONAR_URL" =~ ^https?:// ]]; then
            error "URL must start with http:// or https://"
            continue
        fi
        
        break
    done

    # Get username
    while true; do
        read -p "SonarQube Username: " SONAR_USER
        if [ -z "$SONAR_USER" ]; then
            error "Username cannot be empty"
            continue
        fi
        break
    done

    # Get password (hidden input)
    while true; do
        read -s -p "SonarQube Password: " SONAR_PASSWORD
        echo ""
        if [ -z "$SONAR_PASSWORD" ]; then
            error "Password cannot be empty"
            continue
        fi
        break
    done
else
    # Use environment variables (already validated above)
    SONAR_URL="${SONAR_URL%/}"  # Remove trailing slash
fi

echo ""
info "Testing connection to SonarQube server..."

# Test connection
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$SONAR_USER:$SONAR_PASSWORD" "$SONAR_URL/api/system/status" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    VERSION=$(curl -s -u "$SONAR_USER:$SONAR_PASSWORD" "$SONAR_URL/api/system/status" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    success "Connected to SonarQube server (version: $VERSION)"
elif [ "$HTTP_CODE" = "401" ]; then
    error "Authentication failed. Please check your username and password."
    exit 1
elif [ "$HTTP_CODE" = "000" ]; then
    error "Could not connect to $SONAR_URL"
    echo "  Please check:"
    echo "  - The URL is correct"
    echo "  - The server is running"
    echo "  - Firewall allows the connection"
    exit 1
else
    error "Unexpected response from server (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
info "Installing opencode-sonarqube plugin..."

# Install the plugin
if [ "$PKG_MANAGER" = "bun" ]; then
    bun add opencode-sonarqube 2>/dev/null || warn "Could not add to package.json (may need to publish first)"
else
    npm install opencode-sonarqube 2>/dev/null || warn "Could not add to package.json (may need to publish first)"
fi

# Add plugin to opencode.json (ONLY the plugin reference - NO sonarqube config!)
# OpenCode does NOT support custom config keys - configuration is via environment variables
info "Configuring opencode.json..."

if [ -f "opencode.json" ]; then
    # Backup existing config
    cp opencode.json opencode.json.backup
    info "Backed up existing opencode.json to opencode.json.backup"
    
    # Check if jq is available for JSON manipulation
    if command -v jq &> /dev/null; then
        # ONLY add plugin to the plugin array - do NOT add any other config!
        jq 'if .plugin then .plugin += ["opencode-sonarqube"] | .plugin |= unique else . + {"plugin": ["opencode-sonarqube"]} end' \
           opencode.json > opencode.json.tmp && mv opencode.json.tmp opencode.json
        success "Added plugin to opencode.json"
    else
        warn "jq not found. Please manually add the plugin to opencode.json:"
        echo ""
        echo '  "plugin": ["opencode-sonarqube"]'
    fi
else
    # Create minimal opencode.json with only the plugin reference
    cat > opencode.json << 'EOF'
{
  "plugin": ["opencode-sonarqube"]
}
EOF
    success "Created opencode.json"
fi

# Set up environment variables (this is how the plugin gets configured!)
info "Setting up environment variables..."
echo ""
info "The plugin is configured via environment variables (not opencode.json):"
echo "  - SONAR_HOST_URL: SonarQube server URL"
echo "  - SONAR_USER: Username for authentication"
echo "  - SONAR_PASSWORD: Password for authentication"
echo ""

# Determine shell config file
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.profile"
fi

# Check if variables already exist
ENV_SKIP=false
if grep -q "SONAR_HOST_URL" "$SHELL_RC" 2>/dev/null; then
    warn "SonarQube environment variables already exist in $SHELL_RC"
    if [ "$INTERACTIVE" = true ]; then
        read -p "Update existing values? (y/N): " UPDATE_ENV
        if [[ "$UPDATE_ENV" =~ ^[Yy]$ ]]; then
            # Remove old entries
            sed -i.bak '/export SONAR_USER=/d' "$SHELL_RC"
            sed -i.bak '/export SONAR_PASSWORD=/d' "$SHELL_RC"
            sed -i.bak '/export SONAR_HOST_URL=/d' "$SHELL_RC"
            sed -i.bak '/# OpenCode SonarQube Plugin/d' "$SHELL_RC"
        else
            warn "Skipping environment variable setup"
            ENV_SKIP=true
        fi
    else
        warn "Skipping environment variable update (non-interactive mode)"
        ENV_SKIP=true
    fi
fi

if [ "$ENV_SKIP" = false ]; then
    echo "" >> "$SHELL_RC"
    echo "# OpenCode SonarQube Plugin" >> "$SHELL_RC"
    echo "export SONAR_HOST_URL=\"$SONAR_URL\"" >> "$SHELL_RC"
    echo "export SONAR_USER=\"$SONAR_USER\"" >> "$SHELL_RC"
    echo "export SONAR_PASSWORD=\"$SONAR_PASSWORD\"" >> "$SHELL_RC"
    
    success "Added environment variables to $SHELL_RC"
fi

# Add .sonarqube to .gitignore
if [ -f ".gitignore" ]; then
    if ! grep -q ".sonarqube" .gitignore; then
        echo "" >> .gitignore
        echo "# SonarQube plugin state (contains tokens)" >> .gitignore
        echo ".sonarqube/" >> .gitignore
        success "Added .sonarqube/ to .gitignore"
    fi
else
    echo "# SonarQube plugin state (contains tokens)" > .gitignore
    echo ".sonarqube/" >> .gitignore
    success "Created .gitignore with .sonarqube/"
fi

# Final instructions
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                  ${GREEN}Installation Complete!${NC}                    ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Follow these steps to complete setup!${NC}"
echo ""
echo "Your configuration:"
echo "  Server:   $SONAR_URL"
echo "  User:     $SONAR_USER"
echo "  Password: ********"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Load environment variables:"
echo "     source $SHELL_RC"
echo ""
echo "  2. Restart OpenCode (or start a new session)"
echo ""
echo "  3. Initialize SonarQube for your project:"
echo "     Tell the AI: \"Setup SonarQube for this project\""
echo "     Or use the tool directly: sonarqube({ action: \"setup\" })"
echo ""
echo "  4. Start coding - the AI will automatically analyze your code!"
echo ""
echo -e "${BLUE}Available tool actions:${NC}"
echo "  - sonarqube({ action: 'setup' })     - Initialize project (required first!)"
echo "  - sonarqube({ action: 'analyze' })   - Run analysis"
echo "  - sonarqube({ action: 'issues' })    - View issues"
echo "  - sonarqube({ action: 'status' })    - Check quality gate"
echo ""
echo "Documentation: https://github.com/mguttmann/opencode-sonarqube#readme"
echo ""
