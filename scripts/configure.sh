#!/bin/bash
#
# OpenCode SonarQube Plugin - Configuration Script
# Run this script to update your SonarQube credentials or settings.
#
# Usage:
#   ./scripts/configure.sh
#
# Note: This script requires an interactive terminal.
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

# Check if running interactively
if [ ! -t 0 ]; then
    error "This script requires an interactive terminal."
    echo ""
    echo "Please run it directly:"
    echo "  ./scripts/configure.sh"
    echo ""
    exit 1
fi

# Banner
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     ${GREEN}OpenCode SonarQube Plugin - Configuration${NC}             ${BLUE}║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if opencode.json exists
if [ ! -f "opencode.json" ]; then
    error "opencode.json not found. Please run install.sh first."
    exit 1
fi

# Show current configuration
info "Current configuration:"
if command -v jq &> /dev/null; then
    CURRENT_URL=$(jq -r '.sonarqube.url // "not set"' opencode.json 2>/dev/null)
    CURRENT_LEVEL=$(jq -r '.sonarqube.level // "not set"' opencode.json 2>/dev/null)
    CURRENT_AUTO=$(jq -r '.sonarqube.autoAnalyze // "not set"' opencode.json 2>/dev/null)
    CURRENT_FIX=$(jq -r '.sonarqube.autoFix // "not set"' opencode.json 2>/dev/null)
    
    echo "  URL:         $CURRENT_URL"
    echo "  Level:       $CURRENT_LEVEL"
    echo "  Auto-Analyze: $CURRENT_AUTO"
    echo "  Auto-Fix:    $CURRENT_FIX"
else
    cat opencode.json
fi
echo ""

# Menu
echo "What would you like to configure?"
echo "  1) Update SonarQube URL"
echo "  2) Update credentials (username/password)"
echo "  3) Change analysis level"
echo "  4) Toggle auto-analyze"
echo "  5) Toggle auto-fix"
echo "  6) Test connection"
echo "  7) Reset project (delete .sonarqube folder)"
echo "  8) Show current status"
echo "  9) Exit"
echo ""
read -p "Choose option [1-9]: " CHOICE

case "$CHOICE" in
    1)
        # Update URL
        read -p "New SonarQube URL: " NEW_URL
        NEW_URL="${NEW_URL%/}"
        
        if [[ ! "$NEW_URL" =~ ^https?:// ]]; then
            error "URL must start with http:// or https://"
            exit 1
        fi
        
        if command -v jq &> /dev/null; then
            jq --arg url "$NEW_URL" '.sonarqube.url = $url' opencode.json > opencode.json.tmp
            mv opencode.json.tmp opencode.json
            success "Updated URL to $NEW_URL"
        else
            error "jq not installed. Please edit opencode.json manually."
            exit 1
        fi
        ;;
        
    2)
        # Update credentials
        read -p "New username: " NEW_USER
        read -s -p "New password: " NEW_PASSWORD
        echo ""
        
        # Determine shell config file
        if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
            SHELL_RC="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        else
            SHELL_RC="$HOME/.profile"
        fi
        
        # Update environment variables
        sed -i.bak '/export SONAR_USER=/d' "$SHELL_RC" 2>/dev/null || true
        sed -i.bak '/export SONAR_PASSWORD=/d' "$SHELL_RC" 2>/dev/null || true
        
        echo "export SONAR_USER=\"$NEW_USER\"" >> "$SHELL_RC"
        echo "export SONAR_PASSWORD=\"$NEW_PASSWORD\"" >> "$SHELL_RC"
        
        # Also export for current session
        export SONAR_USER="$NEW_USER"
        export SONAR_PASSWORD="$NEW_PASSWORD"
        
        success "Updated credentials in $SHELL_RC"
        warn "Run 'source $SHELL_RC' or restart your terminal"
        ;;
        
    3)
        # Change level
        echo "Select analysis level:"
        echo "  1) enterprise - Strictest (0 bugs, 0 smells, 80%+ coverage)"
        echo "  2) standard   - Balanced"
        echo "  3) relaxed    - Lenient"
        read -p "Choose [1/2/3]: " LEVEL_CHOICE
        
        case "$LEVEL_CHOICE" in
            1) LEVEL="enterprise" ;;
            2) LEVEL="standard" ;;
            3) LEVEL="relaxed" ;;
            *) error "Invalid choice"; exit 1 ;;
        esac
        
        if command -v jq &> /dev/null; then
            jq --arg level "$LEVEL" '.sonarqube.level = $level' opencode.json > opencode.json.tmp
            mv opencode.json.tmp opencode.json
            success "Updated level to $LEVEL"
        else
            error "jq not installed. Please edit opencode.json manually."
        fi
        ;;
        
    4)
        # Toggle auto-analyze
        if command -v jq &> /dev/null; then
            CURRENT=$(jq -r '.sonarqube.autoAnalyze' opencode.json)
            if [ "$CURRENT" = "true" ]; then
                NEW_VALUE="false"
            else
                NEW_VALUE="true"
            fi
            jq --argjson val "$NEW_VALUE" '.sonarqube.autoAnalyze = $val' opencode.json > opencode.json.tmp
            mv opencode.json.tmp opencode.json
            success "Auto-analyze set to $NEW_VALUE"
        else
            error "jq not installed. Please edit opencode.json manually."
        fi
        ;;
        
    5)
        # Toggle auto-fix
        if command -v jq &> /dev/null; then
            CURRENT=$(jq -r '.sonarqube.autoFix' opencode.json)
            if [ "$CURRENT" = "true" ]; then
                NEW_VALUE="false"
            else
                NEW_VALUE="true"
            fi
            jq --argjson val "$NEW_VALUE" '.sonarqube.autoFix = $val' opencode.json > opencode.json.tmp
            mv opencode.json.tmp opencode.json
            success "Auto-fix set to $NEW_VALUE"
        else
            error "jq not installed. Please edit opencode.json manually."
        fi
        ;;
        
    6)
        # Test connection
        info "Testing connection..."
        
        URL=$(jq -r '.sonarqube.url' opencode.json 2>/dev/null)
        
        # Try to get credentials from environment
        if [ -z "$SONAR_USER" ]; then
            read -p "Username: " SONAR_USER
        fi
        if [ -z "$SONAR_PASSWORD" ]; then
            read -s -p "Password: " SONAR_PASSWORD
            echo ""
        fi
        
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$SONAR_USER:$SONAR_PASSWORD" "$URL/api/system/status" 2>/dev/null || echo "000")
        
        if [ "$HTTP_CODE" = "200" ]; then
            VERSION=$(curl -s -u "$SONAR_USER:$SONAR_PASSWORD" "$URL/api/system/status" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            success "Connected successfully!"
            echo "  Server: $URL"
            echo "  Version: $VERSION"
        elif [ "$HTTP_CODE" = "401" ]; then
            error "Authentication failed"
        elif [ "$HTTP_CODE" = "000" ]; then
            error "Could not connect to $URL"
        else
            error "Unexpected response (HTTP $HTTP_CODE)"
        fi
        ;;
        
    7)
        # Reset project
        warn "This will delete the .sonarqube folder and all local project state."
        warn "The project on the SonarQube server will NOT be deleted."
        read -p "Are you sure? (y/N): " CONFIRM
        
        if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
            if [ -d ".sonarqube" ]; then
                rm -rf .sonarqube
                success "Deleted .sonarqube folder"
                info "Next analysis will re-initialize the project"
            else
                info ".sonarqube folder does not exist"
            fi
        else
            info "Cancelled"
        fi
        ;;
        
    8)
        # Show status
        info "Checking project status..."
        
        if [ -f ".sonarqube/project.json" ]; then
            if command -v jq &> /dev/null; then
                echo ""
                echo "Project State (.sonarqube/project.json):"
                echo "  Project Key:    $(jq -r '.projectKey' .sonarqube/project.json)"
                echo "  Initialized:    $(jq -r '.initializedAt' .sonarqube/project.json)"
                echo "  Last Analysis:  $(jq -r '.lastAnalysis // "never"' .sonarqube/project.json)"
                echo "  Languages:      $(jq -r '.languages | join(", ")' .sonarqube/project.json)"
                echo "  Quality Gate:   $(jq -r '.qualityGate // "default"' .sonarqube/project.json)"
                echo "  Setup Complete: $(jq -r '.setupComplete' .sonarqube/project.json)"
            else
                cat .sonarqube/project.json
            fi
        else
            warn "Project not initialized yet (.sonarqube/project.json not found)"
            info "Run an analysis to initialize the project"
        fi
        ;;
        
    9)
        info "Goodbye!"
        exit 0
        ;;
        
    *)
        error "Invalid option"
        exit 1
        ;;
esac

echo ""
echo -e "${YELLOW}Remember: Restart OpenCode after configuration changes!${NC}"
echo ""
