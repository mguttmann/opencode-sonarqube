# Architecture Overview

This document describes the architecture of the OpenCode SonarQube Plugin.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Module Structure](#module-structure)
- [Data Flow](#data-flow)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Key Design Decisions](#key-design-decisions)

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenCode (Host)                             │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │   AI Agent    │  │   Hooks      │  │   Plugin Manager        │  │
│  │               │◄─┤ session.idle │◄─┤   - loads plugin        │  │
│  │  uses tool    │  │ file.edited  │  │   - routes events       │  │
│  └───────┬───────┘  └──────────────┘  └─────────────────────────┘  │
│          │                                                          │
└──────────┼──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenCode SonarQube Plugin                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Tools     │  │   Hooks     │  │  Bootstrap  │  │    API    │  │
│  │  sonarqube  │  │ autoAnalyze │  │  - setup    │  │  - issues │  │
│  │    tool     │  │ trackFiles  │  │  - tokens   │  │  - gates  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       SonarQube Server        │
                    │  - Project Management         │
                    │  - Code Analysis              │
                    │  - Quality Gates              │
                    │  - Issue Tracking             │
                    └───────────────────────────────┘
```

## Module Structure

```
src/
├── index.ts              # Plugin entry point & CLI
├── api/                  # SonarQube REST API client
│   ├── index.ts          # API module exports & SonarQubeAPI class
│   ├── client.ts         # HTTP client with auth
│   ├── projects.ts       # Project CRUD operations
│   ├── issues.ts         # Issue queries
│   └── quality-gate.ts   # Quality gate management
├── bootstrap/            # First-run initialization
│   └── index.ts          # Project setup, token generation
├── hooks/                # OpenCode event handlers
│   └── index.ts          # session.idle, file.edited handlers
├── scanner/              # SonarQube scanner integration
│   ├── index.ts          # Scanner module exports
│   ├── config.ts         # sonar-project.properties generation
│   └── runner.ts         # Scanner execution & result parsing
├── tools/                # OpenCode tool definitions
│   └── sonarqube.ts      # AI agent tool implementation
├── types/                # TypeScript type definitions
│   └── index.ts          # All types, schemas, constants
└── utils/                # Shared utilities
    ├── config.ts         # Configuration loading
    ├── logger.ts         # Logging infrastructure
    ├── severity.ts       # Issue formatting & sorting
    └── state.ts          # Project state persistence
```

### Module Responsibilities

#### `src/index.ts` - Entry Point

- Exports the `SonarQubePlugin` function for OpenCode
- Handles CLI commands (`--analyze`, `--status`, `--issues`)
- Wires together tools, hooks, and event handlers

#### `src/api/` - SonarQube REST API

**client.ts**
- `SonarQubeClient`: Low-level HTTP client
- Basic auth (user/password) and token auth support
- Request/response handling with error mapping
- Health check functionality

**projects.ts**
- `ProjectsAPI`: Project lifecycle management
- Create, delete, search projects
- Token generation (project-scoped)
- Quality gate assignment
- Settings configuration

**issues.ts**
- `IssuesAPI`: Issue querying
- Search with filtering (severity, type, status)
- Issue count aggregation
- Formatted output for AI agents

**quality-gate.ts**
- `QualityGateAPI`: Quality gate operations
- Get project status
- List available gates
- Create custom gates with conditions
- Fetch quality metrics

#### `src/bootstrap/` - Initialization

- First-run project setup
- SonarQube project creation
- Project token generation
- Quality gate assignment (based on level)
- State persistence to `.sonarqube/project.json`
- Idempotent (safe to run multiple times)

#### `src/hooks/` - Event Handlers

- `session.idle`: Trigger auto-analysis when AI agent finishes
- `file.edited`: Track changed files for incremental analysis
- Cooldown logic to prevent excessive analysis
- Configuration-aware (respects `autoAnalyze` setting)

#### `src/scanner/` - Code Analysis

**config.ts**
- Project type detection (languages, frameworks)
- `sonar-project.properties` generation
- Coverage report path detection (lcov, c8, nyc)
- Multi-language support

**runner.ts**
- Scanner execution via `Bun.spawn`
- Result parsing and formatting
- Quality gate evaluation
- Markdown output generation for AI

#### `src/tools/` - AI Agent Tools

- `sonarqube` tool definition
- Actions: `analyze`, `issues`, `status`, `init`
- Parameter validation
- Result formatting for AI consumption

#### `src/types/` - Type Definitions

- Zod schemas for validation
- TypeScript interfaces for all data structures
- Enterprise quality thresholds
- Custom error classes

#### `src/utils/` - Utilities

**config.ts**
- Environment variable loading
- Configuration validation
- Project key/name generation

**logger.ts**
- Structured logging with levels
- Child loggers for module tracing
- OpenCode client integration

**severity.ts**
- Issue severity sorting
- Formatting for human readability

**state.ts**
- `.sonarqube/project.json` read/write
- State schema validation

## Data Flow

### 1. Bootstrap Flow (First Run)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │  Bootstrap  │     │  SonarQube  │     │  Local FS   │
│   Request   │────▶│   Module    │────▶│    API      │────▶│   State     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │                   │
      │  "analyze code"    │                   │                   │
      │                    │  1. health check  │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │  2. create project│                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │  3. gen token     │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │  4. set quality   │                   │
      │                    │     gate          │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │  5. write state   │                   │
      │                    │───────────────────┼──────────────────▶│
      │                    │                   │                   │
```

### 2. Analysis Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │     │   Scanner   │     │  SonarQube  │     │    API      │
│   or Hook   │     │   Module    │     │   Server    │     │   Module    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │                   │
      │  run analysis      │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │                   │                   │
      │                    │  1. gen props     │                   │
      │                    │  2. run scanner   │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │  (processes)      │
      │                    │                   │                   │
      │                    │  3. wait for      │                   │
      │                    │     processing    │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │                   │  4. fetch issues  │
      │                    │───────────────────┼──────────────────▶│
      │                    │                   │                   │
      │                    │                   │  5. fetch status  │
      │                    │───────────────────┼──────────────────▶│
      │                    │                   │                   │
      │  formatted result  │                   │                   │
      │◀───────────────────│                   │                   │
```

### 3. Auto-Analysis Flow (Hooks)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  OpenCode   │     │   Hooks     │     │   Scanner   │     │  OpenCode   │
│   Events    │     │   Module    │     │   Module    │     │   Inject    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │                   │
      │  file.edited       │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │  track file       │                   │
      │                    │                   │                   │
      │  file.edited       │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │  track file       │                   │
      │                    │                   │                   │
      │  session.idle      │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │                   │                   │
      │                    │  check cooldown   │                   │
      │                    │  check autoAnalyze│                   │
      │                    │                   │                   │
      │                    │  run analysis     │                   │
      │                    │──────────────────▶│                   │
      │                    │                   │                   │
      │                    │  results          │                   │
      │                    │◀──────────────────│                   │
      │                    │                   │                   │
      │                    │  inject message   │                   │
      │                    │───────────────────┼──────────────────▶│
      │                    │                   │                   │
```

## Plugin Lifecycle

### Initialization

1. OpenCode loads plugin via `SonarQubePlugin(ctx)`
2. Plugin creates hooks with config/directory getters
3. Plugin returns tool definition and event handlers
4. No SonarQube communication at this stage

### First Analysis

1. User or AI triggers analysis
2. `needsBootstrap()` checks for `.sonarqube/project.json`
3. If missing, `bootstrap()` runs:
   - Health check
   - Project creation (if needed)
   - Token generation
   - Quality gate assignment
   - State persistence
4. Analysis proceeds with project token

### Regular Analysis

1. Load state from `.sonarqube/project.json`
2. Generate `sonar-project.properties`
3. Execute `npx sonar-scanner`
4. Wait for server processing
5. Fetch results via API
6. Format and return to caller

### Auto-Analysis (via Hooks)

1. `file.edited` events track changed files
2. On `session.idle`:
   - Check cooldown (30s default)
   - Check `autoAnalyze` config
   - Run analysis if conditions met
3. Inject results into conversation if issues found

## Key Design Decisions

### 1. Project Tokens over Global Tokens

Each project gets its own analysis token stored locally. This provides:
- Better security (limited scope)
- Easier revocation
- Audit trail per project

### 2. Local State in `.sonarqube/`

Project state is stored in `.sonarqube/project.json`:
- Portable across machines
- Git-ignorable (contains token)
- No central database needed

### 3. Idempotent Bootstrap

`bootstrap()` is safe to call multiple times:
- Checks if project exists before creating
- Reuses existing tokens when possible
- Can force reinitialize with `force: true`

### 4. Cooldown for Auto-Analysis

Prevents analysis spam when AI makes many edits:
- 30-second default cooldown
- Resets on each `session.idle`
- Configurable per project

### 5. Severity-Based Reporting

Quality levels determine which issues are reported:
- Enterprise: All issues (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
- Standard: MAJOR and above
- Relaxed: BLOCKER and CRITICAL only
- Off: Plugin disabled

Note: The plugin no longer blocks git operations. It provides information
and lets developers make informed decisions.

### 6. Bun-First Design

Built for Bun runtime:
- Uses `Bun.spawn` for scanner
- Uses `Bun.file` for filesystem
- TypeScript-first with full type safety
- Fast startup and execution

### 7. Dependency Injection

Key dependencies are injectable for testing:
- Logger instances
- API clients
- File system operations
- Scanner execution

## Testing Architecture

```
tests/
├── unit/                 # Isolated module tests
│   ├── api/              # API client mocking
│   ├── bootstrap/        # Bootstrap flow tests
│   ├── hooks/            # Event handler tests
│   ├── scanner/          # Scanner tests
│   └── utils/            # Utility tests
└── integration/          # End-to-end tests
    └── *.integration.test.ts
```

### Test Strategy

- **Unit tests**: Mock all external dependencies
- **Integration tests**: Real filesystem, mocked API
- **Coverage target**: 100% (achieved)

### Mocking Approach

```typescript
// Spy on module functions
const spy = spyOn(module, "function");
spy.mockResolvedValue(result);

// Mock Bun.spawn for scanner tests
const spawnSpy = spyOn(Bun, "spawn");
spawnSpy.mockReturnValue({
  exited: Promise.resolve(0),
  stdout: new ReadableStream(...),
  stderr: new ReadableStream(...),
});
```

## Error Handling

### Error Hierarchy

```
SonarQubeError (base)
├── ConnectionError      # Network issues
├── AuthenticationError  # Invalid credentials (401)
├── ProjectNotFoundError # Project doesn't exist (404)
├── RateLimitError       # Too many requests (429)
└── SetupError           # Bootstrap failures
```

### Error Recovery

- **Connection errors**: Retry with exponential backoff
- **Auth errors**: Clear cached credentials, prompt user
- **Rate limits**: Wait and retry (respects Retry-After)
- **Setup errors**: Log and suggest manual setup

## Security Considerations

1. **Credentials**: Never logged, stored only in environment
2. **Tokens**: Project-scoped, stored locally with restricted permissions
3. **API calls**: HTTPS required in production
4. **State files**: Should be in `.gitignore`

## Performance Optimizations

1. **Parallel API calls**: Where possible (e.g., issues + metrics)
2. **Lazy loading**: Config loaded on first use
3. **Incremental analysis**: Only changed files when possible
4. **Result caching**: Within single analysis run
