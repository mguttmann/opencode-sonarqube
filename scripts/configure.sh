#!/bin/bash
#
# OpenCode SonarQube Plugin - Configuration Script
# Update your SonarQube credentials or plugin settings.
#
# Usage:
#   ./scripts/configure.sh
#
# How configuration works:
#   - Server URL and credentials are read from ENVIRONMENT VARIABLES
#     (SONAR_HOST_URL, SONAR_USER, SONAR_PASSWORD).
#   - Plugin behaviour (level, autoAnalyze, ...) is read from
#     .sonarqube/config.json in your project root.
#   opencode.json only registers the plugin; it is NOT used for configuration.
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

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Require an interactive terminal
if [ ! -t 0 ]; then
    error "This script requires an interactive terminal."
    echo ""
    echo "Please run it directly:"
    echo "  ./scripts/configure.sh"
    echo ""
    exit 1
fi

# Determine shell config file used for environment variables
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.profile"
fi

CONFIG_DIR=".sonarqube"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Banner
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}     ${GREEN}OpenCode SonarQube Plugin - Configuration${NC}             ${BLUE}║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show current configuration
info "Current configuration:"
echo "  Server URL (SONAR_HOST_URL): ${SONAR_HOST_URL:-not set}"
echo "  Username   (SONAR_USER):     ${SONAR_USER:-not set}"
echo "  Password   (SONAR_PASSWORD): $( [ -n "$SONAR_PASSWORD" ] && echo '********' || echo 'not set' )"
if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    echo "  Level (config.json):         $(jq -r '.level // "default (enterprise)"' "$CONFIG_FILE")"
    echo "  Auto-Analyze (config.json):  $(jq -r '.autoAnalyze // "default (true)"' "$CONFIG_FILE")"
fi
echo ""

# Helper: write a key into .sonarqube/config.json (creates file if needed)
write_config_key() {
    local key="$1"
    local json_value="$2"  # raw JSON value (string must be pre-quoted)

    if ! command -v jq &> /dev/null; then
        error "jq is required to edit $CONFIG_FILE. Please install jq or edit the file manually."
        exit 1
    fi

    mkdir -p "$CONFIG_DIR"
    if [ ! -f "$CONFIG_FILE" ]; then
        echo '{}' > "$CONFIG_FILE"
    fi

    jq --argjson val "$json_value" ".${key} = \$val" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" \
        && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
}

# Menu
echo "What would you like to configure?"
echo "  1) Update SonarQube URL (environment variable)"
echo "  2) Update credentials (username/password, environment variables)"
echo "  3) Change analysis level (.sonarqube/config.json)"
echo "  4) Toggle auto-analyze (.sonarqube/config.json)"
echo "  5) Test connection"
echo "  6) Reset project (delete .sonarqube folder)"
echo "  7) Show current status"
echo "  8) Exit"
echo ""
read -p "Choose option [1-8]: " CHOICE

case "$CHOICE" in
    1)
        read -p "New SonarQube URL: " NEW_URL
        NEW_URL="${NEW_URL%/}"
        if [[ ! "$NEW_URL" =~ ^https?:// ]]; then
            error "URL must start with http:// or https://"
            exit 1
        fi
        sed -i.bak '/export SONAR_HOST_URL=/d' "$SHELL_RC" 2>/dev/null || true
        rm -f "$SHELL_RC.bak"  # Remove sed backup (may contain old plaintext credentials)
        echo "export SONAR_HOST_URL=\"$NEW_URL\"" >> "$SHELL_RC"
        export SONAR_HOST_URL="$NEW_URL"
        success "Updated SONAR_HOST_URL in $SHELL_RC"
        warn "Run 'source $SHELL_RC' or restart your terminal"
        ;;

    2)
        read -p "New username: " NEW_USER
        read -s -p "New password (or token): " NEW_PASSWORD
        echo ""
        sed -i.bak '/export SONAR_USER=/d' "$SHELL_RC" 2>/dev/null || true
        sed -i.bak '/export SONAR_PASSWORD=/d' "$SHELL_RC" 2>/dev/null || true
        rm -f "$SHELL_RC.bak"  # Remove sed backup (may contain old plaintext credentials)
        echo "export SONAR_USER=\"$NEW_USER\"" >> "$SHELL_RC"
        echo "export SONAR_PASSWORD=\"$NEW_PASSWORD\"" >> "$SHELL_RC"
        export SONAR_USER="$NEW_USER"
        export SONAR_PASSWORD="$NEW_PASSWORD"
        success "Updated credentials in $SHELL_RC"
        warn "Run 'source $SHELL_RC' or restart your terminal"
        ;;

    3)
        echo "Select analysis level:"
        echo "  1) enterprise - Strictest (all rules, 80%+ coverage for validation)"
        echo "  2) standard   - Balanced (major+ rules)"
        echo "  3) relaxed    - Lenient (only blocker/critical)"
        echo "  4) off        - Plugin disabled"
        read -p "Choose [1-4]: " LEVEL_CHOICE
        case "$LEVEL_CHOICE" in
            1) LEVEL="enterprise" ;;
            2) LEVEL="standard" ;;
            3) LEVEL="relaxed" ;;
            4) LEVEL="off" ;;
            *) error "Invalid choice"; exit 1 ;;
        esac
        write_config_key "level" "\"$LEVEL\""
        success "Set level to $LEVEL in $CONFIG_FILE"
        warn "Restart OpenCode to apply the change"
        ;;

    4)
        CURRENT="true"
        if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
            CURRENT=$(jq -r '.autoAnalyze // true' "$CONFIG_FILE")
        fi
        if [ "$CURRENT" = "true" ]; then NEW_VALUE="false"; else NEW_VALUE="true"; fi
        write_config_key "autoAnalyze" "$NEW_VALUE"
        success "Set autoAnalyze to $NEW_VALUE in $CONFIG_FILE"
        warn "Restart OpenCode to apply the change"
        ;;

    5)
        info "Testing connection..."
        if [ -z "$SONAR_HOST_URL" ]; then
            read -p "SonarQube URL: " SONAR_HOST_URL
            SONAR_HOST_URL="${SONAR_HOST_URL%/}"
        fi
        if [ -z "$SONAR_USER" ]; then
            read -p "Username: " SONAR_USER
        fi
        if [ -z "$SONAR_PASSWORD" ]; then
            read -s -p "Password: " SONAR_PASSWORD
            echo ""
        fi
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$SONAR_USER:$SONAR_PASSWORD" "$SONAR_HOST_URL/api/system/status" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            VERSION=$(curl -s -u "$SONAR_USER:$SONAR_PASSWORD" "$SONAR_HOST_URL/api/system/status" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            success "Connected successfully!"
            echo "  Server:  $SONAR_HOST_URL"
            echo "  Version: $VERSION"
        elif [ "$HTTP_CODE" = "401" ]; then
            error "Authentication failed"
        elif [ "$HTTP_CODE" = "000" ]; then
            error "Could not connect to $SONAR_HOST_URL"
        else
            error "Unexpected response (HTTP $HTTP_CODE)"
        fi
        ;;

    6)
        warn "This will delete the $CONFIG_DIR folder and all local project state."
        warn "The project on the SonarQube server will NOT be deleted."
        read -p "Are you sure? (y/N): " CONFIRM
        if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
            if [ -d "$CONFIG_DIR" ]; then
                rm -rf "$CONFIG_DIR"
                success "Deleted $CONFIG_DIR folder"
                info "Next analysis will re-initialize the project"
            else
                info "$CONFIG_DIR folder does not exist"
            fi
        else
            info "Cancelled"
        fi
        ;;

    7)
        info "Project status:"
        if [ -f "$CONFIG_DIR/project.json" ] && command -v jq &> /dev/null; then
            echo ""
            echo "Project State ($CONFIG_DIR/project.json):"
            echo "  Project Key:    $(jq -r '.projectKey // "unknown"' "$CONFIG_DIR/project.json")"
            echo "  Initialized:    $(jq -r '.initializedAt // "unknown"' "$CONFIG_DIR/project.json")"
            echo "  Last Analysis:  $(jq -r '.lastAnalysis // "never"' "$CONFIG_DIR/project.json")"
            echo "  Languages:      $(jq -r '(.languages // []) | join(", ")' "$CONFIG_DIR/project.json")"
            echo "  Setup Complete: $(jq -r '.setupComplete // false' "$CONFIG_DIR/project.json")"
        else
            warn "Project not initialized yet ($CONFIG_DIR/project.json not found)"
            info "Run an analysis to initialize the project: sonarqube({ action: \"setup\" })"
        fi
        ;;

    8)
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
