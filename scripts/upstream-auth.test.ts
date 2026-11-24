import { expect, test } from "bun:test";
import { matchUpstreamAuth } from "./upstream-auth";

test("matches upstream settings and removes legacy redirects and unsafe startup limits", () => {
  const source = `
const preferences = { webSecurity: true, sandbox: true, contextIsolation: true };
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=256");
app.commandLine.appendSwitch("renderer-process-limit", "2");
window.webContents.on("dom-ready", () => window.webContents.executeJavaScript("music-application:"));
window.webContents.on("dom-ready", nativeHandler);
const certificateStub = { setupCertificateVerificationCoordinator: () => ({ dispose() {} }) };
const plus = { hasPlus: true };
function createWindow() { return window; }
`;
  const result = matchUpstreamAuth(source);
  expect(result).toContain("webSecurity: false");
  expect(result).toContain("sandbox: true, contextIsolation: true");
  expect(result).not.toContain("disable-site-isolation-trials");
  expect(result).not.toContain("executeJavaScript");
  expect(result).not.toContain("max-old-space-size");
  expect(result).not.toContain("renderer-process-limit");
  expect(result).toContain('window.webContents.on("dom-ready", nativeHandler)');
  expect(result).toContain('urls: ["https://api.music.yandex.net/*"]');
  expect(result).toContain('const bannedHeaders = ["x-yandex-music-device", "x-request-id"]');
  expect(result).toContain("setupCertificateVerificationCoordinator");
  expect(result).toContain("hasPlus: true");
  expect(matchUpstreamAuth(result)).toBe(result);
});

test("rejects an unknown window structure", () => {
  expect(() => matchUpstreamAuth("const preferences = { webSecurity: true }; ")).toThrow("Native window return is missing");
});
