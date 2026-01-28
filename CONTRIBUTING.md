# Contributing to OpenCode SonarQube Plugin

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Architecture Overview](#architecture-overview)

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [SonarQube](https://www.sonarqube.org/) server (for integration testing)
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/mguttmann/opencode-sonarqube.git
cd opencode-sonarqube

# Install dependencies
bun install

# Run tests
bun test

# Run tests with coverage
bun test --coverage
```

### Environment Setup

For integration testing, set up these environment variables:

```bash
export SONAR_HOST_URL="http://localhost:9000"
export SONAR_USER="admin"
export SONAR_PASSWORD="your-password"
```

Or create a `.env.local` file (git-ignored):

```
SONAR_HOST_URL=http://localhost:9000
SONAR_USER=admin
SONAR_PASSWORD=your-password
```

### Project Structure

```
src/
├── api/          # SonarQube REST API client
├── bootstrap/    # First-run initialization
├── hooks/        # OpenCode event handlers
├── scanner/      # Scanner execution
├── tools/        # AI agent tools
├── types/        # TypeScript types
└── utils/        # Shared utilities
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed architecture documentation.

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit return types for public functions
- Document public APIs with JSDoc comments

```typescript
/**
 * Fetches issues from SonarQube for a project
 * @param projectKey - The SonarQube project key
 * @param options - Optional filtering options
 * @returns Array of formatted issues
 */
export async function getIssues(
  projectKey: string,
  options?: IssueOptions
): Promise<FormattedIssue[]> {
  // implementation
}
```

### File Naming

- Source files: `kebab-case.ts` (e.g., `quality-gate.ts`)
- Test files: `*.test.ts` (e.g., `quality-gate.test.ts`)
- Type files: `index.ts` in `types/` directory

### Import Order

1. External packages
2. Internal modules (absolute paths)
3. Relative imports
4. Type imports

```typescript
import { z } from "zod";

import { SonarQubeClient } from "../api/client.ts";
import { Logger } from "../utils/logger.ts";

import { formatIssue } from "./formatter.ts";

import type { FormattedIssue } from "../types/index.ts";
```

### Error Handling

- Use custom error classes from `src/types/index.ts`
- Always provide meaningful error messages
- Log errors with context

```typescript
import { AuthenticationError, ConnectionError } from "../types/index.ts";

try {
  await client.request("/api/endpoint");
} catch (error) {
  if (error instanceof AuthenticationError) {
    logger.error("Authentication failed", { endpoint: "/api/endpoint" });
    throw error;
  }
  throw new ConnectionError(`Failed to connect: ${error.message}`);
}
```

## Testing

### Test Requirements

- **100% code coverage** is our target (achieved)
- All new features must include tests
- All bug fixes must include regression tests

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test src/api/client.test.ts

# Run tests matching pattern
bun test --grep "health check"

# Generate LCOV report
bun test --coverage --coverage-reporter=lcov
```

### Writing Tests

Use Bun's built-in test runner:

```typescript
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";

describe("MyModule", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(module, "function");
  });

  afterEach(() => {
    spy.mockRestore();
  });

  test("should do something", async () => {
    spy.mockResolvedValue({ success: true });
    
    const result = await myFunction();
    
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### Mocking Guidelines

- Mock external dependencies (API calls, filesystem)
- Use `spyOn` for module functions
- Restore mocks in `afterEach`

```typescript
// Mock Bun.spawn for scanner tests
const spawnSpy = spyOn(Bun, "spawn");
spawnSpy.mockReturnValue({
  exited: Promise.resolve(0),
  stdout: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("output"));
      controller.close();
    },
  }),
  stderr: new ReadableStream({
    start(controller) {
      controller.close();
    },
  }),
});
```

### SonarQube Analysis

Run SonarQube analysis locally:

```bash
# Generate coverage report
bun test --coverage --coverage-reporter=lcov

# Run scanner
npx sonar-scanner \
  -Dsonar.host.url=$SONAR_HOST_URL \
  -Dsonar.token=$SONAR_TOKEN
```

## Pull Request Process

### Before Submitting

1. **Run tests**: `bun test --coverage`
2. **Check coverage**: Ensure no decrease in coverage
3. **Run linting**: `bun run lint` (if configured)
4. **Update documentation**: If adding/changing features

### PR Guidelines

1. **Title**: Use conventional commit format
   - `feat: add new feature`
   - `fix: resolve bug`
   - `docs: update documentation`
   - `refactor: improve code structure`
   - `test: add tests`

2. **Description**: Include:
   - What the change does
   - Why it's needed
   - How to test it
   - Screenshots (if UI-related)

3. **Size**: Keep PRs focused and reasonably sized
   - One feature/fix per PR
   - Break large changes into smaller PRs

### Code Review

- All PRs require at least one approval
- Address all review comments
- Keep discussion constructive

### After Merging

- Delete the feature branch
- Verify CI/CD passes on main
- Update any related issues

## Architecture Overview

### Key Concepts

1. **Plugin System**: Integrates with OpenCode via hooks and tools
2. **API Client**: Communicates with SonarQube REST API
3. **Scanner**: Executes sonar-scanner CLI
4. **Bootstrap**: Handles first-run project setup

### Adding New Features

1. **New API endpoint**: Add to appropriate file in `src/api/`
2. **New tool action**: Extend `src/tools/sonarqube.ts`
3. **New hook**: Add to `src/hooks/index.ts`
4. **New type**: Add to `src/types/index.ts`

### Testing Locally with OpenCode

1. Build the plugin: `bun run build` (if applicable)
2. Link locally: `bun link`
3. In test project: `bun link opencode-sonarqube`
4. Add to `opencode.json`:
   ```json
   {
     "plugin": ["opencode-sonarqube"]
   }
   ```
5. Restart OpenCode

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

Thank you for contributing!
