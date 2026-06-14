# Basic TypeScript Example

This example demonstrates how to use the `opencode-sonarqube` plugin with a TypeScript project.

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure SonarQube credentials

Set environment variables (add to `~/.zshrc` or `~/.bashrc`):

```bash
export SONAR_HOST_URL="https://your-sonarqube-server.com"
export SONAR_USER="admin"
export SONAR_PASSWORD="your-password"
```

Then reload:
```bash
source ~/.zshrc
```

### 3. Start OpenCode

```bash
opencode
```

### 4. Initialize SonarQube

In OpenCode, run:
```
sonarqube({ action: "setup" })
```

## Example Workflow

### Check current status
```
sonarqube({ action: "status" })
```

### Run full analysis
```
sonarqube({ action: "analyze" })
```

### See issues in new code only
```
sonarqube({ action: "newissues" })
```

### Find files that need attention
```
sonarqube({ action: "worstfiles" })
```

### Get help on a specific rule
```
sonarqube({ action: "rule", ruleKey: "typescript:S1854" })
```

## Project Structure

```
.
├── opencode.json      # OpenCode config with plugin
├── package.json       # Project dependencies
├── src/
│   └── index.ts       # Sample TypeScript code
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Sample Code Issues

The `src/index.ts` file contains intentional code quality issues for demonstration:

1. **Unused variable** - `unusedVar` is declared but never used
2. **Cognitive complexity** - `complexFunction` has high cyclomatic complexity
3. **Magic numbers** - Hardcoded numbers without explanation

Run `sonarqube({ action: "analyze" })` to detect these issues!
