# SonarQube Code Quality Integration

This project uses SonarQube for automated code quality analysis. The `sonarqube` tool is available and should be used proactively.

## IMPORTANT: Automatic Tool Usage

**YOU MUST automatically use the SonarQube tool in these situations:**

### After Writing Code
- After creating or modifying **any** source file, run `sonarqube({ action: "analyze" })`
- If analysis fails, immediately fix the issues before proceeding

### Before Completing Tasks
- **ALWAYS** run `sonarqube({ action: "validate" })` before saying a task is complete
- If validation fails, fix all issues before marking the task done

### When Notified of Issues
- If the system prompt mentions SonarQube issues, immediately run `sonarqube({ action: "issues" })` to get details
- Fix BLOCKER and CRITICAL issues without being asked

### When Starting a Session
- If notified of existing quality issues, address them proactively
- Use `sonarqube({ action: "status" })` to understand current state

## Quality Standards (Enterprise Level)

| Metric | Requirement |
|--------|-------------|
| Coverage | ≥ 80% |
| Duplications | < 3% |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Code Smells | 0 |
| All Ratings | A |

## Issue Severity and Response

| Severity | Action Required |
|----------|-----------------|
| **BLOCKER** | Fix IMMEDIATELY - Security vulnerabilities, critical bugs |
| **CRITICAL** | Fix before any other work - Reliability issues |
| **MAJOR** | Must fix - Maintainability issues |
| **MINOR** | Should fix - Minor improvements |
| **INFO** | Optional - Suggestions |

## Available Actions

```typescript
// Project Setup (first time only)
sonarqube({ action: "setup" })

// Code Analysis
sonarqube({ action: "analyze" })                    // Run full analysis
sonarqube({ action: "analyze", fix: true })         // With fix suggestions

// Issue Investigation  
sonarqube({ action: "issues" })                     // All issues
sonarqube({ action: "newissues" })                  // Only issues in NEW code (Clean as You Code)
sonarqube({ action: "worstfiles" })                 // Files with most issues
sonarqube({ action: "issues", severity: "critical" }) // Critical+ only
sonarqube({ action: "hotspots" })                   // Security hotspots
sonarqube({ action: "duplications" })               // Code duplicates

// Status & Validation
sonarqube({ action: "status" })                     // Quality gate status
sonarqube({ action: "validate" })                   // Enterprise validation

// Information
sonarqube({ action: "rule", ruleKey: "typescript:S1234" })  // Rule explanation
sonarqube({ action: "history" })                    // Past analyses
sonarqube({ action: "profile" })                    // Quality profile
sonarqube({ action: "branches" })                   // Branch status
sonarqube({ action: "metrics" })                    // Detailed metrics
```

## Clean as You Code (IMPORTANT)

The `newissues` action shows only issues introduced in recent changes. This follows SonarQube's "Clean as You Code" methodology:

1. **Focus on NEW code** - Fix issues in code you're currently writing
2. **Don't be overwhelmed** - Ignore legacy issues for now
3. **Incremental improvement** - Each change should leave the code cleaner

**Use `newissues` when:**
- You just wrote or modified code
- Before creating a PR
- When you want to know if YOUR changes introduced problems

## Finding Problem Areas

Use `worstfiles` to identify which files need the most attention:

```typescript
sonarqube({ action: "worstfiles" })  // Shows files ranked by issue count
```

This helps prioritize refactoring efforts.

## Workflow Guidelines

### Standard Development Flow
1. Write/modify code
2. Run `sonarqube({ action: "analyze" })`
3. If issues found, fix them immediately
4. Re-run analysis to verify fixes
5. Only proceed when quality gate passes

### When Fixing a SonarQube Issue
1. Run `sonarqube({ action: "rule", ruleKey: "<rule-key>" })` to understand the rule
2. Review the flagged code
3. Apply the fix
4. Re-run `sonarqube({ action: "analyze" })` to verify

### Before Completing Any Task
1. Run `sonarqube({ action: "validate" })`
2. Ensure all ratings are A
3. Fix any remaining issues
4. Confirm quality gate is green

## Branch Support

For multi-branch projects, specify the branch parameter:
```typescript
sonarqube({ action: "issues", branch: "feature-branch" })
sonarqube({ action: "analyze", branch: "feature-branch" })
```

## Automatic Plugin Behavior

The plugin automatically:

1. **Session Start** - Checks for existing issues and notifies if found
2. **File Changes** - Tracks edited files for analysis on idle
3. **Git Pull/Merge** - Suggests running `newissues` to check imported code
4. **Git Push** - Shows notification that code was pushed
5. **System Prompt** - Injects quality status so you're always aware

You don't need to manually trigger these - they happen automatically!

**Note:** The plugin does NOT block git commits or pushes. It provides information
and trusts developers to make informed decisions about code quality.

## Remember

- **Quality gate MUST pass** before any task is considered complete
- **BLOCKER issues are showstoppers** - fix immediately
- **Coverage matters** - write tests for new code
- **Zero tolerance** for bugs and vulnerabilities
- When in doubt, run `sonarqube({ action: "status" })` to check current state
