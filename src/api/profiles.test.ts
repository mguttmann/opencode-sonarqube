/**
 * Tests for QualityProfilesAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { QualityProfilesAPI } from "./profiles.ts";
import { SonarQubeClient } from "./client.ts";

const originalFetch = globalThis.fetch;

describe("QualityProfilesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: QualityProfilesAPI;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    client = new SonarQubeClient({
      url: "https://sonar.example.com",
      auth: { token: "test-token" },
    });
    api = new QualityProfilesAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getProjectProfiles", () => {
    test("fetches profiles for project", async () => {
      const mockResponse = {
        profiles: [
          {
            key: "profile-1",
            name: "Sonar way",
            language: "ts",
            languageName: "TypeScript",
            isBuiltIn: true,
            isDefault: true,
            isInherited: false,
            activeRuleCount: 200,
            activeDeprecatedRuleCount: 0,
          },
        ],
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getProjectProfiles("test-project");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Sonar way");
      expect(result[0].isBuiltIn).toBe(true);
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getProjectProfiles("test-project");

      expect(result).toEqual([]);
    });
  });

  describe("getAllProfiles", () => {
    test("fetches all profiles", async () => {
      const mockResponse = {
        profiles: [
          {
            key: "p1",
            name: "Profile 1",
            language: "ts",
            languageName: "TypeScript",
            isBuiltIn: true,
            isDefault: true,
            isInherited: false,
            activeRuleCount: 100,
            activeDeprecatedRuleCount: 5,
          },
          {
            key: "p2",
            name: "Profile 2",
            language: "js",
            languageName: "JavaScript",
            isBuiltIn: false,
            isDefault: false,
            isInherited: true,
            activeRuleCount: 150,
            activeDeprecatedRuleCount: 0,
          },
        ],
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getAllProfiles();

      expect(result).toHaveLength(2);
    });
  });

  describe("getInheritance", () => {
    test("fetches inheritance info", async () => {
      const mockResponse = {
        profile: { key: "p1", name: "My Profile", activeRuleCount: 100 },
        ancestors: [{ key: "p0", name: "Parent", activeRuleCount: 90 }],
        children: [],
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getInheritance("p1");

      expect(result?.profile.name).toBe("My Profile");
      expect(result?.ancestors).toHaveLength(1);
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getInheritance("p1");

      expect(result).toBeUndefined();
    });
  });

  describe("formatProfilesForAgent", () => {
    test("formats profiles by language", () => {
      const profiles = [
        {
          key: "p1",
          name: "Sonar way",
          language: "ts",
          languageName: "TypeScript",
          isBuiltIn: true,
          isDefault: true,
          isInherited: false,
          activeRuleCount: 200,
          activeDeprecatedRuleCount: 3,
        },
      ];

      const result = api.formatProfilesForAgent(profiles, "test-project");

      expect(result).toContain("## Quality Profiles for test-project");
      expect(result).toContain("### TypeScript");
      expect(result).toContain("**Sonar way** (Default, Built-in)");
      expect(result).toContain("200 rules");
      expect(result).toContain("⚠️ 3 deprecated");
    });

    test("returns message for empty profiles", () => {
      const result = api.formatProfilesForAgent([]);

      expect(result).toBe("No quality profiles found.");
    });
  });
});
