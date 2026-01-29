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
   * Format connection error with recovery hints
   */
  connectionError(serverUrl: string): string {
    return `Cannot connect to SonarQube server at ${serverUrl}

**The server appears to be offline or unreachable.**

Possible causes:
1. Server is down or restarting
2. Network connectivity issues (VPN, firewall)
3. Incorrect URL in configuration

What you can do:
- Continue coding - the plugin will auto-retry when the server is available
- Check server status manually: curl -s "${serverUrl}/api/system/status"
- Verify your network connection
- Try again later with: sonarqube({ action: "status" })

Your last analysis results are preserved in .sonarqube/project.json`;
  },

  /**
   * Format timeout error
   */
  timeoutError(action: string, timeoutMs: number): string {
    return `Action \`${action}\` timed out after ${timeoutMs / 1000} seconds.

This usually means:
1. The SonarQube server is under heavy load
2. Network latency is very high
3. The analysis is taking longer than expected

Suggestions:
- Try again in a few minutes
- For large projects, analysis may take several minutes
- Check server health: sonarqube({ action: "status" })`;
  },

  /**
   * Format offline mode message
   */
  offlineMode(cachedData?: { lastAnalysis?: string; qualityGate?: string }): string {
    let msg = `**Operating in offline mode** - SonarQube server is not reachable.`;
    
    if (cachedData?.lastAnalysis) {
      msg += `\n\nLast known status (from ${cachedData.lastAnalysis}):`;
      if (cachedData.qualityGate) {
        msg += `\n- Quality Gate: ${cachedData.qualityGate}`;
      }
    }
    
    msg += `\n\nThe plugin will automatically reconnect when the server is available.`;
    return msg;
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
