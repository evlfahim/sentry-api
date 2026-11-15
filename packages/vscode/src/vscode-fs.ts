import * as vscode from "vscode";
import type { RequestFile, Collection } from "@sentry-api/core";

/**
 * Type for file type returned by vscode.workspace.fs.readDirectory.
 */
export type VsCodeFsEntry = { name: string; isDirectory: boolean };

/**
 * A file-system abstraction that wraps VS Code's workspace.fs API.
 * Provides the same operations the core library's collections module
 * exposes, but uses the VS Code file system so it works inside the
 * extension host (and can be swapped for a mock in tests).
 */
export class VsCodeFileSystem {
  constructor(private readonly baseUri: vscode.Uri) {}

  /** Root folder URI. */
  get root(): vscode.Uri {
    return this.baseUri;
  }

  /** URI for a file inside the root. */
  file(name: string): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, name);
  }

  /** URI for a sub-folder inside the root. */
  folder(name: string): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, name);
  }

  // ── Low-level helpers ──────────────────────────────────────────

  private async readDir(uri: vscode.Uri): Promise<VsCodeFsEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.map(([name, type]) => ({
      name,
      isDirectory: type === vscode.FileType.Directory,
    }));
  }

  private async readFile(uri: vscode.Uri): Promise<string> {
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString("utf-8");
  }

  private async writeFile(uri: vscode.Uri, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(content, "utf-8")
    );
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async createDir(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(uri);
  }

  private async delete(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.delete(uri);
  }

  // ── Collection-level operations ────────────────────────────────

  /**
   * Lists all collection folders inside the root.
   * Mirrors the core library's `listCollections` but uses vscode.workspace.fs.
   */
  async listCollections(): Promise<Collection[]> {
    const entries = await this.readDir(this.baseUri);
    const collections: Collection[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      const collectionUri = this.folder(entry.name);
      const collectionJsonUri = vscode.Uri.joinPath(
        collectionUri,
        "collection.json"
      );

      if (!(await this.exists(collectionJsonUri))) continue;

      try {
        const content = await this.readFile(collectionJsonUri);
        const collectionData = JSON.parse(content) as Omit<
          Collection,
          "requests"
        >;

        const requests = await this.readRequestFiles(collectionUri);
        collections.push({ ...collectionData, requests });
      } catch {
        // Skip corrupted collection files
      }
    }

    return collections;
  }

  /**
   * Recursively reads all request JSON files inside a collection folder.
   */
  private async readRequestFiles(
    folderUri: vscode.Uri
  ): Promise<RequestFile[]> {
    const requests: RequestFile[] = [];
    await this._readRequestFilesRecursive(folderUri, requests);
    return requests;
  }

  private async _readRequestFilesRecursive(
    folderUri: vscode.Uri,
    requests: RequestFile[]
  ): Promise<void> {
    const entries = await this.readDir(folderUri);
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this._readRequestFilesRecursive(
          this.folder(entry.name),
          requests
        );
      } else if (
        entry.name.endsWith(".json") &&
        entry.name !== "collection.json"
      ) {
        const content = await this.readFile(
          vscode.Uri.joinPath(folderUri, entry.name)
        );
        requests.push(JSON.parse(content) as RequestFile);
      }
    }
  }

  // ── Request-level operations ───────────────────────────────────

  /**
   * Reads a single request file by ID.
   * Mirrors the core library's `readRequest`.
   */
  async readRequest(requestId: string): Promise<RequestFile | null> {
    const uri = this.file(`${requestId}.json`);
    if (!(await this.exists(uri))) {
      return null;
    }
    const content = await this.readFile(uri);
    return JSON.parse(content) as RequestFile;
  }

  /**
   * Updates a request file.
   * Mirrors the core library's `updateRequest`.
   */
  async updateRequest(request: RequestFile): Promise<void> {
    request.updated = new Date().toISOString();
    const uri = this.file(`${request.id}.json`);
    await this.writeFile(uri, JSON.stringify(request, null, 2));
  }

  /**
   * Creates a new request file.
   */
  async createRequest(request: RequestFile): Promise<void> {
    const uri = this.file(`${request.id}.json`);
    await this.writeFile(uri, JSON.stringify(request, null, 2));
  }

  /**
   * Deletes a request file by ID.
   */
  async deleteRequest(requestId: string): Promise<boolean> {
    const uri = this.file(`${requestId}.json`);
    if (!(await this.exists(uri))) {
      return false;
    }
    await this.delete(uri);
    return true;
  }

  // ── Environment file operations ────────────────────────────────

  /**
   * Lists .env files in the root folder.
   */
  async listEnvFiles(): Promise<string[]> {
    const entries = await this.readDir(this.baseUri);
    return entries
      .filter(
        (e) =>
          e.name.endsWith(".env") ||
          (e.name.startsWith(".env.") && e.name.endsWith(".env"))
      )
      .map((e) => e.name);
  }

  /**
   * Reads an environment file and returns its parsed values.
   */
  async readEnvFile(name: string): Promise<Record<string, string>> {
    const uri = this.file(name);
    const content = await this.readFile(uri);
    // Re-use the pure parser from core
    const { parseEnvFile } = await import("@sentry-api/core");
    return parseEnvFile(content);
  }

  /**
   * Writes an environment file.
   */
  async writeEnvFile(
    name: string,
    values: Record<string, string>
  ): Promise<void> {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      lines.push(`${key}=${value}`);
    }
    const uri = this.file(name);
    await this.writeFile(uri, lines.join("\n") + "\n");
  }

  // ── Collection-level CRUD ──────────────────────────────────────

  /**
   * Creates a new collection folder with metadata and request files.
   */
  async createCollection(collection: Collection): Promise<void> {
    const collectionUri = this.folder(collection.id);
    await this.createDir(collectionUri);

    const meta = {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      updated: collection.updated,
    };
    await this.writeFile(
      vscode.Uri.joinPath(collectionUri, "collection.json"),
      JSON.stringify(meta, null, 2)
    );

    for (const request of collection.requests) {
      await this.writeFile(
        vscode.Uri.joinPath(collectionUri, `${request.id}.json`),
        JSON.stringify(request, null, 2)
      );
    }
  }

  /**
   * Deletes a collection folder (including all request files).
   */
  async deleteCollection(collectionId: string): Promise<boolean> {
    const uri = this.folder(collectionId);
    if (!(await this.exists(uri))) {
      return false;
    }
    await this.delete(uri);
    return true;
  }
}
