# API Reference

Complete API documentation for the OpenCode SonarQube Plugin.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [SonarQubeAPI Class](#sonarqubeapi-class)
- [ProjectsAPI](#projectsapi)
- [IssuesAPI](#issuesapi)
- [QualityGateAPI](#qualitygateapi)
- [RulesAPI](#rulesapi)
- [SourcesAPI](#sourcesapi)
- [DuplicationsAPI](#duplicationsapi)
- [ProjectAnalysesAPI](#projectanalysesapi)
- [QualityProfilesAPI](#qualityprofilesapi)
- [BranchesAPI](#branchesapi)
- [MetricsAPI](#metricsapi)
- [ComponentsAPI](#componentsapi)
- [ComputeEngineAPI](#computeengineapi)
- [Scanner Functions](#scanner-functions)
- [Configuration Functions](#configuration-functions)
- [Types](#types)
- [Error Classes](#error-classes)

## Installation

```bash
# Using bun
bun add opencode-sonarqube

# Using npm
npm install opencode-sonarqube
```

## Quick Start

```typescript
import {
  createSonarQubeAPI,
  createSonarQubeAPIWithCredentials,
  loadConfig,
  bootstrap,
  getProjectState,
  runAnalysis,
} from "opencode-sonarqube";

// Option 1: Using environment variables
const config = loadConfig();
const state = await getProjectState("./");
const api = createSonarQubeAPI(config, state);

// Option 2: Using explicit credentials
const api = createSonarQubeAPIWithCredentials(
  "https://sonarqube.example.com",
  "admin",
  "password"
);

// Health check
const health = await api.healthCheck();
console.log("Server healthy:", health.healthy);

// Get issues
const issues = await api.issues.getFormattedIssues({
  projectKey: "my-project",
  severities: ["BLOCKER", "CRITICAL"],
});

// Get quality gate status
const status = await api.qualityGate.getStatus("my-project");
console.log("Quality Gate:", status.projectStatus.status);
```

## SonarQubeAPI Class

Main entry point for all API operations.

### Constructor

```typescript
new SonarQubeAPI(client: SonarQubeClient, logger?: Logger)
```

### Factory Functions

#### `createSonarQubeAPI(config, state, logger?)`

Create API instance from configuration and project state.

```typescript
import { createSonarQubeAPI, loadConfig, getProjectState } from "opencode-sonarqube";

const config = loadConfig();
const state = await getProjectState("./my-project");
const api = createSonarQubeAPI(config, state);
```

#### `createSonarQubeAPIWithCredentials(url, user, password, logger?)`

Create API instance with username/password authentication.

```typescript
import { createSonarQubeAPIWithCredentials } from "opencode-sonarqube";

const api = createSonarQubeAPIWithCredentials(
  "https://sonarqube.example.com",
  "admin",
  "secure-password"
);
```

#### `createSonarQubeAPIWithToken(url, token, logger?)`

Create API instance with token authentication.

```typescript
import { createSonarQubeAPIWithToken } from "opencode-sonarqube";

const api = createSonarQubeAPIWithToken(
  "https://sonarqube.example.com",
  "sqp_xxxxxxxxxxxxx"
);
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `client` | `SonarQubeClient` | Low-level HTTP client |
| `projects` | `ProjectsAPI` | Project management operations |
| `issues` | `IssuesAPI` | Issue queries and management |
| `qualityGate` | `QualityGateAPI` | Quality gate operations |
| `rules` | `RulesAPI` | Rule details and explanations |
| `sources` | `SourcesAPI` | Source code context for issues |
| `duplications` | `DuplicationsAPI` | Code duplication detection |
| `analyses` | `ProjectAnalysesAPI` | Analysis history |
| `profiles` | `QualityProfilesAPI` | Quality profile information |
| `branches` | `BranchesAPI` | Multi-branch analysis |
| `metrics` | `MetricsAPI` | Detailed metrics with trends |
| `components` | `ComponentsAPI` | Files/directories with issues |
| `computeEngine` | `ComputeEngineAPI` | Analysis task tracking |

### Methods

#### `healthCheck(): Promise<HealthCheckResult>`

Check server connectivity and health.

```typescript
const health = await api.healthCheck();
// { healthy: true, version: "26.1.0.15561" }
// { healthy: false, error: "Connection refused" }
```

#### `getAnalysisSummary(projectKey): Promise<AnalysisSummary>`

Get complete analysis summary including quality gate, issues, and metrics.

```typescript
const summary = await api.getAnalysisSummary("my-project");
/*
{
  qualityGate: {
    status: "OK",
    passed: true,
    failedConditions: 0
  },
  issues: {
    total: 5,
    blocker: 0,
    critical: 1,
    major: 2,
    minor: 2,
    info: 0
  },
  metrics: {
    coverage: 85.5,
    duplications: 1.2,
    bugs: 0,
    vulnerabilities: 0,
    codeSmells: 5,
    securityHotspots: 0,
    reliabilityRating: "A",
    securityRating: "A",
    maintainabilityRating: "A",
    linesOfCode: 2500
  }
}
*/
```

## ProjectsAPI

Manage SonarQube projects.

### `create(params): Promise<ProjectCreateResponse>`

Create a new project.

```typescript
const result = await api.projects.create({
  project: "my-project-key",
  name: "My Project",
  visibility: "private", // optional: "public" | "private"
  mainBranch: "main",    // optional
});
// { project: { key: "my-project-key", name: "My Project", qualifier: "TRK" } }
```

### `exists(projectKey): Promise<boolean>`

Check if a project exists.

```typescript
const exists = await api.projects.exists("my-project");
// true or false
```

### `search(query?): Promise<ProjectSearchResponse>`

Search for projects.

```typescript
const results = await api.projects.search("my-");
/*
{
  paging: { pageIndex: 1, pageSize: 100, total: 3 },
  components: [
    { key: "my-project", name: "My Project", qualifier: "TRK", visibility: "private" },
    ...
  ]
}
*/
```

### `delete(projectKey): Promise<void>`

Delete a project.

```typescript
await api.projects.delete("my-project");
```

### `generateToken(params): Promise<TokenGenerateResponse>`

Generate analysis token for a project.

```typescript
const token = await api.projects.generateToken({
  name: "ci-token",
  projectKey: "my-project",
  type: "PROJECT_ANALYSIS_TOKEN",
  expirationDate: "2025-12-31", // optional
});
// { login: "admin", name: "ci-token", token: "sqp_xxx", type: "PROJECT_ANALYSIS_TOKEN" }
```

### `setQualityGate(projectKey, gateName): Promise<void>`

Assign a quality gate to a project.

```typescript
await api.projects.setQualityGate("my-project", "Enterprise");
```

### `configureSettings(projectKey, settings): Promise<void>`

Configure project settings.

```typescript
await api.projects.configureSettings("my-project", {
  "sonar.coverage.exclusions": "**/test/**",
  "sonar.cpd.exclusions": "**/generated/**",
});
```

## IssuesAPI

Query and manage issues.

### `search(params): Promise<IssuesSearchResponse>`

Search for issues with filtering.

```typescript
const issues = await api.issues.search({
  projectKey: "my-project",
  severities: ["BLOCKER", "CRITICAL"],
  types: ["BUG", "VULNERABILITY"],
  statuses: ["OPEN", "CONFIRMED"],
  resolved: false,
  pageSize: 100,
});
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `projectKey` | `string` | Project key (required) |
| `severities` | `IssueSeverity[]` | Filter by severity |
| `types` | `IssueType[]` | Filter by type |
| `statuses` | `string[]` | Filter by status |
| `resolved` | `boolean` | Include resolved issues |
| `assigned` | `boolean` | Only assigned issues |
| `branch` | `string` | Branch name |
| `pullRequest` | `string` | Pull request ID |
| `pageSize` | `number` | Results per page (max 500) |
| `page` | `number` | Page number |

### `getFormattedIssues(params): Promise<FormattedIssue[]>`

Get issues in a simplified format for AI agents.

```typescript
const issues = await api.issues.getFormattedIssues({
  projectKey: "my-project",
  severities: ["BLOCKER", "CRITICAL", "MAJOR"],
});
/*
[
  {
    severity: "CRITICAL",
    type: "BUG",
    rule: "typescript:S1854",
    message: "Remove this useless assignment to variable 'x'",
    file: "src/utils/helper.ts",
    line: 42,
    effort: "5min",
    quickFixAvailable: true
  },
  ...
]
*/
```

### `getCounts(projectKey): Promise<IssueCounts>`

Get issue counts by severity.

```typescript
const counts = await api.issues.getCounts("my-project");
// { total: 10, blocker: 0, critical: 1, major: 4, minor: 3, info: 2 }
```

### `getByFile(projectKey, filePath): Promise<FormattedIssue[]>`

Get issues for a specific file.

```typescript
const fileIssues = await api.issues.getByFile("my-project", "src/app.ts");
```

## QualityGateAPI

Manage quality gates and metrics.

### `getStatus(projectKey): Promise<QualityGateStatusResponse>`

Get quality gate status for a project.

```typescript
const status = await api.qualityGate.getStatus("my-project");
/*
{
  projectStatus: {
    status: "ERROR",
    conditions: [
      {
        status: "ERROR",
        metricKey: "coverage",
        comparator: "LT",
        errorThreshold: "80",
        actualValue: "65.5"
      },
      {
        status: "OK",
        metricKey: "bugs",
        comparator: "GT",
        errorThreshold: "0",
        actualValue: "0"
      }
    ]
  }
}
*/
```

### `formatStatus(response): string`

Format quality gate status as human-readable string.

```typescript
const status = await api.qualityGate.getStatus("my-project");
const formatted = api.qualityGate.formatStatus(status);
/*
Quality Gate: ERROR

Failed Conditions:
- coverage: 65.5 (threshold: >= 80)

Passed Conditions:
- bugs: 0 (threshold: <= 0)
*/
```

### `getQualityMetrics(projectKey): Promise<QualityMetrics>`

Get detailed quality metrics.

```typescript
const metrics = await api.qualityGate.getQualityMetrics("my-project");
/*
{
  coverage: 85.5,
  duplications: 1.2,
  bugs: 0,
  vulnerabilities: 0,
  codeSmells: 5,
  securityHotspots: 0,
  reliabilityRating: "A",
  securityRating: "A",
  maintainabilityRating: "A",
  linesOfCode: 2500
}
*/
```

### `list(): Promise<QualityGatesListResponse>`

List all quality gates.

```typescript
const gates = await api.qualityGate.list();
/*
{
  qualitygates: [
    { id: 1, name: "Sonar way", isDefault: true, isBuiltIn: true },
    { id: 2, name: "Enterprise", isDefault: false, isBuiltIn: false }
  ],
  default: 1
}
*/
```

### `create(name): Promise<{ id: number; name: string }>`

Create a new quality gate.

```typescript
const gate = await api.qualityGate.create("My Custom Gate");
// { id: 5, name: "My Custom Gate" }
```

### `createCondition(gateName, condition): Promise<void>`

Add a condition to a quality gate.

```typescript
await api.qualityGate.createCondition("My Custom Gate", {
  metric: "coverage",
  op: "LT",
  error: "80",
});
```

## RulesAPI

Get rule details and explanations.

### `getRule(ruleKey): Promise<Rule | null>`

Get detailed information about a specific rule.

```typescript
const rule = await api.rules.getRule("typescript:S3776");
/*
{
  key: "typescript:S3776",
  name: "Cognitive Complexity of functions should not be too high",
  severity: "CRITICAL",
  type: "CODE_SMELL",
  description: "Cognitive Complexity is a measure of how hard...",
  langName: "TypeScript",
  tags: ["brain-overload"]
}
*/
```

### `searchRules(params): Promise<RulesSearchResponse>`

Search for rules with filtering.

```typescript
const rules = await api.rules.searchRules({
  languages: "ts",
  severities: "CRITICAL,BLOCKER",
  types: "BUG,VULNERABILITY",
});
```

## SourcesAPI

Fetch source code context for issues.

### `getSourceLines(params): Promise<SourceLine[]>`

Get source code lines for a component.

```typescript
const lines = await api.sources.getSourceLines({
  key: "my-project:src/app.ts",
  from: 40,
  to: 50,
});
/*
[
  { line: 40, code: "function processData() {" },
  { line: 41, code: "  const result = [];", scmRevision: "abc123" },
  ...
]
*/
```

### `getIssuesWithContext(issues, contextLines): Promise<IssueWithContext[]>`

Get issues with surrounding source code context.

```typescript
const issuesWithContext = await api.sources.getIssuesWithContext(issues, 5);
// Returns issues with 5 lines of context above and below
```

### `formatIssueWithContext(issue): string`

Format an issue with context as markdown.

```typescript
const formatted = api.sources.formatIssueWithContext(issueWithContext);
/*
### CRITICAL: Remove this useless assignment
**File:** src/utils.ts:42
**Rule:** typescript:S1854

\`\`\`typescript
40 | function calculate() {
41 |   let result = 0;
42 > |   result = getValue(); // Issue here
43 |   return result;
44 | }
\`\`\`
*/
```

## DuplicationsAPI

Find code duplications across the project.

### `getDuplications(componentKey): Promise<DuplicationBlock[]>`

Get duplications for a specific file.

```typescript
const duplications = await api.duplications.getDuplications("my-project:src/utils.ts");
/*
[
  {
    blocks: [
      { from: 10, size: 15, file: "src/utils.ts" },
      { from: 50, size: 15, file: "src/helpers.ts" }
    ]
  }
]
*/
```

### `getProjectDuplications(projectKey): Promise<FileDuplication[]>`

Get all duplications in a project.

```typescript
const allDups = await api.duplications.getProjectDuplications("my-project");
```

### `formatForAgent(duplications): string`

Format duplications as markdown for AI agents.

```typescript
const formatted = api.duplications.formatForAgent(duplications);
```

## ProjectAnalysesAPI

Get analysis history.

### `getAnalyses(params): Promise<Analysis[]>`

Get past analyses for a project.

```typescript
const analyses = await api.analyses.getAnalyses({
  projectKey: "my-project",
  branch: "main",
  pageSize: 10,
});
/*
[
  {
    key: "AYx...",
    date: "2024-01-15T10:30:00Z",
    projectVersion: "1.0.0",
    events: [{ category: "VERSION", name: "1.0.0" }]
  },
  ...
]
*/
```

### `formatAnalysesForAgent(analyses): string`

Format analysis history as markdown.

```typescript
const formatted = api.analyses.formatAnalysesForAgent(analyses);
```

## QualityProfilesAPI

Get quality profile information.

### `getProjectProfiles(projectKey): Promise<QualityProfile[]>`

Get quality profiles assigned to a project.

```typescript
const profiles = await api.profiles.getProjectProfiles("my-project");
/*
[
  {
    key: "AYx...",
    name: "Sonar way",
    language: "ts",
    languageName: "TypeScript",
    isDefault: true,
    isBuiltIn: true,
    activeRuleCount: 245,
    rulesUpdatedAt: "2024-01-10T00:00:00Z"
  }
]
*/
```

### `getInheritance(profileKey): Promise<ProfileInheritance>`

Get profile inheritance tree.

```typescript
const inheritance = await api.profiles.getInheritance("profile-key");
```

### `formatProfilesForAgent(profiles, projectKey): string`

Format profiles as markdown.

```typescript
const formatted = api.profiles.formatProfilesForAgent(profiles, "my-project");
```

## BranchesAPI

Multi-branch analysis management.

### `getBranches(projectKey): Promise<Branch[]>`

Get all branches for a project.

```typescript
const branches = await api.branches.getBranches("my-project");
/*
[
  {
    name: "main",
    isMain: true,
    type: "LONG",
    status: { qualityGateStatus: "OK" },
    analysisDate: "2024-01-15T10:30:00Z"
  },
  {
    name: "feature/auth",
    isMain: false,
    type: "SHORT",
    status: { qualityGateStatus: "ERROR" }
  }
]
*/
```

### `deleteBranch(projectKey, branchName): Promise<void>`

Delete a branch.

```typescript
await api.branches.deleteBranch("my-project", "old-feature");
```

### `formatBranchesForAgent(branches): string`

Format branches as markdown.

```typescript
const formatted = api.branches.formatBranchesForAgent(branches);
```

## MetricsAPI

Get detailed metrics with period comparison.

### `getMeasures(params): Promise<Measure[]>`

Get measures for a component.

```typescript
const measures = await api.metrics.getMeasures({
  componentKey: "my-project",
  metricKeys: ["coverage", "bugs", "vulnerabilities"],
});
```

### `getMeasuresWithPeriod(params): Promise<MeasureWithPeriod[]>`

Get measures with new code period comparison.

```typescript
const measures = await api.metrics.getMeasuresWithPeriod({
  componentKey: "my-project",
  branch: "main",
});
/*
[
  {
    metric: "coverage",
    value: "85.5",
    period: { value: "2.3" }  // Change in new code period
  },
  ...
]
*/
```

### `formatMeasuresForAgent(measures): string`

Format measures as markdown with interpretation.

```typescript
const formatted = api.metrics.formatMeasuresForAgent(measures);
```

## ComponentsAPI

Get files and directories with issue counts.

### `getWorstFiles(projectKey, limit): Promise<ComponentWithMeasures[]>`

Get files with the most issues (for prioritizing refactoring).

```typescript
const worstFiles = await api.components.getWorstFiles("my-project", 10);
/*
[
  {
    key: "my-project:src/legacy/old-code.ts",
    name: "old-code.ts",
    path: "src/legacy/old-code.ts",
    measures: [
      { metric: "bugs", value: "5" },
      { metric: "code_smells", value: "23" },
      { metric: "vulnerabilities", value: "2" }
    ]
  },
  ...
]
*/
```

### `getWorstDirectories(projectKey, limit): Promise<ComponentWithMeasures[]>`

Get directories with the most issues.

```typescript
const worstDirs = await api.components.getWorstDirectories("my-project", 5);
```

### `formatWorstFilesForAgent(files): string`

Format worst files as markdown for AI agents.

```typescript
const formatted = api.components.formatWorstFilesForAgent(worstFiles);
/*
## Files with Most Issues

| File | Bugs | Vulnerabilities | Code Smells | Total |
|------|------|-----------------|-------------|-------|
| src/legacy/old-code.ts | 5 | 2 | 23 | 30 |
| src/utils/helpers.ts | 2 | 0 | 15 | 17 |
...
*/
```

## ComputeEngineAPI

Track analysis task status.

### `getTask(taskId): Promise<Task>`

Get status of an analysis task.

```typescript
const task = await api.computeEngine.getTask("AYx...");
/*
{
  id: "AYx...",
  type: "REPORT",
  componentKey: "my-project",
  status: "SUCCESS",
  submittedAt: "2024-01-15T10:30:00Z",
  executedAt: "2024-01-15T10:31:00Z",
  executionTimeMs: 45000
}
*/
```

### `waitForAnalysis(projectKey, options): Promise<Task>`

Wait for an analysis to complete.

```typescript
const task = await api.computeEngine.waitForAnalysis("my-project", {
  timeout: 120000,  // 2 minutes
  pollInterval: 2000  // Check every 2 seconds
});
```

### `getComponentQueue(componentKey): Promise<Task[]>`

Get pending tasks for a component.

```typescript
const queue = await api.computeEngine.getComponentQueue("my-project");
```

## Scanner Functions

### `runScanner(options): Promise<ScannerResult>`

Run the SonarQube scanner.

```typescript
import { runScanner } from "opencode-sonarqube";

const result = await runScanner({
  url: "https://sonarqube.example.com",
  token: "sqp_xxx",
  projectKey: "my-project",
  sources: "src",
  directory: "./",
});
// { success: true, output: "..." }
```

### `runAnalysis(config, state, options, directory): Promise<AnalysisResult>`

Run complete analysis including scanner and result fetching.

```typescript
import { runAnalysis, loadConfig, getProjectState } from "opencode-sonarqube";

const config = loadConfig();
const state = await getProjectState("./");
const result = await runAnalysis(config, state, { projectKey: state.projectKey }, "./");
/*
{
  success: true,
  qualityGateStatus: "OK",
  issues: { total: 5, blocker: 0, critical: 1, major: 2, minor: 2, info: 0 },
  metrics: { coverage: 85.5, ... },
  formattedIssues: [...],
  timestamp: "2024-01-15T10:30:00Z"
}
*/
```

### `formatAnalysisResult(result): string`

Format analysis result as markdown for AI agents.

```typescript
const formatted = formatAnalysisResult(result);
/*
## SonarQube Analysis Results
**Quality Gate: [PASS] OK**

### Summary
- Blockers: 0, Critical: 1, Major: 2, Minor: 2, Info: 0

### Metrics
- Coverage: 85.5%
- Duplications: 1.2%
...
*/
```

### `detectProjectType(directory): Promise<ProjectType>`

Detect project languages and framework.

```typescript
import { detectProjectType } from "opencode-sonarqube";

const type = await detectProjectType("./my-project");
// { languages: ["typescript", "javascript"], framework: "bun" }
```

### `writePropertiesFile(directory, options): Promise<string>`

Generate and write sonar-project.properties file.

```typescript
import { writePropertiesFile } from "opencode-sonarqube";

const path = await writePropertiesFile("./", {
  projectKey: "my-project",
  projectName: "My Project",
  sources: "src",
  tests: "tests",
});
// "./sonar-project.properties"
```

## Configuration Functions

### `loadConfig(): SonarQubeConfig | null`

Load configuration from environment variables.

```typescript
import { loadConfig } from "opencode-sonarqube";

// Requires: SONAR_HOST_URL, SONAR_USER, SONAR_PASSWORD
const config = loadConfig();
if (!config) {
  console.error("SonarQube not configured");
}
```

### `getProjectKey(directory): Promise<string>`

Get or generate project key for a directory.

```typescript
import { getProjectKey } from "opencode-sonarqube";

const key = await getProjectKey("./my-project");
// "my-project" (from package.json name or directory name)
```

### `getProjectName(directory): Promise<string>`

Get project display name.

```typescript
import { getProjectName } from "opencode-sonarqube";

const name = await getProjectName("./my-project");
// "My Project" (from package.json or directory name)
```

## Bootstrap Functions

### `bootstrap(options): Promise<BootstrapResult>`

Initialize a project in SonarQube.

```typescript
import { bootstrap, loadConfig } from "opencode-sonarqube";

const config = loadConfig();
const result = await bootstrap({
  config,
  directory: "./my-project",
  force: false, // set true to reinitialize
});
/*
{
  success: true,
  projectKey: "my-project",
  projectToken: "sqp_xxx",
  qualityGate: "Enterprise",
  languages: ["typescript"],
  message: "Project created successfully",
  isNewProject: true
}
*/
```

### `needsBootstrap(directory): Promise<boolean>`

Check if project needs initialization.

```typescript
import { needsBootstrap } from "opencode-sonarqube";

if (await needsBootstrap("./my-project")) {
  console.log("Project needs setup");
}
```

### `getProjectState(directory): Promise<ProjectState | null>`

Load project state from `.sonarqube/project.json`.

```typescript
import { getProjectState } from "opencode-sonarqube";

const state = await getProjectState("./my-project");
/*
{
  projectKey: "my-project",
  projectToken: "sqp_xxx",
  tokenName: "my-project-opencode",
  initializedAt: "2024-01-15T10:00:00Z",
  lastAnalysis: "2024-01-15T12:00:00Z",
  languages: ["typescript"],
  qualityGate: "Enterprise",
  setupComplete: true
}
*/
```

## Types

### `SonarQubeConfig`

```typescript
interface SonarQubeConfig {
  url: string;           // SonarQube server URL
  user: string;          // Username
  password: string;      // Password
  level: AnalysisLevel;  // "enterprise" | "standard" | "relaxed" | "off"
  autoAnalyze: boolean;  // Auto-analyze on idle
  projectKey?: string;   // Override project key
  projectName?: string;  // Override project name
  qualityGate?: string;  // Quality gate name
  newCodeDefinition: NewCodeDefinition;
  sources: string;       // Source directories
  tests?: string;        // Test directories
  exclusions?: string;   // Exclusion patterns
}
```

### `ProjectState`

```typescript
interface ProjectState {
  projectKey: string;
  projectToken: string;
  tokenName: string;
  initializedAt: string;
  lastAnalysis?: string;
  languages: string[];
  qualityGate?: string;
  setupComplete: boolean;
}
```

### `AnalysisResult`

```typescript
interface AnalysisResult {
  success: boolean;
  qualityGateStatus: QualityGateStatus;
  issues: {
    total: number;
    blocker: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
  };
  metrics: {
    coverage?: number;
    duplications?: number;
    codeSmells?: number;
    bugs?: number;
    vulnerabilities?: number;
    securityHotspots?: number;
  };
  formattedIssues: FormattedIssue[];
  timestamp: string;
}
```

### `FormattedIssue`

```typescript
interface FormattedIssue {
  severity: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
  type: "BUG" | "VULNERABILITY" | "CODE_SMELL" | "SECURITY_HOTSPOT";
  rule: string;
  message: string;
  file: string;
  line?: number;
  effort?: string;
  quickFixAvailable: boolean;
}
```

### `IssueSeverity`

```typescript
type IssueSeverity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
```

### `IssueType`

```typescript
type IssueType = "BUG" | "VULNERABILITY" | "CODE_SMELL" | "SECURITY_HOTSPOT";
```

### `QualityGateStatus`

```typescript
type QualityGateStatus = "OK" | "WARN" | "ERROR" | "NONE";
```

### `AnalysisLevel`

```typescript
type AnalysisLevel = "enterprise" | "standard" | "relaxed" | "off";
```

## Error Classes

### `SonarQubeError`

Base error class for all SonarQube errors.

```typescript
class SonarQubeError extends Error {
  code: string;
  statusCode?: number;
}
```

### `ConnectionError`

Network or connectivity issues.

```typescript
try {
  await api.healthCheck();
} catch (e) {
  if (e instanceof ConnectionError) {
    console.error("Cannot connect to SonarQube server");
  }
}
```

### `AuthenticationError`

Invalid credentials or token.

```typescript
try {
  await api.projects.create({ project: "test", name: "Test" });
} catch (e) {
  if (e instanceof AuthenticationError) {
    console.error("Invalid credentials");
  }
}
```

### `ProjectNotFoundError`

Project does not exist.

```typescript
try {
  await api.qualityGate.getStatus("nonexistent");
} catch (e) {
  if (e instanceof ProjectNotFoundError) {
    console.error("Project not found:", e.message);
  }
}
```

### `RateLimitError`

API rate limit exceeded.

```typescript
try {
  await api.issues.search({ projectKey: "test" });
} catch (e) {
  if (e instanceof RateLimitError) {
    console.error("Rate limited, retry later");
  }
}
```

### `SetupError`

Bootstrap or configuration errors.

```typescript
try {
  await bootstrap({ config, directory: "./" });
} catch (e) {
  if (e instanceof SetupError) {
    console.error("Setup failed:", e.message);
  }
}
```

## Logger

Custom logger with child loggers and level filtering.

```typescript
import { Logger, createLogger } from "opencode-sonarqube";

// Create logger (standalone)
const logger = new Logger("my-module");

// Create logger with OpenCode client (for plugin use)
const logger = createLogger("my-module", ctx.client);

// Log at different levels
logger.debug("Debug message", { extra: "data" });
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message", { error: e });

// Create child logger
const childLogger = logger.child("sub-module");
// Logs as: [my-module:sub-module] message
```
