import fs from "fs";
import path from "path";
import type { RequestFile, Collection } from "./types";

export type { RequestFile, Collection, CollectionFolder } from "./types";

/**
 * Reads a collection folder from disk.
 * Expected structure:
 *   collections/
 *     collection-id/
 *       collection.json
 *       request-id.json
 *       request-id.json
 *       subfolder/
 *         ...
 */
export function readCollection(folderPath: string): Collection {
  const collectionPath = path.join(folderPath, "collection.json");
  const collectionData = JSON.parse(
    fs.readFileSync(collectionPath, "utf-8"),
  ) as Omit<Collection, "requests">;

  const requests: RequestFile[] = [];
  readRequestFiles(folderPath, requests);

  return {
    ...collectionData,
    requests,
  };
}

/**
 * Recursively reads all request JSON files in a folder.
 */
function readRequestFiles(folderPath: string, requests: RequestFile[]): void {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      readRequestFiles(path.join(folderPath, entry.name), requests);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      entry.name !== "collection.json"
    ) {
      const filePath = path.join(folderPath, entry.name);
      const data = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      ) as RequestFile;
      requests.push(data);
    }
  }
}

/**
 * Writes a collection to disk, creating the folder structure.
 */
export function writeCollection(
  folderPath: string,
  collection: Collection,
): void {
  // Ensure directory exists
  fs.mkdirSync(folderPath, { recursive: true });

  // Write collection metadata
  const collectionMeta = {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    updated: collection.updated,
  };
  fs.writeFileSync(
    path.join(folderPath, "collection.json"),
    JSON.stringify(collectionMeta, null, 2),
  );

  // Write each request as a separate file
  for (const request of collection.requests) {
    const fileName = `${request.id}.json`;
    fs.writeFileSync(
      path.join(folderPath, fileName),
      JSON.stringify(request, null, 2),
    );
  }
}

/**
 * Creates a new collection folder and writes the initial collection file.
 */
export function createCollection(
  basePath: string,
  collection: Collection,
): string {
  const folderPath = path.join(basePath, collection.id);
  writeCollection(folderPath, collection);
  return folderPath;
}

/**
 * Reads a single request file by ID.
 */
export function readRequest(
  collectionPath: string,
  requestId: string,
): RequestFile | null {
  const filePath = path.join(collectionPath, `${requestId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RequestFile;
}

/**
 * Updates a request file.
 */
export function updateRequest(
  collectionPath: string,
  request: RequestFile,
): void {
  request.updated = new Date().toISOString();
  const filePath = path.join(collectionPath, `${request.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(request, null, 2));
}

/**
 * Deletes a request file by ID.
 */
export function deleteRequest(
  collectionPath: string,
  requestId: string,
): boolean {
  const filePath = path.join(collectionPath, `${requestId}.json`);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Lists all collection folders in a base path.
 */
export function listCollections(basePath: string): Collection[] {
  if (!fs.existsSync(basePath)) {
    return [];
  }

  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const collections: Collection[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const collectionPath = path.join(basePath, entry.name);
      const collectionFile = path.join(collectionPath, "collection.json");
      if (fs.existsSync(collectionFile)) {
        try {
          const collectionData = JSON.parse(
            fs.readFileSync(collectionFile, "utf-8"),
          ) as Omit<Collection, "requests">;
          const requests: RequestFile[] = [];
          readRequestFiles(collectionPath, requests);
          collections.push({ ...collectionData, requests });
        } catch {
          // Skip corrupted collection files
        }
      }
    }
  }

  return collections;
}

/**
 * Migrates an old-style monolithic collection file to the new one-file-per-request structure.
 */
export function migrateCollection(
  oldFilePath: string,
  basePath: string,
): string | null {
  if (!fs.existsSync(oldFilePath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(oldFilePath, "utf-8")) as Collection;

  const newFolder = path.join(basePath, data.id);
  writeCollection(newFolder, data);

  // Remove the old file
  fs.unlinkSync(oldFilePath);

  return newFolder;
}
