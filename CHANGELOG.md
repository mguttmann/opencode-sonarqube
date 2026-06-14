# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Pull request decoration support
- Webhook integration for real-time updates
- Trend analysis and warnings

## [2.2.0] - 2026-01-29

### Added

#### Robustness Improvements
- **State Migration System**: Automatic migration of `.sonarqube/project.json` when schema changes
- **State Auto-Repair**: Corrupt or invalid state files are now automatically repaired when possible
- **Automatic Backups**: State file is backed up before every save, enabling recovery from corruption
- **Backup Recovery**: If state file is corrupt, plugin attempts to recover from backup

#### Reliability
- **Retry with Exponential Backoff**: API calls now automatically retry up to 3 times with exponential backoff
- **Timeout Handling**: Requests timeout after 30 seconds with helpful error messages
- **Retryable Errors**: Connection errors, rate limits (429), and server errors (5xx) trigger automatic retry
- **Jitter in Backoff**: Prevents thundering herd problem when multiple requests fail

#### Error Messages
- **Offline Mode Messages**: Clear guidance when SonarQube server is unreachable
- **Timeout Messages**: Specific help for timeout situations
- **Connection Error Recovery**: Step-by-step recovery instructions for connection problems

#### Developer Experience
- **Test Utilities**: Added `createTestClient()` helper for faster, deterministic tests
- **Configurable Retries**: Client creation functions now accept retry options

### Fixed
- **CRITICAL**: Removed self-dependency in `package.json` that could cause build issues
- **Version Mismatch**: Synchronized version in `src/index.ts` with `package.json`
- **Cognitive Complexity**: Refactored 3 functions to reduce complexity below threshold (15)
  - `SonarQubeClient.request()` - Split into smaller helper methods
  - `executeSonarQubeTool()` - Extracted routing and error handling
  - `repairState()` - Extracted field extraction helpers

### Changed
- State files now include `_version` field for future migrations
- Improved error handling in tool execution with specific error type detection
- `RETRYABLE_STATUS_CODES` changed from Array to Set for O(1) lookup

### Documentation
- **New Troubleshooting Section**: Common issues with solutions
- **Expanded FAQ**: Multi-server setup, offline behavior, token usage, reset instructions

## [1.2.47] - 2026-01-26

### Changed
- Debug logging disabled for production (was enabled for testing)
- `safeLog` function now a no-op

## [1.2.46] - 2026-01-26

### Removed
- `autoFix` configuration option completely removed
- `triggerAutoFix` function removed from plugin
- All autoFix-related tests removed (4 tests)

### Changed
- Plugin no longer automatically prompts AI to fix issues
- Users can manually request fixes via `sonarqube({ action: "issues", fix: true })`

## [1.2.45] - 2026-01-26

### Removed
- `shouldBlockOnResult` function completely removed from scanner module
- `[BLOCKING]` notice removed from analyze action output
- All blocking-related tests removed (16 tests)

### Changed
- Analyze action no longer shows blocking warnings - just reports issues objectively

## [1.2.44] - 2026-01-26

### Removed
- Blocking-related fields completely removed from `SonarQubeConfigSchema`:
  - `analyzeBeforeCommit`, `blockCommit`, `blockPush`, `blockingSeverity`, `fixBeforeCommit`
- Setup action no longer creates config with blocking options
- "Pre-commit blocking enabled" message removed from setup output

### Changed
- Generated `.sonarqube/config.json` now contains only essential options:
  - `level`, `autoAnalyze`, `sources`, `newCodeDefinition`

## [1.2.42] - 2026-01-26

### Removed
- **BREAKING:** Pre-commit/pre-push blocking feature has been removed
  - The feature caused more problems than it solved (token issues, Claude confusion)
  - Configuration options `blockCommit`, `blockPush`, `blockingSeverity`, `fixBeforeCommit`, `analyzeBeforeCommit` are now ignored
  - The plugin now works as a passive tool that users call directly

### Changed
- Scanner now always uses `sonar.sources=.` (scans entire project from root)
- TypeScript config path changed to `**/tsconfig.json` (glob pattern)
- Simplified `tool.execute.before` hook (only loads config for sonarqube tool)

### Fixed
- Test mocks now include complete issue count format (Minor/Info values)
- Scanner config tests updated for new behavior
- CI/CD workflow now explicitly sets `sonar.projectKey` to avoid token binding issues

## [1.2.41] - 2026-01-26

### Changed
- Initial removal of pre-commit blocking (superseded by 1.2.42)

## [1.2.4] - 2026-01-25

### Fixed
- **Critical:** Pre-commit/pre-push blocking now actually blocks commits
- Previously the `tool.execute.before` hook only logged a warning but didn't prevent the commit
- Now replaces the git command with an error message and `exit 1` to properly block
- Added debug logging to trace hook execution for troubleshooting

### Changed
- Hook now intercepts both `bash` and `mcp_bash` tool calls for git operations

## [1.2.3] - 2026-01-25

### Added
- Auto-cleanup of `test-bootstrap-*` projects after integration tests
- Prevents accumulation of test artifacts on SonarQube server

### Improved
- Install script now shows clearer post-installation steps including `sonarqube({ action: "setup" })`
- README updated with explicit setup instructions after installation

## [1.2.2] - 2026-01-25

### Fixed
- **Critical:** Moved CLI code to separate `src/cli.ts` module to prevent OpenCode from trying to load CLI exports as plugins
- OpenCode iterates over all module exports and tries to call them as plugin functions - exporting `CLI_HELP` (a string) caused a crash

## [1.2.1] - 2026-01-25

### Fixed
- Added `permissions: contents: write` to CI/CD workflow to enable GitHub Release creation
- Removed circular self-dependency (`opencode-sonarqube: 0.2.10`) from package.json

## [1.2.0] - 2026-01-25

### Added

#### Pre-Commit/Pre-Push Quality Gate Blocking
- `analyzeBeforeCommit` - Run SonarQube analysis before git commit
- `blockCommit` - Block git commit if blocking issues exist
- `blockPush` - Block git push if blocking issues exist
- `blockingSeverity` - Configure minimum severity that blocks (BLOCKER/CRITICAL/MAJOR/MINOR/INFO)
- `fixBeforeCommit` - Attempt auto-fix before commit

#### Security Hotspot Review via API
- Security hotspots can now be marked as reviewed programmatically

### Changed
- Coverage exclusions for runtime-specific code (bootstrap, tools, config)
- Improved TypeScript strict mode compliance in test mocks

### Quality
- 625 tests (1 skip for complex mock scenario)
- 100% coverage (with exclusions for untestable runtime code)
- 0 SonarQube issues; all security hotspots reviewed

> Note: the pre-commit/pre-push blocking feature added here was later removed in 1.2.42.

## [1.1.0] - 2026-01-24

### Added

#### New Tool Actions
- `newissues` - Get only issues in NEW code (Clean as You Code methodology)
- `worstfiles` - Show files with most issues for prioritized refactoring
- `duplications` - Find code duplications across the project
- `rule` - Explain a specific SonarQube rule (requires `ruleKey` parameter)
- `history` - Show past analysis history
- `profile` - Show quality profile configuration
- `branches` - Show branch analysis status
- `metrics` - Show detailed code metrics with trends

#### New API Modules
- `RulesAPI`, `SourcesAPI`, `DuplicationsAPI`, `ProjectAnalysesAPI`,
  `QualityProfilesAPI`, `BranchesAPI`, `MetricsAPI`, `ComponentsAPI`

#### Automatic Behaviors
- **Git operation detection** - Detects git pull/push/merge/checkout and suggests quality checks
- **System prompt injection** - Injects quality status into the AI system prompt automatically
- **Session compaction context** - Preserves quality state across session compaction

### Changed
- Refactored complex functions to reduce cognitive complexity (all functions now < 15)

## [1.0.0] - 2026-01-24

### Added

- **Initial Release** - Enterprise-level SonarQube integration for OpenCode

#### Core Features
- `sonarqube` tool for AI agents with actions: `analyze`, `issues`, `status`, `setup`, `validate`, `hotspots`
- Automatic analysis on `session.idle` event
- File tracking via `file.edited` hook
- Cooldown mechanism to prevent excessive analysis

#### API Client
- Full SonarQube REST API integration
- Project management (create, delete, search)
- Issue queries with filtering and formatting
- Quality gate status and metrics
- Token-based and credential-based authentication

#### Bootstrap System
- Automatic project initialization on first use
- Project token generation (project-scoped for security)
- Quality gate auto-assignment based on analysis level
- Local state persistence in `.sonarqube/project.json`

#### Scanner Integration
- Multi-language project detection
- Automatic `sonar-project.properties` generation
- Coverage report path detection (lcov, c8, nyc)
- Support for TypeScript, JavaScript, Python, Java, Go, Rust, PHP, Ruby

#### CLI Commands
- `--setup`, `--analyze`, `--status`, `--issues`, `--project-key=KEY`

### Technical Details
- Built with Bun runtime, TypeScript strict mode, Zod for schema validation
- Custom error classes and structured logging
