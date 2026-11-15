// Mock for the vscode module used in tests
// This provides a minimal mock of the VS Code Extension API

import { vi } from "vitest";

class MockWebviewPanel {
  static instances: MockWebviewPanel[] = [];
  static reset() {
    MockWebviewPanel.instances = [];
  }

  public onDidReceiveMessageHandler: ((msg: any) => void) | null = null;
  public postMessageCalls: any[] = [];
  public htmlValue = "";

  constructor(
    public viewType: string,
    public title: string,
    public viewColumn: number,
    public options: any,
  ) {
    MockWebviewPanel.instances.push(this);
  }

  webview = {
    cspSource: "https://example.com",
    onDidReceiveMessage: (fn: (msg: any) => void) => {
      this.onDidReceiveMessageHandler = fn;
    },
    postMessage: (msg: any) => {
      this.postMessageCalls.push(msg);
    },
    get html() {
      return this.htmlValue;
    },
    set html(value: string) {
      this.htmlValue = value;
    },
  };

  reveal = vi.fn();
  dispose = vi.fn();
  onDidDispose = vi.fn();
}

export const window = {
  createWebviewPanel: vi.fn(
    (viewType: string, title: string, viewColumn: number, options: any) => {
      const panel = new MockWebviewPanel(viewType, title, viewColumn, options);
      return panel;
    },
  ),
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p }),
};

export const workspace = {
  fs: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
};

export const env = {
  clipboard: {
    writeText: vi.fn(),
  },
};

export const ViewColumn = {
  Two: 2,
};

export class WebviewPanel extends MockWebviewPanel {}

// Reset function for tests
export function resetMock() {
  MockWebviewPanel.reset();
  (window.createWebviewPanel as any).mockReset();
  (commands.registerCommand as any).mockReset();
  (commands.executeCommand as any).mockReset();
  (workspace.fs.writeFile as any).mockReset();
  (workspace.fs.readFile as any).mockReset();
  (env.clipboard.writeText as any).mockReset();
}
