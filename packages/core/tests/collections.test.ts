import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  writeCollection,
  readCollection,
  createCollection,
  readRequest,
  updateRequest,
  deleteRequest,
  listCollections,
  migrateCollection,
  RequestFile,
  Collection,
} from "../src/collections";

describe("collections", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentry-api-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should write and read a collection", () => {
    const collection: Collection = {
      id: "col-1",
      name: "Test Collection",
      description: "A test collection",
      requests: [
        {
          id: "req-1",
          name: "Get Users",
          method: "GET",
          url: "https://api.example.com/users",
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-1");
    writeCollection(folderPath, collection);

    const read = readCollection(folderPath);
    expect(read.id).toBe("col-1");
    expect(read.name).toBe("Test Collection");
    expect(read.description).toBe("A test collection");
    expect(read.requests.length).toBe(1);
    expect(read.requests[0].id).toBe("req-1");
    expect(read.requests[0].name).toBe("Get Users");
    expect(read.requests[0].method).toBe("GET");
    expect(read.requests[0].url).toBe("https://api.example.com/users");
  });

  it("should create a collection and return the folder path", () => {
    const collection: Collection = {
      id: "col-2",
      name: "Another Collection",
      requests: [],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = createCollection(tmpDir, collection);
    expect(folderPath).toBe(path.join(tmpDir, "col-2"));
    expect(fs.existsSync(path.join(folderPath, "collection.json"))).toBe(true);
  });

  it("should read a single request file", () => {
    const collection: Collection = {
      id: "col-3",
      name: "Test",
      requests: [
        {
          id: "req-2",
          name: "Get Posts",
          method: "GET",
          url: "https://api.example.com/posts",
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-3");
    writeCollection(folderPath, collection);

    const request = readRequest(folderPath, "req-2");
    expect(request).not.toBeNull();
    expect(request!.name).toBe("Get Posts");
    expect(request!.url).toBe("https://api.example.com/posts");
  });

  it("should return null for a non-existent request", () => {
    const collection: Collection = {
      id: "col-4",
      name: "Test",
      requests: [],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-4");
    writeCollection(folderPath, collection);

    const request = readRequest(folderPath, "non-existent");
    expect(request).toBeNull();
  });

  it("should update a request", () => {
    const collection: Collection = {
      id: "col-5",
      name: "Test",
      requests: [
        {
          id: "req-3",
          name: "Get Users",
          method: "GET",
          url: "https://api.example.com/users",
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-5");
    writeCollection(folderPath, collection);

    const updatedRequest: RequestFile = {
      id: "req-3",
      name: "Get Users Updated",
      method: "POST",
      url: "https://api.example.com/users",
      updated: "2024-01-02T00:00:00.000Z",
    };

    updateRequest(folderPath, updatedRequest);

    const read = readRequest(folderPath, "req-3");
    expect(read).not.toBeNull();
    expect(read!.name).toBe("Get Users Updated");
    expect(read!.method).toBe("POST");
  });

  it("should delete a request", () => {
    const collection: Collection = {
      id: "col-6",
      name: "Test",
      requests: [
        {
          id: "req-4",
          name: "Get Users",
          method: "GET",
          url: "https://api.example.com/users",
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-6");
    writeCollection(folderPath, collection);

    const deleted = deleteRequest(folderPath, "req-4");
    expect(deleted).toBe(true);
    expect(readRequest(folderPath, "req-4")).toBeNull();
  });

  it("should return false when deleting a non-existent request", () => {
    const collection: Collection = {
      id: "col-7",
      name: "Test",
      requests: [],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-7");
    writeCollection(folderPath, collection);

    const deleted = deleteRequest(folderPath, "non-existent");
    expect(deleted).toBe(false);
  });

  it("should list collections in a base path", () => {
    const collection1: Collection = {
      id: "col-a",
      name: "Collection A",
      requests: [],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const collection2: Collection = {
      id: "col-b",
      name: "Collection B",
      requests: [],
      updated: "2024-01-01T00:00:00.000Z",
    };

    createCollection(tmpDir, collection1);
    createCollection(tmpDir, collection2);

    const collections = listCollections(tmpDir);
    expect(collections.length).toBe(2);
    expect(collections.map((c) => c.name)).toContain("Collection A");
    expect(collections.map((c) => c.name)).toContain("Collection B");
  });

  it("should return empty array for non-existent base path", () => {
    const collections = listCollections(path.join(tmpDir, "non-existent"));
    expect(collections).toEqual([]);
  });

  it("should migrate a monolithic collection file", () => {
    const oldFilePath = path.join(tmpDir, "old-collection.json");
    const collection: Collection = {
      id: "migrated",
      name: "Migrated Collection",
      requests: [
        {
          id: "req-m1",
          name: "Migrated Request",
          method: "GET",
          url: "https://api.example.com/migrated",
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    fs.writeFileSync(oldFilePath, JSON.stringify(collection, null, 2));

    const newPath = migrateCollection(oldFilePath, tmpDir);
    expect(newPath).toBe(path.join(tmpDir, "migrated"));
    expect(fs.existsSync(oldFilePath)).toBe(false); // Old file removed
    expect(fs.existsSync(path.join(newPath!, "collection.json"))).toBe(true);
    expect(fs.existsSync(path.join(newPath!, "req-m1.json"))).toBe(true);
  });

  it("should return null for migration of non-existent file", () => {
    const result = migrateCollection(
      path.join(tmpDir, "non-existent.json"),
      tmpDir,
    );
    expect(result).toBeNull();
  });

  it("should handle collection with multiple requests", () => {
    const collection: Collection = {
      id: "col-multi",
      name: "Multi Request Collection",
      requests: [
        {
          id: "req-1",
          name: "Request 1",
          method: "GET",
          url: "https://api.example.com/1",
          updated: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "req-2",
          name: "Request 2",
          method: "POST",
          url: "https://api.example.com/2",
          body: { data: "test" },
          updated: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "req-3",
          name: "Request 3",
          method: "DELETE",
          url: "https://api.example.com/3",
          headers: { Authorization: "Bearer token" },
          updated: "2024-01-01T00:00:00.000Z",
        },
      ],
      updated: "2024-01-01T00:00:00.000Z",
    };

    const folderPath = path.join(tmpDir, "col-multi");
    writeCollection(folderPath, collection);

    const read = readCollection(folderPath);
    expect(read.requests.length).toBe(3);
    expect(read.requests[0].id).toBe("req-1");
    expect(read.requests[1].id).toBe("req-2");
    expect(read.requests[2].id).toBe("req-3");
  });
});
