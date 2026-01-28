/**
 * Standardized error message templates
 */

export const ErrorMessages = {
  /**
   * Format missing parameter error
   */
  missingParameter(param: string, example?: string): string {
    let msg = `Missing required parameter: ${param}`;
    if (example) {
      msg += `\n\nExample: ${example}`;
    }
    return msg;
  },

  /**
   * Format not found error
   */
  notFound(entity: string, key: string, suggestions?: string[]): string {
    let msg = `${entity} not found: ${key}`;
    if (suggestions?.length) {
      const suggestionList = suggestions.map(s => "- " + s).join('\n');
      msg += "\n\nDid you mean:\n" + suggestionList;
    }
    return msg;
  },

  /**
   * Format configuration error
   */
  configurationMissing(message: string, requiredSteps?: string[]): string {
    let msg = message;
    if (requiredSteps?.length) {
      const stepList = requiredSteps.map((s, i) => (i + 1) + ". " + s).join('\n');
      msg += "\n\nRequired steps:\n" + stepList;
    }
    return msg;
  },

  /**
   * Format API error with troubleshooting hints
   */
  apiError(action: string, message: string, serverUrl?: string): string {
    let msg = `Action \`${action}\` failed: ${message}`;
    const hints = [
      serverUrl ? `SonarQube server is reachable at ${serverUrl}` : 'SonarQube server is reachable',
      'Credentials are valid',
      'Run with action: "setup" to initialize',
    ];
    const hintList = hints.map((h, i) => (i + 1) + ". " + h).join('\n');
    msg += "\n\nPlease check:\n" + hintList;
    return msg;
  },

  /**
   * Format connection error
   */
  connectionError(serverUrl: string): string {
    return `Cannot connect to SonarQube server at ${serverUrl}`;
  },

  /**
   * Format authentication error
   */
  authenticationError(reason: string): string {
    return `Authentication failed: ${reason}`;
  },

  /**
   * Format rule not found with helpful hints
   */
  ruleNotFound(ruleKey: string): string {
    return `Rule \`${ruleKey}\` was not found.

Please check:
1. The rule key is correct (e.g., "typescript:S1234")
2. The rule is available on your SonarQube server
3. The rule's language plugin is installed`;
  },

  /**
   * Format missing rule key parameter
   */
  missingRuleKey(): string {
    return `Missing \`ruleKey\` parameter. Please provide a rule key to explain.

Example usage:
\`\`\`
sonarqube({ action: "rule", ruleKey: "typescript:S1234" })
\`\`\`

Common rule prefixes:
- \`typescript:\` - TypeScript rules
- \`javascript:\` - JavaScript rules
- \`java:\` - Java rules
- \`python:\` - Python rules
- \`common-\` - Language-agnostic rules`;
  },
};
