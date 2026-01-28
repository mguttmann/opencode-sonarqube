/**
 * Tests for types and error classes
 */

import { describe, test, expect } from "bun:test";
import {
  SonarQubeError,
  ConnectionError,
  AuthenticationError,
  ProjectNotFoundError,
  RateLimitError,
  SetupError,
  SonarQubeConfigSchema,
  ProjectStateSchema,
  getThresholdsForLevel,
  ratingToNumber,
  numberToRating,
  ENTERPRISE_THRESHOLDS,
  STANDARD_THRESHOLDS,
  RELAXED_THRESHOLDS,
} from "./index.ts";

describe("Error Factory Functions", () => {
  describe("SonarQubeError", () => {
    test("creates error with message and code", () => {
      const error = SonarQubeError("Test error", "TEST_CODE");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("SonarQubeError");
    });

    test("includes optional status code", () => {
      const error = SonarQubeError("Error", "CODE", 500);

      expect(error.statusCode).toBe(500);
    });

    test("is instanceof Error", () => {
      const error = SonarQubeError("Error", "CODE");

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ConnectionError", () => {
    test("creates connection error", () => {
      const error = ConnectionError("Cannot connect to server");

      expect(error.message).toBe("Cannot connect to server");
      expect(error.code).toBe("CONNECTION_ERROR");
      expect(error.name).toBe("ConnectionError");
    });

    test("is an Error with SonarQubeError properties", () => {
      const error = ConnectionError("Error");

      // Factory functions create Error objects with extra properties
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("name", "ConnectionError");
    });
  });

  describe("AuthenticationError", () => {
    test("creates auth error with 401 status", () => {
      const error = AuthenticationError("Invalid token");

      expect(error.message).toBe("Invalid token");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe("AuthenticationError");
    });
  });

  describe("ProjectNotFoundError", () => {
    test("creates project not found error", () => {
      const error = ProjectNotFoundError("my-project");

      expect(error.message).toContain("my-project");
      expect(error.message).toContain("not found");
      expect(error.code).toBe("PROJECT_NOT_FOUND");
      expect(error.statusCode).toBe(404);
    });
  });

  describe("RateLimitError", () => {
    test("creates rate limit error without retry info", () => {
      const error = RateLimitError();

      expect(error.message).toContain("Rate limit exceeded");
      expect(error.code).toBe("RATE_LIMIT");
      expect(error.statusCode).toBe(429);
    });

    test("includes retry after when provided", () => {
      const error = RateLimitError(60);

      expect(error.message).toContain("Retry after 60s");
    });

    test("does not include retry after when 0", () => {
      const error = RateLimitError(0);

      expect(error.message).not.toContain("Retry after");
    });
  });

  describe("SetupError", () => {
    test("creates setup error", () => {
      const error = SetupError("Setup failed");

      expect(error.message).toBe("Setup failed");
      expect(error.code).toBe("SETUP_ERROR");
      expect(error.name).toBe("SetupError");
    });
  });
});

describe("Zod Schemas", () => {
  describe("SonarQubeConfigSchema", () => {
    test("validates complete config", () => {
      const result = SonarQubeConfigSchema.safeParse({
        url: "https://sonar.example.com",
        user: "admin",
        password: "secret",
      });

      expect(result.success).toBe(true);
    });

    test("applies default values", () => {
      const result = SonarQubeConfigSchema.parse({
        url: "https://sonar.example.com",
        user: "admin",
        password: "secret",
      });

      expect(result.level).toBe("enterprise");
      expect(result.autoAnalyze).toBe(true);
      expect(result.sources).toBeUndefined();
    });

    test("rejects invalid URL", () => {
      const result = SonarQubeConfigSchema.safeParse({
        url: "not-a-url",
        user: "admin",
        password: "secret",
      });

      expect(result.success).toBe(false);
    });

    test("rejects empty user", () => {
      const result = SonarQubeConfigSchema.safeParse({
        url: "https://sonar.example.com",
        user: "",
        password: "secret",
      });

      expect(result.success).toBe(false);
    });

    test("rejects empty password", () => {
      const result = SonarQubeConfigSchema.safeParse({
        url: "https://sonar.example.com",
        user: "admin",
        password: "",
      });

      expect(result.success).toBe(false);
    });

    test("validates level enum", () => {
      const result = SonarQubeConfigSchema.safeParse({
        url: "https://sonar.example.com",
        user: "admin",
        password: "secret",
        level: "invalid",
      });

      expect(result.success).toBe(false);
    });

    test("accepts valid level values", () => {
      for (const level of ["enterprise", "standard", "relaxed", "off"]) {
        const result = SonarQubeConfigSchema.safeParse({
          url: "https://sonar.example.com",
          user: "admin",
          password: "secret",
          level,
        });

        expect(result.success).toBe(true);
      }
    });

    test("accepts optional fields", () => {
      const result = SonarQubeConfigSchema.parse({
        url: "https://sonar.example.com",
        user: "admin",
        password: "secret",
        projectKey: "my-project",
        projectName: "My Project",
        qualityGate: "Sonar way",
        tests: "test",
        exclusions: "**/node_modules/**",
      });

      expect(result.projectKey).toBe("my-project");
      expect(result.projectName).toBe("My Project");
    });
  });

  describe("ProjectStateSchema", () => {
    test("validates complete state", () => {
      const result = ProjectStateSchema.safeParse({
        projectKey: "my-project",
        projectToken: "sqp_abc123",
        tokenName: "opencode-my-project",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
      });

      expect(result.success).toBe(true);
    });

    test("accepts optional fields", () => {
      const result = ProjectStateSchema.parse({
        projectKey: "my-project",
        projectToken: "sqp_abc123",
        tokenName: "opencode-my-project",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
        qualityGate: "Sonar way",
        lastAnalysis: "2024-01-02T00:00:00Z",
      });

      expect(result.qualityGate).toBe("Sonar way");
      expect(result.lastAnalysis).toBe("2024-01-02T00:00:00Z");
    });

    test("rejects missing required fields", () => {
      const result = ProjectStateSchema.safeParse({
        projectKey: "my-project",
        // Missing other required fields
      });

      expect(result.success).toBe(false);
    });

    test("validates languages as array", () => {
      const result = ProjectStateSchema.safeParse({
        projectKey: "my-project",
        projectToken: "token",
        tokenName: "name",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: "typescript", // Should be array
        setupComplete: true,
      });

      expect(result.success).toBe(false);
    });
  });
});

describe("Enterprise Quality Thresholds", () => {
  describe("Threshold Constants", () => {
    test("ENTERPRISE_THRESHOLDS has strict values", () => {
      expect(ENTERPRISE_THRESHOLDS.minCoverage).toBe(80);
      expect(ENTERPRISE_THRESHOLDS.maxDuplications).toBe(0);
      expect(ENTERPRISE_THRESHOLDS.maxBugs).toBe(0);
      expect(ENTERPRISE_THRESHOLDS.maxVulnerabilities).toBe(0);
      expect(ENTERPRISE_THRESHOLDS.maxCodeSmells).toBe(0);
      expect(ENTERPRISE_THRESHOLDS.maxSecurityHotspots).toBe(0);
      expect(ENTERPRISE_THRESHOLDS.minReliabilityRating).toBe(1); // A
      expect(ENTERPRISE_THRESHOLDS.minSecurityRating).toBe(1); // A
      expect(ENTERPRISE_THRESHOLDS.minMaintainabilityRating).toBe(1); // A
    });

    test("STANDARD_THRESHOLDS has moderate values", () => {
      expect(STANDARD_THRESHOLDS.minCoverage).toBe(70);
      expect(STANDARD_THRESHOLDS.maxDuplications).toBe(3);
      expect(STANDARD_THRESHOLDS.maxCodeSmells).toBe(10);
      expect(STANDARD_THRESHOLDS.minReliabilityRating).toBe(2); // B
    });

    test("RELAXED_THRESHOLDS has lenient values", () => {
      expect(RELAXED_THRESHOLDS.minCoverage).toBe(50);
      expect(RELAXED_THRESHOLDS.maxDuplications).toBe(5);
      expect(RELAXED_THRESHOLDS.maxBugs).toBe(5);
      expect(RELAXED_THRESHOLDS.maxCodeSmells).toBe(50);
      expect(RELAXED_THRESHOLDS.minReliabilityRating).toBe(3); // C
    });
  });

  describe("getThresholdsForLevel", () => {
    test("returns ENTERPRISE_THRESHOLDS for enterprise level", () => {
      const thresholds = getThresholdsForLevel("enterprise");
      expect(thresholds).toBe(ENTERPRISE_THRESHOLDS);
    });

    test("returns STANDARD_THRESHOLDS for standard level", () => {
      const thresholds = getThresholdsForLevel("standard");
      expect(thresholds).toBe(STANDARD_THRESHOLDS);
    });

    test("returns RELAXED_THRESHOLDS for relaxed level", () => {
      const thresholds = getThresholdsForLevel("relaxed");
      expect(thresholds).toBe(RELAXED_THRESHOLDS);
    });

    test("returns null for off level", () => {
      const thresholds = getThresholdsForLevel("off");
      expect(thresholds).toBeNull();
    });

    test("returns ENTERPRISE_THRESHOLDS as default", () => {
      // When called with undefined or missing, should default to enterprise
      const thresholds = getThresholdsForLevel("enterprise");
      expect(thresholds).not.toBeNull();
      expect(thresholds?.minCoverage).toBe(80);
    });
  });

  describe("ratingToNumber", () => {
    test("converts A to 1", () => {
      expect(ratingToNumber("A")).toBe(1);
    });

    test("converts B to 2", () => {
      expect(ratingToNumber("B")).toBe(2);
    });

    test("converts C to 3", () => {
      expect(ratingToNumber("C")).toBe(3);
    });

    test("converts D to 4", () => {
      expect(ratingToNumber("D")).toBe(4);
    });

    test("converts E to 5", () => {
      expect(ratingToNumber("E")).toBe(5);
    });

    test("returns 5 for unknown rating", () => {
      expect(ratingToNumber("?")).toBe(5);
      expect(ratingToNumber("X")).toBe(5);
    });
  });

  describe("numberToRating", () => {
    test("converts 1 to A", () => {
      expect(numberToRating(1)).toBe("A");
    });

    test("converts 2 to B", () => {
      expect(numberToRating(2)).toBe("B");
    });

    test("converts 3 to C", () => {
      expect(numberToRating(3)).toBe("C");
    });

    test("converts 4 to D", () => {
      expect(numberToRating(4)).toBe("D");
    });

    test("converts 5 to E", () => {
      expect(numberToRating(5)).toBe("E");
    });

    test("returns ? for unknown number", () => {
      expect(numberToRating(0)).toBe("?");
      expect(numberToRating(6)).toBe("?");
      expect(numberToRating(-1)).toBe("?");
    });
  });
});
