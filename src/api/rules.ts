/**
 * SonarQube Rules API
 * Provides rule descriptions for better fix suggestions
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import { API } from "../constants.ts";

/**
 * Rule details from SonarQube
 */
export interface RuleDetails {
  key: string;
  name: string;
  description: string;
  severity: string;
  type: string;
  lang?: string;
  langName?: string;
  tags: string[];
}

/**
 * Description section from SonarQube v26+
 */
interface DescriptionSection {
  key: string;
  content: string;
}

/**
 * Rules search response
 */
interface RulesSearchResponse {
  rules: Array<{
    key: string;
    name: string;
    htmlDesc?: string;
    mdDesc?: string;
    // SonarQube v26+ uses descriptionSections instead of htmlDesc/mdDesc
    descriptionSections?: DescriptionSection[];
    severity: string;
    type: string;
    lang?: string;
    langName?: string;
    tags?: string[];
    sysTags?: string[];
  }>;
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
}

export class RulesAPI extends BaseAPI {
  private readonly cache: Map<string, RuleDetails> = new Map();

  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-rules", logger);
  }

  /**
   * Convert raw rule response to RuleDetails
   */
  private parseRuleResponse(rule: RulesSearchResponse["rules"][0]): RuleDetails {
    // Extract description from mdDesc, htmlDesc, or descriptionSections (v26+)
    let rawDescription = rule.mdDesc ?? rule.htmlDesc ?? "";
    if (!rawDescription && rule.descriptionSections) {
      // Prefer 'introduction' section, fallback to 'root_cause'
      const introSection = rule.descriptionSections.find(s => s.key === "introduction");
      const rootCauseSection = rule.descriptionSections.find(s => s.key === "root_cause");
      rawDescription = introSection?.content ?? rootCauseSection?.content ?? "";
    }
    
    // Merge tags and sysTags (v26+ uses sysTags)
    const allTags = [...(rule.tags ?? []), ...(rule.sysTags ?? [])];
    
    return {
      key: rule.key,
      name: rule.name,
      description: this.cleanDescription(rawDescription),
      severity: rule.severity,
      type: rule.type,
      lang: rule.lang,
      langName: rule.langName,
      tags: allTags,
    };
  }

  /**
   * Get rule details by key
   */
  async getRule(ruleKey: string): Promise<RuleDetails | undefined> {
    // Check cache first
    const cached = this.cache.get(ruleKey);
    if (cached) {
      return cached;
    }

    this.logger.debug(`Fetching rule details: ${ruleKey}`);

    try {
      const response = await this.client.get<RulesSearchResponse>(
        "/api/rules/search",
        {
          rule_key: ruleKey,
          ps: 1,
        }
      );

      if (response.rules.length === 0) {
        return undefined;
      }

      const details = this.parseRuleResponse(response.rules[0]);

      // Cache the result
      this.cache.set(ruleKey, details);

      return details;
    } catch (error) {
      this.logger.warn(`Failed to fetch rule ${ruleKey}: ${error}`);
      return undefined;
    }
  }

  /**
   * Get rules for multiple keys (batch)
   */
  async getRules(ruleKeys: string[]): Promise<Map<string, RuleDetails>> {
    const result = new Map<string, RuleDetails>();
    const uncached: string[] = [];

    // Check cache first
    for (const key of ruleKeys) {
      const cached = this.cache.get(key);
      if (cached) {
        result.set(key, cached);
      } else {
        uncached.push(key);
      }
    }

    // Fetch uncached rules
    if (uncached.length > 0) {
      try {
        const response = await this.client.get<RulesSearchResponse>(
          "/api/rules/search",
          {
            rule_key: uncached.join(","),
            ps: API.DEFAULT_PAGE_SIZE,
          }
        );

        for (const rule of response.rules) {
          const details = this.parseRuleResponse(rule);
          this.cache.set(rule.key, details);
          result.set(rule.key, details);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch rules: ${error}`);
      }
    }

    return result;
  }

  /**
   * Format rule for agent with fix suggestions
   */
  formatRuleForAgent(rule: RuleDetails): string {
    const lines = [
      `### Rule: ${rule.name}`,
      `**Key:** \`${rule.key}\``,
      `**Severity:** ${rule.severity} | **Type:** ${rule.type}`,
    ];

    if (rule.tags.length > 0) {
      lines.push(`**Tags:** ${rule.tags.join(", ")}`);
    }

    if (rule.description) {
      lines.push("", "**Description:**", rule.description);
    }

    return lines.join("\n");
  }

  /**
   * Clean HTML/markdown description
   */
  private cleanDescription(desc: string): string {
    // Remove HTML tags
    let clean = desc.replaceAll(/<[^>]*>/g, "");
    // Decode HTML entities
    clean = clean
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&nbsp;", " ");
    // Trim and limit length
    clean = clean.trim();
    if (clean.length > 500) {
      clean = clean.substring(0, 497) + "...";
    }
    return clean;
  }
}
