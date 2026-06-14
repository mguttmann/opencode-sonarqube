/**
 * Tests for Plugin Entry Point
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SonarQubePlugin } from "./index.ts";
import { runCLI, CLI_HELP, executeCLI } from "./cli.ts";
import * as configModule from "./utils/config.ts";
import * as bootstrapModule from "./bootstrap/index.ts";
import * as scannerModule from "./scanner/index.ts";
import * as apiModule from "./api/index.ts";
import * as hooksModule from "./hooks/index.ts";

// Create a comprehensive mock client that matches OpenCode SDK interface
const createMockClient = () => ({
  app: {
    log: async () => ({ data: true }),
    agents: async () => ({ data: [] }),
  },
  session: {
    prompt: async () => ({ data: { info: {}, parts: [] } }),
    list: async () => ({ data: [] }),
    get: async () => ({ data: {} }),
    create: async () => ({ data: {} }),
    delete: async () => ({ data: true }),
    update: async () => ({ data: {} }),
    messages: async () => ({ data: [] }),
    abort: async () => ({ data: true }),
  },
  global: {
    health: async () => ({ data: { healthy: true, version: "1.0.0" } }),
  },
  project: {
    list: async () => ({ data: [] }),
    current: async () => ({ data: {} }),
  },
  config: {
    get: async () => ({ data: {} }),
    providers: async () => ({ data: { providers: [], default: {} } }),
  },
  file: {
    read: async () => ({ data: { type: "raw", content: "" } }),
    status: async () => ({ data: [] }),
  },
  find: {
    text: async () => ({ data: [] }),
    files: async () => ({ data: [] }),
    symbols: async () => ({ data: [] }),
  },
  event: {
    subscribe: async () => ({ stream: [] }),
  },
  path: {
    get: async () => ({ data: {} }),
  },
  auth: {
    set: async () => ({ data: true }),
  },
  tui: {
    appendPrompt: async () => ({ data: true }),
    openHelp: async () => ({ data: true }),
    openSessions: async () => ({ data: true }),
    openThemes: async () => ({ data: true }),
    openModels: async () => ({ data: true }),
    submitPrompt: async () => ({ data: true }),
    clearPrompt: async () => ({ data: true }),
    executeCommand: async () => ({ data: true }),
    showToast: async () => ({ data: true }),
  },
  postSessionIdPermissionsPermissionId: async () => ({ data: true }),
  pty: {},
} as any);

// Mock plugin context matching PluginInput
const createMockContext = (overrides?: Record<string, unknown>) => ({
  directory: "/tmp/test-project",
  worktree: "/tmp/test-project",
  client: createMockClient(),
  project: { 
    id: "test-project-id",
    path: "/tmp/test-project", 
    name: "test-project",
    worktree: "/tmp/test-project",
    time: { created: new Date().toISOString() },
  },
  serverUrl: new URL("http://localhost:4096"),
  $: Bun.$,
  ...overrides,
}) as any;

describe("SonarQubePlugin", () => {
  let createHooksSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createHooksSpy = spyOn(hooksModule, "createHooks");
  });

  afterEach(() => {
    createHooksSpy.mockRestore();
  });

  test("initializes plugin and returns correct structure", async () => {
    createHooksSpy.mockReturnValue({
      sessionIdle: async () => undefined,
      fileEdited: () => {},
    });

    const plugin = await SonarQubePlugin(createMockContext());

    expect(plugin).toBeDefined();
    expect(typeof plugin.event).toBe("function");
    expect(typeof plugin["tool.execute.before"]).toBe("function");
    expect(plugin.tool).toBeDefined();
    expect(plugin.tool?.sonarqube).toBeDefined();
  });

  test("uses worktree directory when available", async () => {
    let capturedGetDirectory: (() => string) | undefined;
    createHooksSpy.mockImplementation((
      _getConfig: () => Record<string, unknown> | undefined,
      getDirectory: () => string
    ) => {
      capturedGetDirectory = getDirectory;
      return {
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      };
    });

    await SonarQubePlugin(createMockContext({ worktree: "/tmp/worktree" }));

    expect(capturedGetDirectory?.()).toBe("/tmp/worktree");
  });

  test("uses directory when worktree not available", async () => {
    let capturedGetDirectory: (() => string) | undefined;
    createHooksSpy.mockImplementation((
      _getConfig: () => Record<string, unknown> | undefined,
      getDirectory: () => string
    ) => {
      capturedGetDirectory = getDirectory;
      return {
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      };
    });

    await SonarQubePlugin(createMockContext({ directory: "/tmp/main-dir", worktree: undefined }));

    expect(capturedGetDirectory?.()).toBe("/tmp/main-dir");
  });

  describe("event handler", () => {
    let loadConfigSpy: ReturnType<typeof spyOn>;
    let getEditedFilesSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Mock loadConfig to return auto-analyze enabled config
      loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);
      
      // Mock getEditedFiles to return files
      getEditedFilesSpy = spyOn(hooksModule, "getEditedFiles").mockReturnValue([
        "src/test.ts",
      ]);
    });

    afterEach(() => {
      loadConfigSpy.mockRestore();
      getEditedFilesSpy.mockRestore();
    });

    test("handles session.idle event", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Analysis complete!",
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      // First set the session ID via session.created event
      await plugin.event?.({ 
        event: { 
          type: "session.created", 
          properties: { info: { id: "test-session-123" } } 
        } as any 
      });
      
      // Then trigger session.idle
      await plugin.event?.({ 
        event: { 
          type: "session.idle", 
          properties: { sessionID: "test-session-123" } 
        } as any 
      });

      // Should have called prompt to inject the message
      expect(promptSpy).toHaveBeenCalled();
    });

    test("handles session.idle with no message", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin.event?.({ 
        event: { 
          type: "session.idle", 
          properties: {} 
        } as any 
      });

      // Should not have called prompt since no message
      expect(promptSpy).not.toHaveBeenCalled();
    });

    test("tracks session ID from session.created", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Analysis message",
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      // Set session ID
      await plugin.event?.({ 
        event: { 
          type: "session.created", 
          properties: { info: { id: "my-session" } } 
        } as any 
      });
      
      // Trigger idle
      await plugin.event?.({ 
        event: { 
          type: "session.idle", 
          properties: {} 
        } as any 
      });

      // Check the prompt was called with the session ID
      expect(promptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: "my-session" },
        })
      );
    });

    test("skips analysis when autoAnalyze is disabled", async () => {
      // Override to disable auto-analyze
      loadConfigSpy.mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: false,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Analysis complete!",
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin.event?.({ 
        event: { 
          type: "session.created", 
          properties: { info: { id: "test-session" } } 
        } as any 
      });
      
      await plugin.event?.({ 
        event: { 
          type: "session.idle", 
          properties: {} 
        } as any 
      });

      // Should NOT have called prompt since autoAnalyze is disabled
      expect(promptSpy).not.toHaveBeenCalled();
    });

    test("skips analysis when no edited files", async () => {
      // Override to return no edited files
      getEditedFilesSpy.mockReturnValue([]);

      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Analysis complete!",
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin.event?.({ 
        event: { 
          type: "session.created", 
          properties: { info: { id: "test-session" } } 
        } as any 
      });
      
      await plugin.event?.({ 
        event: { 
          type: "session.idle", 
          properties: {} 
        } as any 
      });

      // Should NOT have called prompt since no edited files
      expect(promptSpy).not.toHaveBeenCalled();
    });
  });

  describe("tool.execute.before hook", () => {
    test("loads config on sonarqube tool execution", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));
        
        // First call should load config
        await plugin["tool.execute.before"]?.(
          { tool: "sonarqube", sessionID: "test", callID: "call-1" },
          { args: {} }
        );

        // Plugin loaded successfully
        expect(plugin.tool?.sonarqube).toBeDefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
      }
    });

    test("ignores non-sonarqube tools", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      // Should not throw for other tools
      await plugin["tool.execute.before"]?.(
        { tool: "other-tool", sessionID: "test", callID: "call-1" },
        { args: {} }
      );
    });
  });

  describe("tool.execute.after hook", () => {
    test("logs analysis completion on PASS", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const logSpy = spyOn(mockClient.app, "log");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin["tool.execute.after"]?.(
        { tool: "sonarqube", sessionID: "test", callID: "call-1" },
        { title: "SonarQube", output: "Quality Gate: [PASS] OK", metadata: {} }
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "info",
            message: expect.stringContaining("PASSED"),
          }),
        })
      );
    });

    test("logs analysis completion on FAIL", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const logSpy = spyOn(mockClient.app, "log");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin["tool.execute.after"]?.(
        { tool: "sonarqube", sessionID: "test", callID: "call-1" },
        { title: "SonarQube", output: "Quality Gate: [FAIL] ERROR", metadata: {} }
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "warn",
            message: expect.stringContaining("FAILED"),
          }),
        })
      );
    });

    test("does not log for non-analysis results", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      // Spy after initialization to avoid counting init logs
      const logSpy = spyOn(mockClient.app, "log");
      
      await plugin["tool.execute.after"]?.(
        { tool: "sonarqube", sessionID: "test", callID: "call-1" },
        { title: "SonarQube", output: "Setup complete", metadata: {} }
      );

      // Should not log since no PASS or FAIL in output
      expect(logSpy).not.toHaveBeenCalled();
    });

    test("ignores non-sonarqube tools", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      // Spy after initialization to avoid counting init logs
      const logSpy = spyOn(mockClient.app, "log");
      
      await plugin["tool.execute.after"]?.(
        { tool: "other-tool", sessionID: "test", callID: "call-1" },
        { title: "Other", output: "[PASS]", metadata: {} }
      );

      // Should not log for non-sonarqube tools
      expect(logSpy).not.toHaveBeenCalled();
    });

    test("tracks file changes from write tool", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const logSpy = spyOn(mockClient.app, "log");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "wrote file 'src/app.ts'", metadata: {} }
        );

        expect(capturedFile).toBe("src/app.ts");
        expect(logSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              level: "debug",
              message: expect.stringContaining("Tracked file change"),
            }),
          })
        );
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("tracks file changes from edit tool", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "mcp_edit", sessionID: "test", callID: "call-1" },
          { title: "Edit", output: "edited src/utils.ts", metadata: {} }
        );

        expect(capturedFile).toBe("src/utils.ts");
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("ignores write/edit tools when autoAnalyze is disabled", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: false, // Disabled
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "wrote file 'src/app.ts'", metadata: {} }
        );

        expect(capturedFile).toBeUndefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("ignores write/edit tools when level is off", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "off", // Level off
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "wrote file 'src/app.ts'", metadata: {} }
        );

        expect(capturedFile).toBeUndefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("ignores write/edit when file path not in output", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "File operation completed", metadata: {} }
        );

        expect(capturedFile).toBeUndefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("ignores write/edit for ignored files", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "wrote file 'node_modules/pkg/index.js'", metadata: {} }
        );

        expect(capturedFile).toBeUndefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("ignores write/edit when config is null", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue(null);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "write", sessionID: "test", callID: "call-1" },
          { title: "Write", output: "wrote file 'src/app.ts'", metadata: {} }
        );

        expect(capturedFile).toBeUndefined();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("detects git pull and suggests analysis", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const promptSpy = spyOn(mockClient.session, "prompt");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        // Set session ID first
        await plugin.event?.({ 
          event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
        });
        
        await plugin["tool.execute.after"]?.(
          { tool: "bash", sessionID: "test", callID: "call-1" },
          { title: "Bash", output: "Updating abc123..def456\nFast-forward\n 2 files changed", metadata: { command: "git pull origin main" } }
        );

        expect(promptSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              noReply: true,
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining("New Code Detected"),
                }),
              ]),
            }),
          })
        );
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("skips git detection when level is off", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "off",
        autoAnalyze: false,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const promptSpy = spyOn(mockClient.session, "prompt");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin.event?.({ 
          event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
        });
        
        await plugin["tool.execute.after"]?.(
          { tool: "bash", sessionID: "test", callID: "call-1" },
          { title: "Bash", output: "Updating abc123..def456\nFast-forward", metadata: { command: "git pull" } }
        );

        // Should not prompt when level is off
        expect(promptSpy).not.toHaveBeenCalled();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("shows toast after successful git push", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "standard",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const toastSpy = spyOn(mockClient.tui, "showToast");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin["tool.execute.after"]?.(
          { tool: "mcp_bash", sessionID: "test", callID: "call-1" },
          { title: "Bash", output: "To github.com:user/repo.git\n   abc123..def456  main -> main", metadata: { command: "git push" } }
        );

        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              message: expect.stringContaining("pushed"),
              variant: "info",
            }),
          })
        );
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });
  });

  describe("tool.execute.before pre-commit check", () => {
    // Skipped: This tests code in /* c8 ignore */ blocks that requires complex mocking of runAnalysis
    // The pre-commit check functionality is tested via manual/integration testing
    test.skip("warns about critical issues before git commit in enterprise mode", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        issues: {
          getCounts: async () => ({ total: 5, blocker: 1, critical: 2, major: 2, minor: 0, info: 0 }),
        },
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const promptSpy = spyOn(mockClient.session, "prompt");
        const toastSpy = spyOn(mockClient.tui, "showToast");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        // Set session ID first
        await plugin.event?.({ 
          event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
        });

        const output = { args: { command: "git commit -m 'test'" } };
        await plugin["tool.execute.before"]?.(
          { tool: "bash", sessionID: "test", callID: "call-1" },
          output
        );

        expect(promptSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining("Pre-Commit Warning"),
                }),
              ]),
            }),
          })
        );
        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              variant: "error",
            }),
          })
        );
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
        createAPISpy.mockRestore();
      }
    });

    test("skips pre-commit check in standard mode", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "standard", // Not enterprise
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const promptSpy = spyOn(mockClient.session, "prompt");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin.event?.({ 
          event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
        });

        const output = { args: { command: "git commit -m 'test'" } };
        await plugin["tool.execute.before"]?.(
          { tool: "bash", sessionID: "test", callID: "call-1" },
          output
        );

        // Should not warn in standard mode
        expect(promptSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining("Pre-Commit Warning"),
                }),
              ]),
            }),
          })
        );
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("skips pre-commit check for amend commits", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const mockClient = createMockClient();
        const promptSpy = spyOn(mockClient.session, "prompt");

        const plugin = await SonarQubePlugin(createMockContext({ client: mockClient, directory: dir, worktree: dir }));
        
        await plugin.event?.({ 
          event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
        });

        const output = { args: { command: "git commit --amend -m 'test'" } };
        await plugin["tool.execute.before"]?.(
          { tool: "bash", sessionID: "test", callID: "call-1" },
          output
        );

        // Should not check for amend commits
        expect(promptSpy).not.toHaveBeenCalled();
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });
  });

  describe("tool property", () => {
    test("provides sonarqube tool with correct structure", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const plugin = await SonarQubePlugin(createMockContext());

      expect(plugin.tool?.sonarqube).toBeDefined();
      expect(plugin.tool?.sonarqube.description).toBeDefined();
      expect(typeof plugin.tool?.sonarqube.execute).toBe("function");
      expect(plugin.tool?.sonarqube.args).toBeDefined();
    });
  });

  describe("file.edited event", () => {
    test("tracks edited files that are not ignored", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      await plugin.event?.({ 
        event: { 
          type: "file.edited", 
          properties: { file: "src/app.ts" } 
        } as any 
      });

      expect(capturedFile).toBe("src/app.ts");
    });

    test("ignores files in node_modules", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      await plugin.event?.({ 
        event: { 
          type: "file.edited", 
          properties: { file: "node_modules/package/index.js" } 
        } as any 
      });

      expect(capturedFile).toBeUndefined();
    });

    test("ignores lock files", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      await plugin.event?.({ 
        event: { 
          type: "file.edited", 
          properties: { file: "package-lock.json" } 
        } as any 
      });

      expect(capturedFile).toBeUndefined();
    });

    test("ignores .d.ts files", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      await plugin.event?.({ 
        event: { 
          type: "file.edited", 
          properties: { file: "src/types.d.ts" } 
        } as any 
      });

      expect(capturedFile).toBeUndefined();
    });

    test("ignores files without path", async () => {
      let capturedFile: string | undefined;
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: ({ filePath }: { filePath: string }) => {
          capturedFile = filePath;
        },
      });

      const plugin = await SonarQubePlugin(createMockContext());
      
      await plugin.event?.({ 
        event: { 
          type: "file.edited", 
          properties: {} 
        } as any 
      });

      expect(capturedFile).toBeUndefined();
    });
  });

  describe("session.error event", () => {
    test("shows error toast on session error", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const mockClient = createMockClient();
      const toastSpy = spyOn(mockClient.tui, "showToast");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));
      
      await plugin.event?.({ 
        event: { 
          type: "session.error", 
          properties: {} 
        } as any 
      });

      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            message: expect.stringContaining("error"),
            variant: "error",
          }),
        })
      );
    });
  });

  describe("session.compacting event", () => {
    test("adds context when analysis result exists", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Quality Gate: [PASS] OK\nBlockers: 0, Critical: 0, Major: 2, Minor: 0, Info: 0",
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);
      
      const getEditedFilesSpy = spyOn(hooksModule, "getEditedFiles").mockReturnValue(["src/test.ts"]);

      const mockClient = createMockClient();
      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      // First trigger session.created to set session ID
      await plugin.event?.({ 
        event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
      });

      // Then trigger session.idle to run analysis and set lastAnalysisResult
      await plugin.event?.({ 
        event: { type: "session.idle", properties: {} } as any 
      });

      // Now test compacting - it should add context
      const output = { context: [] as string[] };
      await plugin["experimental.session.compacting"]?.({} as any, output);

      expect(output.context.length).toBeGreaterThan(0);
      expect(output.context[0]).toContain("SonarQube Analysis State");

      loadConfigSpy.mockRestore();
      getEditedFilesSpy.mockRestore();
    });

    test("adds no context when no analysis result exists", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const plugin = await SonarQubePlugin(createMockContext());

      const output = { context: [] as string[] };
      await plugin["experimental.session.compacting"]?.({} as any, output);

      expect(output.context.length).toBe(0);
    });
  });

  describe("performInitialQualityCheck", () => {
    test("notifies when issues are found on session start", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap").mockResolvedValue(false);
      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "ERROR", conditions: [] } }),
        },
        issues: {
          getCounts: async () => ({ total: 5, blocker: 1, critical: 2, major: 2, minor: 0, info: 0 }),
        },
      } as any);

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");
      const toastSpy = spyOn(mockClient.tui, "showToast");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      // Trigger session.created which should run performInitialQualityCheck
      await plugin.event?.({ 
        event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
      });

      // Should have called prompt to inject the warning
      expect(promptSpy).toHaveBeenCalled();
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            variant: "error",
          }),
        })
      );

      loadConfigSpy.mockRestore();
      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      createAPISpy.mockRestore();
    });

    test("skips check when level is off", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "off",
        autoAnalyze: false,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      await plugin.event?.({ 
        event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
      });

      // Should not have called prompt since level is off
      expect(promptSpy).not.toHaveBeenCalled();

      loadConfigSpy.mockRestore();
    });

    test("skips check when bootstrap is needed", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap").mockResolvedValue(true);

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      await plugin.event?.({ 
        event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
      });

      // Should not have called prompt since bootstrap is needed
      expect(promptSpy).not.toHaveBeenCalled();

      loadConfigSpy.mockRestore();
      needsBootstrapSpy.mockRestore();
    });
  });

  describe("session.updated event", () => {
    test("updates session ID from session.updated event", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Analysis message",
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getEditedFilesSpy = spyOn(hooksModule, "getEditedFiles").mockReturnValue(["src/test.ts"]);

      const mockClient = createMockClient();
      const promptSpy = spyOn(mockClient.session, "prompt");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      // Use session.updated instead of session.created
      await plugin.event?.({ 
        event: { type: "session.updated", properties: { info: { id: "updated-session" } } } as any 
      });

      // Trigger idle
      await plugin.event?.({ 
        event: { type: "session.idle", properties: {} } as any 
      });

      // Check the prompt was called with the updated session ID
      expect(promptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: "updated-session" },
        })
      );

      loadConfigSpy.mockRestore();
      getEditedFilesSpy.mockRestore();
    });
  });

  describe("tool execute method", () => {
    let executeSonarQubeToolSpy: ReturnType<typeof spyOn>;
    
    beforeEach(() => {
      // Import executeSonarQubeTool for mocking
      executeSonarQubeToolSpy = spyOn(require("./tools/sonarqube.ts"), "executeSonarQubeTool");
    });

    afterEach(() => {
      executeSonarQubeToolSpy?.mockRestore();
    });

    test("executes tool and updates analysis result on analyze action", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      executeSonarQubeToolSpy.mockResolvedValue(
        "Quality Gate: [PASS] OK\nBlockers: 0, Critical: 0, Major: 1, Minor: 0, Info: 0"
      );

      const plugin = await SonarQubePlugin(createMockContext());
      
      const result = await plugin.tool?.sonarqube.execute({ action: "analyze" }, {} as any);

      expect(result).toContain("Quality Gate");
      expect(executeSonarQubeToolSpy).toHaveBeenCalled();
    });

    test("executes tool and updates analysis result on status action", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      executeSonarQubeToolSpy.mockResolvedValue(
        "Quality Gate: [FAIL] ERROR\nBlockers: 2, Critical: 1, Major: 3, Minor: 0, Info: 0"
      );

      const plugin = await SonarQubePlugin(createMockContext());
      
      const result = await plugin.tool?.sonarqube.execute({ action: "status" }, {} as any);

      expect(result).toContain("Quality Gate");

      // Check that compaction context is updated
      const output = { context: [] as string[] };
      await plugin["experimental.session.compacting"]?.({} as any, output);
      
      expect(output.context.length).toBeGreaterThan(0);
      expect(output.context[0]).toContain("2 blockers");
    });

    test("executes tool without updating result on other actions", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      executeSonarQubeToolSpy.mockResolvedValue("Setup complete");

      const plugin = await SonarQubePlugin(createMockContext());
      
      const result = await plugin.tool?.sonarqube.execute({ action: "setup" }, {} as any);

      expect(result).toBe("Setup complete");

      // Compaction context should be empty
      const output = { context: [] as string[] };
      await plugin["experimental.session.compacting"]?.({} as any, output);
      
      expect(output.context.length).toBe(0);
    });
  });

  describe("error handling in injection", () => {
    test("logs error when injection fails", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => "Quality Gate: [PASS] OK\nBlockers: 0, Critical: 0, Major: 0",
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getEditedFilesSpy = spyOn(hooksModule, "getEditedFiles").mockReturnValue(["src/test.ts"]);

      const mockClient = createMockClient();
      // Make prompt throw an error
      mockClient.session.prompt = async () => {
        throw new Error("Injection failed");
      };
      const logSpy = spyOn(mockClient.app, "log");

      const plugin = await SonarQubePlugin(createMockContext({ client: mockClient }));

      await plugin.event?.({ 
        event: { type: "session.created", properties: { info: { id: "test-session" } } } as any 
      });

      await plugin.event?.({ 
        event: { type: "session.idle", properties: {} } as any 
      });

      // Should have logged the error
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "error",
            message: expect.stringContaining("Failed"),
          }),
        })
      );

      loadConfigSpy.mockRestore();
      getEditedFilesSpy.mockRestore();
    });
  });

  describe("experimental.chat.system.transform hook", () => {
    test("injects system context when issues exist", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "ERROR", conditions: [] } }),
        },
        issues: {
          getCounts: async () => ({ total: 5, blocker: 2, critical: 1, major: 2, minor: 0, info: 0 }),
          search: async () => ({ paging: { total: 3 }, issues: [], components: [] }),
        },
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        expect(output.system.length).toBeGreaterThan(0);
        expect(output.system[0]).toContain("SonarQube Code Quality Status");
        expect(output.system[0]).toContain("BLOCKER");
        expect(output.system[0]).toContain("enterprise");
        expect(output.system[0]).toContain("New Code Issues");
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
        createAPISpy.mockRestore();
      }
    });

    test("skips injection when level is off", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "off",
        autoAnalyze: false,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        expect(output.system.length).toBe(0);
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
      }
    });

    test("skips injection when config is null", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue(null);

      const plugin = await SonarQubePlugin(createMockContext());

      const output = { system: [] as string[] };
      await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

      expect(output.system.length).toBe(0);

      loadConfigSpy.mockRestore();
    });

    test("skips injection when project state is null", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue(null);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        expect(output.system.length).toBe(0);
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
      }
    });

    test("skips injection when no issues and quality gate passes", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "standard",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "OK", conditions: [] } }),
        },
        issues: {
          getCounts: async () => ({ total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 }),
          search: async () => ({ paging: { total: 0 }, issues: [], components: [] }),
        },
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        expect(output.system.length).toBe(0);
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
        createAPISpy.mockRestore();
      }
    });

    test("handles API errors gracefully", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "enterprise",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        qualityGate: {
          getStatus: async () => { throw new Error("API Error"); },
        },
        issues: {
          getCounts: async () => { throw new Error("API Error"); },
          search: async () => { throw new Error("API Error"); },
        },
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        // Should not throw, should just not add context
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        expect(output.system.length).toBe(0);
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
        createAPISpy.mockRestore();
      }
    });

    test("includes context with failed quality gate but no blocker/critical issues", async () => {
      createHooksSpy.mockReturnValue({
        sessionIdle: async () => undefined,
        fileEdited: () => {},
      });

      const loadConfigSpy = spyOn(configModule, "loadConfig").mockReturnValue({
        url: "http://test.com",
        user: "admin",
        password: "pass",
        level: "standard",
        autoAnalyze: true,
        newCodeDefinition: "previous_version",
        sources: "src",
      } as any);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState").mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      } as any);

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI").mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "ERROR", conditions: [] } }),
        },
        issues: {
          getCounts: async () => ({ total: 5, blocker: 0, critical: 0, major: 5, minor: 0, info: 0 }),
          search: async () => ({ paging: { total: 0 }, issues: [], components: [] }),
        },
      } as any);

      const tempDir = await Bun.$`mktemp -d`.text();
      const dir = tempDir.trim();
      await Bun.write(`${dir}/opencode.json`, JSON.stringify({ sonarqube: { url: "http://test.com" } }));

      try {
        const plugin = await SonarQubePlugin(createMockContext({ directory: dir, worktree: dir }));

        const output = { system: [] as string[] };
        await plugin["experimental.chat.system.transform"]?.({ sessionID: "test" }, output);

        // Should have context because quality gate failed
        expect(output.system.length).toBeGreaterThan(0);
        expect(output.system[0]).toContain("(FAILED)");
        // Should NOT contain BLOCKER message since no blocker issues
        expect(output.system[0]).not.toContain("BLOCKER issues");
      } finally {
        await Bun.$`rm -rf ${dir}`;
        loadConfigSpy.mockRestore();
        getProjectStateSpy.mockRestore();
        createAPISpy.mockRestore();
      }
    });
  });
});

describe("Module Exports", () => {
  test("exports SonarQubePlugin as default", async () => {
    const module = await import("./index.ts");
    expect(module.default).toBe(SonarQubePlugin);
  });

  test("exports SonarQubePlugin as named export", async () => {
    const module = await import("./index.ts");
    expect(module.SonarQubePlugin).toBeDefined();
    expect(typeof module.SonarQubePlugin).toBe("function");
  });

  test("does not export CLI utilities from main module (prevents OpenCode loading them as plugins)", async () => {
    const module = await import("./index.ts") as Record<string, unknown>;
    expect(module.runCLI).toBeUndefined();
    expect(module.CLI_HELP).toBeUndefined();
    expect(module.executeCLI).toBeUndefined();
  });

  test("exports CLI utilities from cli.ts", async () => {
    const cliModule = await import("./cli.ts");
    expect(cliModule.runCLI).toBeDefined();
    expect(cliModule.CLI_HELP).toBeDefined();
    expect(cliModule.executeCLI).toBeDefined();
  });
});

describe("CLI", () => {
  let loadConfigSpy: ReturnType<typeof spyOn>;
  let needsBootstrapSpy: ReturnType<typeof spyOn>;
  let bootstrapSpy: ReturnType<typeof spyOn>;
  let getProjectStateSpy: ReturnType<typeof spyOn>;
  let createSonarQubeAPISpy: ReturnType<typeof spyOn>;
  let runAnalysisSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    loadConfigSpy = spyOn(configModule, "loadConfig");
    needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
    bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
    getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
    createSonarQubeAPISpy = spyOn(apiModule, "createSonarQubeAPI");
    runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
  });

  afterEach(() => {
    loadConfigSpy.mockRestore();
    needsBootstrapSpy.mockRestore();
    bootstrapSpy.mockRestore();
    getProjectStateSpy.mockRestore();
    createSonarQubeAPISpy.mockRestore();
    runAnalysisSpy.mockRestore();
  });

  describe("CLI_HELP", () => {
    test("contains usage information", () => {
      expect(CLI_HELP).toContain("opencode-sonarqube");
      expect(CLI_HELP).toContain("--setup");
      expect(CLI_HELP).toContain("--analyze");
      expect(CLI_HELP).toContain("--status");
      expect(CLI_HELP).toContain("--issues");
    });
  });

  describe("runCLI", () => {
    test("returns help on --help flag", async () => {
      const result = await runCLI(["--help"]);
      expect(result.success).toBe(true);
      expect(result.output).toBe(CLI_HELP);
      expect(result.exitCode).toBe(0);
    });

    test("returns help on -h flag", async () => {
      const result = await runCLI(["-h"]);
      expect(result.success).toBe(true);
      expect(result.output).toBe(CLI_HELP);
      expect(result.exitCode).toBe(0);
    });

    test("returns error when config not found", async () => {
      loadConfigSpy.mockReturnValue(null);

      const result = await runCLI(["--status"]);

      expect(result.success).toBe(false);
      expect(result.output).toContain("SonarQube not configured");
      expect(result.exitCode).toBe(1);
    });

    test("handles --setup successfully", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        message: "Project created",
      });

      const result = await runCLI(["--setup"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Initializing");
      expect(result.exitCode).toBe(0);
    });

    test("handles --setup with --force", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        message: "Project re-created",
      });

      const result = await runCLI(["--setup", "--force"], "/tmp");

      expect(result.success).toBe(true);
      expect(bootstrapSpy).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    });

    test("handles --setup failure", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      bootstrapSpy.mockResolvedValue({
        success: false,
        message: "Failed to connect",
      });

      const result = await runCLI(["--setup"], "/tmp");

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to connect");
      expect(result.exitCode).toBe(1);
    });

    test("auto-bootstraps when needed", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(true);
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        message: "Project created",
      });
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "OK", conditions: [] } }),
          formatStatus: () => "Status: OK",
        },
      });

      const result = await runCLI(["--status"], "/tmp");

      expect(result.success).toBe(true);
      expect(bootstrapSpy).toHaveBeenCalled();
    });

    test("handles auto-bootstrap failure", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(true);
      bootstrapSpy.mockResolvedValue({
        success: false,
        message: "Bootstrap failed",
      });

      const result = await runCLI(["--status"], "/tmp");

      expect(result.success).toBe(false);
      expect(result.output).toContain("Setup failed");
      expect(result.exitCode).toBe(1);
    });

    test("handles missing project state", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(null);

      const result = await runCLI(["--status"], "/tmp");

      expect(result.success).toBe(false);
      expect(result.output).toContain("Could not load project state");
      expect(result.exitCode).toBe(1);
    });

    test("handles --status command", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        qualityGate: {
          getStatus: async () => ({ projectStatus: { status: "OK", conditions: [] } }),
          formatStatus: () => "Quality Gate: OK",
        },
      });

      const result = await runCLI(["--status"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Quality Gate: OK");
    });

    test("handles --analyze command", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      runAnalysisSpy.mockResolvedValue({
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      });

      const result = await runCLI(["--analyze"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Running analysis");
    });

    test("handles --issues command", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        issues: {
          getFormattedIssues: async () => [
            { key: "issue-1", severity: "MAJOR", file: "src/app.ts", line: 10, message: "Fix this", type: "CODE_SMELL", rule: "test:rule", quickFixAvailable: false },
          ],
        },
      });

      const result = await runCLI(["--issues"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Found 1 issues");
      expect(result.output).toContain("MAJOR");
    });

    test("handles --issues command with no issues", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        issues: {
          getFormattedIssues: async () => [],
        },
      });

      const result = await runCLI(["--issues"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Found 0 issues");
    });

    test("handles --hotspots command with hotspots found", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        issues: {
          getSecurityHotspots: async () => [
            { 
              key: "h1",
              component: "src/auth.ts",
              line: 42,
              message: "Potential SQL injection",
              vulnerabilityProbability: "HIGH",
              status: "TO_REVIEW",
            },
          ],
        },
      });

      const result = await runCLI(["--hotspots"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("security hotspots");
      expect(result.output).toContain("HIGH");
    });

    test("handles --hotspots command with no hotspots", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        issues: {
          getSecurityHotspots: async () => [],
        },
      });

      const result = await runCLI(["--hotspots"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("No security hotspots found");
    });

    test("handles --hotspots command when API not available", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      createSonarQubeAPISpy.mockReturnValue({
        issues: {
          getSecurityHotspots: async () => {
            throw new Error("API not available");
          },
        },
      });

      const result = await runCLI(["--hotspots"], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("not available");
    });

    test("handles --project-key override", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "original-key",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });
      let capturedProjectKey: string | undefined;
      createSonarQubeAPISpy.mockReturnValue({
        qualityGate: {
          getStatus: async (key: string) => {
            capturedProjectKey = key;
            return { projectStatus: { status: "OK", conditions: [] } };
          },
          formatStatus: () => "OK",
        },
      });

      await runCLI(["--status", "--project-key=custom-key"], "/tmp");

      expect(capturedProjectKey).toBe("custom-key");
    });

    test("handles missing project key", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "", // Empty project key
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });

      const result = await runCLI(["--status"], "/tmp");

      expect(result.success).toBe(false);
      expect(result.output).toContain("Could not determine project key");
    });

    test("handles no command with usage hint", async () => {
      loadConfigSpy.mockReturnValue({
        url: "http://example.com",
        user: "admin",
        password: "admin",
        level: "enterprise",
        autoAnalyze: true,
        sources: "src",
      });
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue({
        projectKey: "test-project",
        projectToken: "token",
        tokenName: "test",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      });

      const result = await runCLI([], "/tmp");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Use --help");
    });
  });

  describe("executeCLI", () => {
    test("calls log and exit with correct values", async () => {
      let loggedOutput = "";
      let exitCode = -1;

      const mockLog = (msg: string) => {
        loggedOutput = msg;
      };
      const mockExit = (code: number): never => {
        exitCode = code;
        throw new Error("EXIT_CALLED"); // Simulate exit
      };

      try {
        await executeCLI(["--help"], mockLog, mockExit);
      } catch (e) {
        // Expected - mockExit throws
      }

      expect(loggedOutput).toContain("opencode-sonarqube");
      expect(exitCode).toBe(0);
    });

    test("exits with error code on failure", async () => {
      // No config set, should fail
      loadConfigSpy.mockReturnValue(null);

      let exitCode = -1;
      const mockLog = () => {};
      const mockExit = (code: number): never => {
        exitCode = code;
        throw new Error("EXIT_CALLED");
      };

      try {
        await executeCLI(["--status"], mockLog, mockExit);
      } catch (e) {
        // Expected
      }

      expect(exitCode).toBe(1);
    });
  });
});
