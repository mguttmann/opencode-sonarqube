/**
 * SonarQube Quality Profiles API
 * Provides access to quality profile information
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import type { QualityProfile, ProfileInheritance } from "./types.ts";

// Re-export types for backwards compatibility
export type { QualityProfile, ProfileInheritance } from "./types.ts";

/**
 * Profile search response
 */
interface ProfileSearchResponse {
  profiles: QualityProfile[];
}

export class QualityProfilesAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-profiles", logger);
  }

  /**
   * Get quality profiles for a project
   */
  async getProjectProfiles(projectKey: string): Promise<QualityProfile[]> {
    this.logger.info(`>>> getProjectProfiles called`, { projectKey, projectKeyLength: projectKey?.length });
    
    if (!this.validateProjectKey(projectKey, "getProjectProfiles")) {
      return [];
    }

    return this.safeRequest(
      async () => {
        const response = await this.client.get<ProfileSearchResponse>(
          "/api/qualityprofiles/search",
          { project: projectKey }
        );
        this.logger.info(`<<< getProjectProfiles success`, { profileCount: response.profiles.length });
        return response.profiles;
      },
      [],
      `getProjectProfiles failed for ${projectKey}`
    );
  }

  /**
   * Get all available quality profiles
   */
  async getAllProfiles(language?: string): Promise<QualityProfile[]> {
    const languageInfo = language ? ` for ${language}` : "";
    this.logger.debug(`Getting all profiles${languageInfo}`);

    try {
      const response = await this.client.get<ProfileSearchResponse>(
        "/api/qualityprofiles/search",
        { language }
      );
      return response.profiles;
    } catch (error) {
      this.logger.warn(`Failed to get profiles: ${error}`);
      return [];
    }
  }

  /**
   * Get profile inheritance tree
   */
  async getInheritance(profileKey: string): Promise<ProfileInheritance | undefined> {
    this.logger.debug(`Getting inheritance for profile ${profileKey}`);

    return this.safeRequest(
      async () => {
        return await this.client.get<ProfileInheritance>(
          "/api/qualityprofiles/inheritance",
          { qualityProfile: profileKey }
        );
      },
      undefined,
      `Failed to get inheritance for ${profileKey}`
    );
  }

  /**
   * Format profiles for agent display
   */
  formatProfilesForAgent(profiles: QualityProfile[], projectKey?: string): string {
    if (profiles.length === 0) {
      return "No quality profiles found.";
    }

    const header = projectKey 
      ? `## Quality Profiles for ${projectKey}` 
      : "## Available Quality Profiles";
    const lines = [header, ""];

    const byLanguage = this.groupProfilesByLanguage(profiles);

    for (const [language, langProfiles] of byLanguage) {
      lines.push(`### ${language}`);
      for (const profile of langProfiles) {
        lines.push(this.formatProfileEntry(profile));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Group profiles by language
   */
  private groupProfilesByLanguage(profiles: QualityProfile[]): Map<string, QualityProfile[]> {
    const byLanguage = new Map<string, QualityProfile[]>();
    for (const profile of profiles) {
      const existing = byLanguage.get(profile.languageName) ?? [];
      existing.push(profile);
      byLanguage.set(profile.languageName, existing);
    }
    return byLanguage;
  }

  /**
   * Format a single profile entry
   */
  private formatProfileEntry(profile: QualityProfile): string {
    const badges = this.getProfileBadges(profile);
    const badgeStr = badges.length > 0 ? ` (${badges.join(", ")})` : "";
    const deprecatedWarning = this.getDeprecatedWarning(profile);
    return `- **${profile.name}**${badgeStr}: ${profile.activeRuleCount} rules${deprecatedWarning}`;
  }

  /**
   * Get profile badges
   */
  private getProfileBadges(profile: QualityProfile): string[] {
    const badges: string[] = [];
    if (profile.isDefault) badges.push("Default");
    if (profile.isBuiltIn) badges.push("Built-in");
    if (profile.isInherited) badges.push("Inherited");
    return badges;
  }

  /**
   * Get deprecated rules warning
   */
  private getDeprecatedWarning(profile: QualityProfile): string {
    if (profile.activeDeprecatedRuleCount > 0) {
      return ` ⚠️ ${profile.activeDeprecatedRuleCount} deprecated`;
    }
    return "";
  }
}
