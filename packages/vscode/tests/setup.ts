// Setup file for vitest tests
import { resetMock } from "./vscode-mock";
import { afterEach } from "vitest";

afterEach(() => {
  resetMock();
});
