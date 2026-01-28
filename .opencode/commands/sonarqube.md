---
description: Run SonarQube analysis and check code quality
---

# SonarQube Analysis

Run code quality analysis using SonarQube integration.

## Instructions

1. First, check if the project is set up:
   - Use the `sonarqube` tool with action `status` to see current quality metrics

2. If not set up, initialize the project:
   - Use the `sonarqube` tool with action `setup`

3. Run analysis based on the user's request:
   - For full analysis: `sonarqube({ action: "analyze" })`
   - For issues only: `sonarqube({ action: "issues" })`
   - For quality gate status: `sonarqube({ action: "status" })`
   - For security review: `sonarqube({ action: "hotspots" })`
   - For enterprise validation: `sonarqube({ action: "validate" })`

4. If issues are found:
   - Prioritize BLOCKER and CRITICAL issues
   - Fix security vulnerabilities first
   - Then fix reliability issues (bugs)
   - Finally address maintainability (code smells)

5. After fixing issues:
   - Re-run analysis to verify fixes
   - Continue until quality gate passes

## Quality Standards

- **Coverage**: Must be 80% or higher
- **Duplications**: Must be under 3%
- **Bugs**: Must be 0
- **Vulnerabilities**: Must be 0
- **Code Smells**: Should be 0 for enterprise level
- **Ratings**: All ratings (Reliability, Security, Maintainability) should be A

## Example Usage

```
User: Check code quality
Action: sonarqube({ action: "status" })

User: Run full analysis
Action: sonarqube({ action: "analyze", fix: true })

User: Show me critical issues
Action: sonarqube({ action: "issues", severity: "critical" })

User: Validate enterprise standards
Action: sonarqube({ action: "validate" })
```
