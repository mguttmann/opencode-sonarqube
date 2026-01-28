/**
 * Tests for ProjectsAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ProjectsAPI } from "./projects.ts";
import { SonarQubeClient } from "./client.ts";
// Error factory functions are no longer needed in imports since we use toMatchObject

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("ProjectsAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: ProjectsAPI;

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
    api = new ProjectsAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("create", () => {
    test("creates a project with default options", async () => {
      const mockResponse = {
        project: { key: "my-project", name: "My Project", qualifier: "TRK" },
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

      const result = await api.create({
        projectKey: "my-project",
        name: "My Project",
      });

      expect(result.project.key).toBe("my-project");
      
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/projects/create");
      expect(options.body).toContain("mainBranch=main");
      expect(options.body).toContain("visibility=private");
    });

    test("creates a project with custom options", async () => {
      const mockResponse = {
        project: { key: "my-project", name: "My Project", qualifier: "TRK" },
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

      await api.create({
        projectKey: "my-project",
        name: "My Project",
        mainBranch: "master",
        visibility: "public",
      });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.body).toContain("mainBranch=master");
      expect(options.body).toContain("visibility=public");
    });
  });

  describe("search", () => {
    test("searches for projects with defaults", async () => {
      const mockResponse = {
        components: [{ key: "project-1", name: "Project 1" }],
        paging: { pageIndex: 1, pageSize: 100, total: 1 },
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

      const result = await api.search();

      expect(result.components).toHaveLength(1);
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("ps=100");
      expect(callUrl).toContain("p=1");
    });

    test("searches with query parameters", async () => {
      const mockResponse = {
        components: [],
        paging: { pageIndex: 2, pageSize: 50, total: 0 },
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

      await api.search({
        projects: "proj1,proj2",
        query: "test",
        pageSize: 50,
        page: 2,
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("projects=proj1%2Cproj2");
      expect(callUrl).toContain("q=test");
      expect(callUrl).toContain("ps=50");
      expect(callUrl).toContain("p=2");
    });
  });

  describe("exists", () => {
    test("returns true when project exists", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              components: [{ key: "my-project", name: "My Project" }],
              paging: { pageIndex: 1, pageSize: 100, total: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.exists("my-project");

      expect(result).toBe(true);
    });

    test("returns false when project does not exist", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              components: [],
              paging: { pageIndex: 1, pageSize: 100, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.exists("nonexistent");

      expect(result).toBe(false);
    });

    test("returns false on API error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.exists("my-project");

      expect(result).toBe(false);
    });
  });

  describe("get", () => {
    test("returns project when found", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              components: [{ key: "my-project", name: "My Project", qualifier: "TRK" }],
              paging: { pageIndex: 1, pageSize: 100, total: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.get("my-project");

      expect(result).not.toBeNull();
      expect(result?.key).toBe("my-project");
    });

    test("returns null when project not found", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              components: [],
              paging: { pageIndex: 1, pageSize: 100, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.get("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    test("deletes a project", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response("", { status: 204 })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.delete("my-project");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/projects/delete");
      expect(options.body).toContain("project=my-project");
    });
  });

  describe("generateToken", () => {
    test("generates a token with default name", async () => {
      const mockResponse = {
        login: "admin",
        name: "opencode-my-project-123",
        token: "sqp_secret_token",
        type: "PROJECT_ANALYSIS_TOKEN",
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

      const result = await api.generateToken({ projectKey: "my-project" });

      expect(result.token).toBe("sqp_secret_token");
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.body).toContain("type=PROJECT_ANALYSIS_TOKEN");
      expect(options.body).toContain("projectKey=my-project");
    });

    test("generates a token with custom name and expiration", async () => {
      const mockResponse = {
        login: "admin",
        name: "custom-token",
        token: "sqp_secret_token",
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

      await api.generateToken({
        projectKey: "my-project",
        tokenName: "custom-token",
        expirationDate: "2025-12-31",
      });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.body).toContain("name=custom-token");
      expect(options.body).toContain("expirationDate=2025-12-31");
    });
  });

  describe("revokeToken", () => {
    test("revokes a token by name", async () => {
      mockFetch = mock(() =>
        Promise.resolve(new Response("", { status: 204 }))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.revokeToken("my-token");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/user_tokens/revoke");
      expect(options.body).toContain("name=my-token");
    });
  });

  describe("setQualityGate", () => {
    test("sets quality gate when gate exists", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                qualitygates: [
                  { id: 1, name: "Default" },
                  { id: 2, name: "Strict" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.resolve(new Response("", { status: 204 }));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.setQualityGate("my-project", "Strict");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, options] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(url).toContain("/api/qualitygates/select");
      expect(options.body).toContain("projectKey=my-project");
      expect(options.body).toContain("gateId=2");
    });

    test("does nothing when gate not found", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              qualitygates: [{ id: 1, name: "Default" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.setQualityGate("my-project", "NonExistent");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("ensureExists", () => {
    test("returns existing project without creating", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              components: [{ key: "my-project", name: "My Project", qualifier: "TRK", visibility: "private" }],
              paging: { pageIndex: 1, pageSize: 100, total: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.ensureExists({
        projectKey: "my-project",
        name: "My Project",
      });

      expect(result.created).toBe(false);
      expect(result.project.key).toBe("my-project");
    });

    test("creates project when it does not exist", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // exists() check - returns empty
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [],
                paging: { pageIndex: 1, pageSize: 100, total: 0 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // create()
        return Promise.resolve(
          new Response(
            JSON.stringify({
              project: { key: "new-project", name: "New Project", qualifier: "TRK" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.ensureExists({
        projectKey: "new-project",
        name: "New Project",
        mainBranch: "main",
      });

      expect(result.created).toBe(true);
      expect(result.project.key).toBe("new-project");
    });

    test("sets quality gate after creating project", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // exists() check
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [],
                paging: { pageIndex: 1, pageSize: 100, total: 0 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (callCount === 2) {
          // create()
          return Promise.resolve(
            new Response(
              JSON.stringify({
                project: { key: "new-project", name: "New", qualifier: "TRK" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (callCount === 3) {
          // qualitygates/list
          return Promise.resolve(
            new Response(
              JSON.stringify({
                qualitygates: [{ id: 5, name: "Enterprise" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // qualitygates/select
        return Promise.resolve(new Response("", { status: 204 }));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.ensureExists({
        projectKey: "new-project",
        name: "New",
        qualityGate: "Enterprise",
      });

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    test("handles quality gate error gracefully", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [],
                paging: { pageIndex: 1, pageSize: 100, total: 0 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (callCount === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                project: { key: "new-project", name: "New", qualifier: "TRK" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // Quality gate API fails
        return Promise.reject(new Error("API Error"));
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // Should not throw
      const result = await api.ensureExists({
        projectKey: "new-project",
        name: "New",
        qualityGate: "Enterprise",
      });

      expect(result.created).toBe(true);
    });

    test("throws ProjectNotFoundError when exists but get returns null", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // exists() returns true
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [{ key: "my-project", name: "My Project" }],
                paging: { pageIndex: 1, pageSize: 100, total: 1 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // get() returns empty (race condition scenario)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              components: [],
              paging: { pageIndex: 1, pageSize: 100, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(
        api.ensureExists({
          projectKey: "my-project",
          name: "My Project",
        })
      ).rejects.toMatchObject({
        name: "ProjectNotFoundError",
        message: "Project 'my-project' not found",
      });
    });
  });
});
