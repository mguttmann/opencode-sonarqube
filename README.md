# opencode-sonarqube

OpenCode Plugin for SonarQube integration - Enterprise-level code quality from the start.

[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://sonarqube.example.com)
[![Quality Gate](https://img.shields.io/badge/quality%20gate-passed-brightgreen)](https://sonarqube.example.com)
[![Tests](https://img.shields.io/badge/tests-722%20passing-brightgreen)](https://sonarqube.example.com)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/opencode-sonarqube)](https://www.npmjs.com/package/opencode-sonarqube)

## Features

- **Automatic Analysis**: Triggers SonarQube analysis when the AI agent becomes idle
- **16 Tool Actions**: Comprehensive SonarQube integration for AI agents
- **Clean as You Code**: Focus on new code issues with `newissues` action
- **Custom Command**: Use `/sonarqube` command for quick analysis
- **Security Hotspots**: Review, resolve, and bulk-dismiss security hotspots directly via API
- **Quality Gate Integration**: Shows pass/fail status with detailed metrics
- **Git Integration**: Detects git operations and suggests quality checks
- **System Prompt Injection**: AI always knows current quality status
- **Toast Notifications**: Visual feedback on analysis completion
- **Session Compaction**: Preserves analysis state across session compaction
- **Multi-Language Support**: Works with any language SonarQube supports
- **Auto-Fix Mode**: Optionally let the agent fix issues automatically
- **Enterprise Levels**: Configure strictness (enterprise/standard/relaxed/off)

## Quick Start

### One-Line Installation

```bash
# Interactive installation (recommended)
bash <(curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh)

# Or download and run:
curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh -o install.sh
chmod +x install.sh && ./install.sh
```

For CI/automation (non-interactive):

```bash
export SONAR_URL=https://your-sonarqube-server.com
export SONAR_USER=admin
export SONAR_PASSWORD=your-password
curl -fsSL https://raw.githubusercontent.com/mguttmann/opencode-sonarqube/main/scripts/install.sh | bash
```

The installer will:
1. Check prerequisites (Bun/npm)
2. Ask for SonarQube server URL, username, and password
3. Test the connection
4. Configure `opencode.json`
5. Set up environment variables

**After installation, complete these steps:**

```bash
# 1. Load environment variables
source ~/.zshrc   # or ~/.bashrc

# 2. Restart OpenCode (or start a new session)

# 3. Initialize SonarQube for your project (in OpenCode):
#    Tell the AI: "Setup SonarQube for this project"
#    Or use the tool: sonarqube({ action: "setup" })
```

### Manual Installation

```bash
# Install package
bun add opencode-sonarqube

# Or with npm
npm install opencode-sonarqube
```

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-sonarqube"]
}
```

**Important:** Configuration is done via environment variables (NOT in opencode.json):

```bash
export SONAR_HOST_URL="https://your-sonarqube-server.com"
export SONAR_USER="admin"
export SONAR_PASSWORD="your-password"
```

Add these to your `~/.zshrc` or `~/.bashrc` to make them permanent.

**After installation:**

1. Restart OpenCode (or start a new session)
2. Initialize SonarQube for your project:
   - Tell the AI: "Setup SonarQube for this project"
   - Or use: `sonarqube({ action: "setup" })`

## Updating

The plugin is installed per project via `package.json`. To update to the latest version:

```bash
# Update in the current project
bun add opencode-sonarqube@latest

# Or with npm
npm install opencode-sonarqube@latest
```

Then restart OpenCode to load the new version.

**Tip — Always get the latest version automatically:**

By default, `bun add` pins a specific version (e.g., `"^2.1.0"`). To always pull the newest release on every OpenCode restart, change your `package.json` dependency to:

```json
{
  "dependencies": {
    "opencode-sonarqube": "latest"
  }
}
```

This ensures you always run the most recent version without manual updates.

**Update all projects at once:**

```bash
# Run this from any directory to update all projects that use the plugin
for dir in $(grep -rl '"opencode-sonarqube"' ~/Projekte/*/package.json 2>/dev/null | xargs -I{} dirname {}); do
  echo "Updating: $dir"
  (cd "$dir" && bun add opencode-sonarqube@latest)
done
```

## Configuration

### Environment Variables (Required)

Add these to your `~/.zshrc` or `~/.bashrc`:

```bash
export SONAR_HOST_URL="https://your-sonarqube-server.com"
export SONAR_USER="admin"
export SONAR_PASSWORD="your-password"
```

### Plugin Configuration (Optional)

Create `.sonarqube/config.json` in your project root:

```json
{
  "level": "enterprise",
  "autoAnalyze": true,
  "newCodeDefinition": "previous_version"
}
```

### All Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | `"enterprise"` \| `"standard"` \| `"relaxed"` \| `"off"` | `"enterprise"` | Analysis strictness level |
| `autoAnalyze` | `boolean` | `true` | Auto-analyze when AI becomes idle |
| `projectKey` | `string` | auto | SonarQube project key (auto-generated from package.json or directory) |
| `projectName` | `string` | auto | Display name on SonarQube |
| `qualityGate` | `string` | `"Sonar way"` | Quality gate to use |
| `newCodeDefinition` | `"previous_version"` \| `"number_of_days"` \| `"reference_branch"` \| `"specific_analysis"` | `"previous_version"` | How to define 'new code' |
| `sources` | `string` | `"."` | Source directory (always scans entire project) |
| `tests` | `string` | - | Test directories (auto-detected) |
| `exclusions` | `string` | - | File exclusion patterns (glob) |

### Strictness Levels

| Level | Behavior |
|-------|----------|
| `enterprise` | All rules active, full analysis, requires 80%+ coverage for validation |
| `standard` | Major+ rules, balanced analysis |
| `relaxed` | Only blocker/critical issues reported |
| `off` | Plugin disabled |

### Example Configurations

**Enterprise (strictest)**:
```json
{
  "level": "enterprise",
  "autoAnalyze": true
}
```

**Standard (balanced)**:
```json
{
  "level": "standard",
  "autoAnalyze": true
}
```

**Relaxed (lenient)**:
```json
{
  "level": "relaxed",
  "autoAnalyze": false
}
```

## Tool Actions (15 total)

The plugin adds a `sonarqube` tool with these actions:

### Setup & Analysis

| Action | Description |
|--------|-------------|
| `setup` / `init` | Initialize project (auto-creates on SonarQube if needed) |
| `analyze` | Run full analysis, return issues |

### Issue Investigation

| Action | Description |
|--------|-------------|
| `issues` | Get all current issues |
| `newissues` | Get only issues in NEW code (Clean as You Code) |
| `worstfiles` | Show files with most issues (prioritize refactoring) |
| `hotspots` | Get security hotspots that need manual review |
| `reviewhotspot` | Review/resolve hotspots as SAFE, FIXED, or ACKNOWLEDGED |
| `duplications` | Find code duplications across the project |

### Status & Validation

| Action | Description |
|--------|-------------|
| `status` | Get quality gate status and metrics |
| `validate` | Check if project meets enterprise quality standards |
| `metrics` | Show detailed code metrics with trends |

### Information

| Action | Description |
|--------|-------------|
| `rule` | Explain a specific SonarQube rule (requires `ruleKey`) |
| `history` | Show past analysis history |
| `profile` | Show quality profile configuration |
| `branches` | Show branch analysis status |

### Tool Options

```typescript
sonarqube({
  action: "analyze" | "issues" | "newissues" | "worstfiles" | "status" | 
          "validate" | "hotspots" | "reviewhotspot" | "duplications" | "rule" |
          "history" | "profile" | "branches" | "metrics" | "setup",
  scope: "all" | "new" | "changed",     // What to analyze
  severity: "blocker" | "critical" | "major" | "minor" | "info" | "all",
  fix: true | false,                     // Include fix suggestions
  projectKey: "override-key",            // Optional override
  force: true | false,                   // Force re-initialization
  ruleKey: "typescript:S1234",           // For "rule" action
  branch: "feature-branch",             // For multi-branch analysis
  hotspotKey: "uuid-of-hotspot",        // For "reviewhotspot" action (omit for bulk review)
  resolution: "SAFE" | "FIXED" | "ACKNOWLEDGED",  // Hotspot review resolution
  comment: "Reason for the decision"     // Optional review comment
})
```

## Automatic Behaviors

The plugin automatically handles many scenarios without user intervention:

### Session Start
- Checks for existing issues
- Injects quality status into system prompt
- AI is immediately aware of code quality state

### File Changes
- Tracks all edited files during the session
- When agent becomes idle, runs automatic analysis (if `autoAnalyze: true`)
- Notifies of any new issues introduced

### Git Operations

| Operation | Automatic Behavior |
|-----------|-------------------|
| `git pull` / `git merge` | Suggests checking for new issues |
| `git checkout` (with changes) | Suggests running analysis |
| `git push` | Shows notification that code was pushed |

### System Prompt Injection
- Quality gate status is injected into every conversation
- AI always knows: issue counts, quality gate status, failed conditions
- No need to manually check - AI proactively addresses quality issues

### Session Compaction
- Quality context is preserved when session is compacted
- Long conversations maintain awareness of code quality state

## Usage Examples

### Via AI Agent Tool

```
User: "Implement user authentication"

Agent: I'll implement user authentication. Let me first check the current code quality.
[Uses sonarqube({ action: "status" })]

Agent: Quality gate is passing. Now implementing the feature...
[Writes code in src/auth/...]

Agent: Let me analyze the new code.
[Uses sonarqube({ action: "newissues" })]

Result:
## New Code Issues (Clean as You Code)
**Issues in New Code:** 2

### CRITICAL (1)
- **src/auth/login.ts:15** - Hardcoded password detected
  Rule: `typescript:S2068`

Agent: I found a critical issue. Let me fix it...
[Fixes the hardcoded password]
[Uses sonarqube({ action: "analyze" })]

Result:
## SonarQube Analysis Results
**Quality Gate: [PASS] OK**
No issues in new code!
```

### Common Workflows

```typescript
// Initialize project (first run)
sonarqube({ action: "setup" })

// Run analysis with fix suggestions
sonarqube({ action: "analyze", fix: true })

// Check only YOUR recent changes (Clean as You Code)
sonarqube({ action: "newissues" })

// Find files that need most attention
sonarqube({ action: "worstfiles" })

// Get only critical issues
sonarqube({ action: "issues", severity: "critical" })

// Understand a rule
sonarqube({ action: "rule", ruleKey: "typescript:S3776" })

// Enterprise validation before release
sonarqube({ action: "validate" })

// List security hotspots
sonarqube({ action: "hotspots" })

// Review a single hotspot as safe
sonarqube({ action: "reviewhotspot", hotspotKey: "abc-123", resolution: "SAFE", comment: "Form field name, not a password" })

// Bulk-review ALL pending hotspots as safe
sonarqube({ action: "reviewhotspot", resolution: "SAFE" })
```

## CLI Usage

```bash
# Initialize project (first run)
bun run src/index.ts --setup

# Run analysis
bun run src/index.ts --analyze

# Check quality gate status
bun run src/index.ts --status

# View current issues
bun run src/index.ts --issues

# View security hotspots
bun run src/index.ts --hotspots

# Override project key
bun run src/index.ts --status --project-key=my-project

# Force re-initialize
bun run src/index.ts --setup --force
```

## Project State

The plugin stores project state in `.sonarqube/project.json`:

```json
{
  "projectKey": "my-project",
  "projectToken": "sqp_xxx...",
  "tokenName": "opencode-my-project-...",
  "initializedAt": "2024-01-01T00:00:00.000Z",
  "languages": ["typescript", "javascript"],
  "qualityGate": "Sonar way",
  "setupComplete": true
}
```

**Important:** Add `.sonarqube/` to your `.gitignore` - it contains authentication tokens!

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](./docs/API.md) | Complete API documentation |
| [Architecture](./docs/ARCHITECTURE.md) | System architecture and design |
| [SonarQube Setup](./docs/SONARQUBE_SETUP.md) | Server installation guide |
| [Contributing](./CONTRIBUTING.md) | Development guidelines |
| [Changelog](./CHANGELOG.md) | Version history |

## API Modules

The plugin provides 12 API modules for SonarQube interaction:

| Module | Purpose |
|--------|---------|
| `ProjectsAPI` | Create, search, delete projects |
| `IssuesAPI` | Search issues, get counts, format for display |
| `QualityGateAPI` | Check status, validate enterprise quality |
| `RulesAPI` | Get rule details and explanations |
| `SourcesAPI` | Fetch source code context for issues |
| `DuplicationsAPI` | Find code duplications |
| `ComputeEngineAPI` | Track analysis task status |
| `ProjectAnalysesAPI` | Get analysis history |
| `QualityProfilesAPI` | Get active quality profiles |
| `BranchesAPI` | Multi-branch analysis management |
| `MetricsAPI` | Get detailed metrics with period comparison |
| `ComponentsAPI` | Get files/directories with issue counts |

## First Time Setup

When you use the plugin in a new project for the first time, you need to initialize it:

### Option 1: Let the AI do it
Simply tell the AI: "Set up SonarQube for this project" or "Initialize SonarQube"

### Option 2: Use the tool directly
```typescript
sonarqube({ action: "setup" })
```

This will:
1. Create a new project on your SonarQube server
2. Generate an authentication token
3. Create `.sonarqube/project.json` with the project configuration
4. Add `.sonarqube/` to your `.gitignore`

**Note:** The `.sonarqube/` directory contains sensitive tokens - never commit it!

## FAQ

### Where is the configuration stored?

| What | Location |
|------|----------|
| **Server credentials** | Environment variables (`SONAR_HOST_URL`, `SONAR_USER`, `SONAR_PASSWORD`) |
| **Plugin settings** | `.sonarqube/config.json` in your project (optional) |
| **Project state/tokens** | `.sonarqube/project.json` (auto-generated, don't commit!) |
| **OpenCode plugin list** | `opencode.json` |

### How do I enable debug logging?

Set the environment variable before starting OpenCode:
```bash
export SONARQUBE_DEBUG=true
```

Logs are written to `/tmp/sonarqube-plugin-debug.log`

### The plugin uses the wrong project directory

This can happen when multiple projects are open in OpenCode Desktop. The plugin uses `import.meta.url` to determine which project's `node_modules` it was loaded from. Make sure each project has its own installation:

```bash
cd /path/to/your/project
bun add opencode-sonarqube
```

### The quality gate shows issues but I just started

Run the setup first:
```typescript
sonarqube({ action: "setup" })
```

Then run an analysis:
```typescript
sonarqube({ action: "analyze" })
```

### How do I use this with multiple SonarQube servers?

Currently, the plugin uses global environment variables. For different servers per project, you'd need to set the environment variables differently per terminal session.

### Can I use this without OpenCode?

Yes! Use the CLI:
```bash
bun run src/index.ts --setup
bun run src/index.ts --analyze
bun run src/index.ts --status
```

## Requirements

- SonarQube server 9.9+ (tested with 26.1)
- Node.js 18+ or Bun
- OpenCode with plugin support

## Quality Metrics

This project maintains enterprise-level quality:

| Metric | Value |
|--------|-------|
| Test Coverage | 96% |
| Tests | 722 |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Code Smells | 0 |
| Security Hotspots | 0 (reviewed) |
| Duplications | 0% |
| Reliability Rating | A |
| Security Rating | A |
| Maintainability Rating | A |
| Lines of Code | ~6,000 |

## CI/CD Pipeline

All builds, tests, and releases are automated via GitHub Actions.

### Pipeline Stages

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   Build &   │────▶│  SonarQube Quality  │────▶│  Publish to npm │
│    Test     │     │       Gate          │     │  (tags only)    │
└─────────────┘     └─────────────────────┘     └─────────────────┘
```

1. **Build & Test**: Type check, unit tests, build
2. **Quality Gate**: SonarQube analysis must pass (0 bugs, 0 vulnerabilities, 0 code smells)
3. **Publish**: Only on version tags, only if quality gate passes

### Creating a Release

```bash
# 1. Update version in package.json
npm version patch   # 0.3.0 → 0.3.1
# or: npm version minor  # 0.3.0 → 0.4.0
# or: npm version major  # 0.3.0 → 1.0.0

# 2. Push code and tag
git push && git push --tags
```

The pipeline will automatically:
- Run all tests
- Check SonarQube quality gate
- Publish to npm (if quality gate passes)
- Create GitHub release

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `NPM_TOKEN` | npm access token with publish permissions |
| `SONAR_TOKEN` | SonarQube token for analysis |
| `SONAR_HOST_URL` | SonarQube server URL |

## License

MIT

## Author

Manuel Guttmann

## Links

- [GitHub Repository](https://github.com/mguttmann/opencode-sonarqube)
- [Issue Tracker](https://github.com/mguttmann/opencode-sonarqube/issues)
- [SonarQube Documentation](https://docs.sonarqube.org/)
