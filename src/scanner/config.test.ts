/**
 * Tests for scanner configuration
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectProjectType,
  generatePropertiesContent,
  writePropertiesFile,
} from "./config.ts";

describe("Scanner Config", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "scanner-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("detectProjectType", () => {
    test("detects TypeScript project", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/tsconfig.json`, "{}");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("typescript");
      expect(result.languages).toContain("javascript");
    });

    test("detects JavaScript-only project", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("javascript");
      expect(result.languages).not.toContain("typescript");
    });

    test("detects npm package manager", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/package-lock.json`, "{}");

      const result = await detectProjectType(testDir);

      expect(result.packageManager).toBe("npm");
    });

    test("detects yarn package manager", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/yarn.lock`, "");

      const result = await detectProjectType(testDir);

      expect(result.packageManager).toBe("yarn");
    });

    test("detects pnpm package manager", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/pnpm-lock.yaml`, "");

      const result = await detectProjectType(testDir);

      expect(result.packageManager).toBe("pnpm");
    });

    test("detects bun package manager", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/bun.lockb`, "");

      const result = await detectProjectType(testDir);

      expect(result.packageManager).toBe("bun");
    });

    test("detects Python project with requirements.txt", async () => {
      await Bun.write(`${testDir}/requirements.txt`, "flask==2.0.0");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("python");
    });

    test("detects Python project with pyproject.toml", async () => {
      await Bun.write(`${testDir}/pyproject.toml`, "[tool.poetry]");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("python");
    });

    test("detects Java project with pom.xml", async () => {
      await Bun.write(`${testDir}/pom.xml`, "<project></project>");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("java");
    });

    test("detects Java project with build.gradle", async () => {
      await Bun.write(`${testDir}/build.gradle`, "plugins {}");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("java");
    });

    test("detects Go project", async () => {
      await Bun.write(`${testDir}/go.mod`, "module test");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("go");
    });

    test("detects Rust project", async () => {
      await Bun.write(`${testDir}/Cargo.toml`, "[package]");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("rust");
    });

    test("detects PHP project", async () => {
      await Bun.write(`${testDir}/composer.json`, "{}");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("php");
    });

    test("detects Ruby project", async () => {
      await Bun.write(`${testDir}/Gemfile`, "source 'https://rubygems.org'");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("ruby");
    });

    test("returns generic for unknown project", async () => {
      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("generic");
    });

    test("detects Jest test framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          devDependencies: { jest: "^29.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.testFramework).toBe("jest");
      expect(result.coverageReportPath).toBe("coverage/lcov.info");
    });

    test("detects Vitest test framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.testFramework).toBe("vitest");
    });

    test("detects React framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          dependencies: { react: "^18.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.framework).toBe("react");
    });

    test("detects Next.js framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          dependencies: { next: "^14.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.framework).toBe("next");
    });

    test("detects Vue framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          dependencies: { vue: "^3.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.framework).toBe("vue");
    });

    test("detects Angular framework", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          dependencies: { "@angular/core": "^17.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.framework).toBe("angular");
    });

    test("detects multiple languages", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/tsconfig.json`, "{}");
      await Bun.write(`${testDir}/requirements.txt`, "");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("typescript");
      expect(result.languages).toContain("python");
    });
  });

  describe("generatePropertiesContent", () => {
    test("generates properties with project key", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "my-project" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.projectKey=my-project");
    });

    test("includes project name when provided", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "key", projectName: "My Project" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.projectName=My Project");
    });

    test("uses detected source directories or passed sources", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "key", sources: "src,lib" }, // explicit sources are respected
        undefined,
        testDir
      );

      // Uses the passed sources configuration
      expect(content).toContain("sonar.sources=src,lib");
      // Does NOT use sonar.inclusions (that was the SonarQube 26.x bug!)
      expect(content).not.toContain("sonar.inclusions=");
    });

    test("includes TypeScript config for TS projects with glob pattern", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));
      await Bun.write(`${testDir}/tsconfig.json`, "{}");

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      // Uses glob pattern to find all tsconfig files in project
      expect(content).toContain("sonar.typescript.tsconfigPaths=**/tsconfig.json");
    });

    test("includes Python settings for Python projects", async () => {
      await Bun.write(`${testDir}/requirements.txt`, "");

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.python.coverage.reportPaths");
    });

    test("includes Java settings for Java projects", async () => {
      await Bun.write(`${testDir}/pom.xml`, "<project></project>");

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.java.binaries");
    });

    test("includes Go settings for Go projects", async () => {
      await Bun.write(`${testDir}/go.mod`, "module test");

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.go.coverage.reportPaths");
    });

    test("includes exclusions", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.exclusions=");
      expect(content).toContain("node_modules");
    });

    test("includes test patterns", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "key" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.test.inclusions=");
      expect(content).toContain("*.test.ts");
    });

    test("includes additional properties", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        {
          projectKey: "key",
          additionalProperties: {
            "custom.property": "value",
          },
        },
        undefined,
        testDir
      );

      expect(content).toContain("custom.property=value");
    });
  });

  describe("writePropertiesFile", () => {
    test("writes file to disk", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const filePath = await writePropertiesFile(
        { projectKey: "my-project" },
        undefined,
        testDir
      );

      expect(filePath).toBe(`${testDir}/sonar-project.properties`);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("sonar.projectKey=my-project");
    });
  });

  describe("additional coverage for edge cases", () => {
    test("detects c8/nyc coverage tool", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          devDependencies: { c8: "^7.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.coverageReportPath).toBe("coverage/lcov.info");
    });

    test("detects nyc coverage tool", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          devDependencies: { nyc: "^15.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      expect(result.coverageReportPath).toBe("coverage/lcov.info");
    });

    test("handles missing package.json gracefully", async () => {
      // No package.json - should return empty/generic
      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("generic");
    });

    test("handles invalid package.json gracefully", async () => {
      await Bun.write(`${testDir}/package.json`, "{ invalid json }");

      const result = await detectProjectType(testDir);

      // Should not throw - valid package.json still detected as JS even if malformed
      // The important thing is it doesn't crash
      expect(result.languages.length).toBeGreaterThan(0);
    });

    test("generates properties with tests directory", async () => {
      await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "test" }));

      const content = await generatePropertiesContent(
        { projectKey: "test-project", tests: "tests,__tests__" },
        {
          url: "http://sonar.example.com",
          user: "admin",
          password: "admin",
          level: "enterprise",
          autoAnalyze: true,
          newCodeDefinition: "previous_version",
          sources: "src",
          tests: "tests",
        },
        testDir
      );

      expect(content).toContain("sonar.tests=tests,__tests__");
    });

    test("generates properties with coverage report path for TypeScript with Jest", async () => {
      await Bun.write(
        `${testDir}/package.json`,
        JSON.stringify({
          name: "test",
          devDependencies: { jest: "^29.0.0" },
        })
      );
      await Bun.write(`${testDir}/tsconfig.json`, "{}");

      const content = await generatePropertiesContent(
        { projectKey: "test-project" },
        undefined,
        testDir
      );

      expect(content).toContain("sonar.javascript.lcov.reportPaths=coverage/lcov.info");
    });

    test("generates config for Rust projects without sonar.inclusions", async () => {
      await Bun.write(`${testDir}/Cargo.toml`, "[package]");

      const content = await generatePropertiesContent(
        { projectKey: "rust-project" },
        undefined,
        testDir
      );

      // Should NOT contain sonar.inclusions (that was the bug!)
      expect(content).not.toContain("sonar.inclusions=");
      expect(content).toContain("sonar.sources=");
    });

    test("generates config for PHP projects without sonar.inclusions", async () => {
      await Bun.write(`${testDir}/composer.json`, "{}");

      const content = await generatePropertiesContent(
        { projectKey: "php-project" },
        undefined,
        testDir
      );

      // Should NOT contain sonar.inclusions (that was the bug!)
      expect(content).not.toContain("sonar.inclusions=");
      expect(content).toContain("sonar.sources=");
    });

    test("generates config for Ruby projects without sonar.inclusions", async () => {
      await Bun.write(`${testDir}/Gemfile`, "source 'https://rubygems.org'");

      const content = await generatePropertiesContent(
        { projectKey: "ruby-project" },
        undefined,
        testDir
      );

      // Should NOT contain sonar.inclusions (that was the bug!)
      expect(content).not.toContain("sonar.inclusions=");
      expect(content).toContain("sonar.sources=");
    });
  });
});
