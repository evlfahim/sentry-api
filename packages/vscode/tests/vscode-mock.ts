// Mock for the vscode module used in tests
// This provides a minimal mock of the VS Code Extension API

export const window = {
  createWebviewPanel: (() => {
    let panel: any = null;
    return {
      mock: (p: any) => { panel = p; },
      get: () => panel,
      reset: () => { panel = null; },
    };
  })(),
};

export const commands = {
  registerCommand: (() => {
    const commands: any[] = [];
    return {
      mock: (cmd: any) => { commands.push(cmd); },
      get: () => commands,
      reset: () => { commands.length = 0; },
    };
  })(),
  executeCommand: (() => {
    const calls: any[] = [];
    return {
      mock: (cmd: any) => { calls.push(cmd); },
      get: () => calls,
      reset: () => { calls.length = 0; },
    };
  })(),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p }),
};

export const workspace = {
  fs: {
    writeFile: (() => {
      const calls: any[] = [];
      return {
        mock: (fn: any) => { calls.push(fn); },
        get: () => calls,
        reset: () => { calls.length = 0; },
      };
    })(),
    readFile: (() => {
      const calls: any[] = [];
      return {
        mock: (fn: any) => { calls.push(fn); },
        get: () => calls,
        reset: () => { calls.length = 0; },
      };
    })(),
  },
};

export const env = {
  clipboard: {
    writeText: (() => {
      const calls: any[] = [];
      return {
        mock: (fn: any) => { calls.push(fn); },
        get: () => calls,
        reset: () => { calls.length = 0; },
      };
    })(),
  },
};

export const ViewColumn = {
  Two: 2,
};

export class WebviewPanel {
  static instances: WebviewPanel[] = [];
  static reset() { WebviewPanel.instances = []; }

  constructor(
    public viewType: string,
    public title: string,
    public viewColumn: number,
    public options: any
  ) {
    WebviewPanel.instances.push(this);
  }

  webview = {
    cspSource: "https://example.com",
    onDidReceiveMessage: (() => {
      const handlers: any[] = [];
      return {
        mock: (fn: any) => { handlers.push(fn); },
        get: () => handlers,
        reset: () => { handlers.length = 0; },
      };
    })(),
    postMessage: (() => {
      const calls: any[] = [];
      return {
        mock: (msg: any) => { calls.push(msg); },
        get: () => calls,
        reset: () => { calls.length = 0; },
      };
    })(),
    html: "",
  };

  reveal = (() => {
    const calls: any[] = [];
    return {
      mock: (fn: any) => { calls.push(fn); },
      get: () => calls,
      reset: () => { calls.length = 0; },
    };
  })();

  dispose = (() => {
    const calls: any[] = [];
    return {
      mock: (fn: any) => { calls.push(fn); },
      get: () => calls,
      reset: () => { calls.length = 0; },
    };
  })();

  onDidDispose = (() => {
    const handlers: any[] = [];
    return {
      mock: (fn: any) => { handlers.push(fn); },
      get: () => handlers,
      reset: () => { handlers.length = 0; },
    };
  })();
}

// Reset function for tests
export function resetMock() {
  window.createWebviewPanel.reset();
  commands.registerCommand.reset();
  commands.executeCommand.reset();
  workspace.fs.writeFile.reset();
  workspace.fs.readFile.reset();
  env.clipboard.writeText.reset();
  WebviewPanel.reset();
}
