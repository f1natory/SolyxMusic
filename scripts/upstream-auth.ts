import ts from "typescript";

export const upstreamRequestHeaders = `window.webContents.session.webRequest.onBeforeSendHeaders(
  { urls: ["https://api.music.yandex.net/*"] },
  (details, callback) => {
    const bannedHeaders = ["x-yandex-music-device", "x-request-id"];
    bannedHeaders.forEach((header) => {
      details.requestHeaders[header] = undefined;
    });
    callback({ requestHeaders: details.requestHeaders });
  },
);`;

export function matchUpstreamAuth(source: string): string {
  const ast = ts.createSourceFile("index.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: { start: number; end: number; text: string }[] = [];
  let hasHeadersHook = false;
  let windowReturn: ts.ReturnStatement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "webSecurity" && node.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      edits.push({ start: node.initializer.getStart(ast), end: node.initializer.end, text: "false" });
    }
    if (ts.isReturnStatement(node) && node.expression?.getText(ast) === "window") windowReturn = node;
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const text = node.getText(ast);
      const method = ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";
      const arg = call.arguments[0];
      const value = arg && ts.isStringLiteral(arg) ? arg.text : "";
      const unsafeStartupSwitch = method === "appendSwitch" && ["disable-site-isolation-trials", "js-flags", "renderer-process-limit", "disable-background-timer-throttling"].includes(value);
      const authRedirect = method === "on" && value === "dom-ready" && text.includes("executeJavaScript") && text.includes("music-application:");
      const clearCacheTimer = method === "then" && text.includes("setInterval") && text.includes("defaultSession?.clearCache");
      if (method === "onBeforeSendHeaders" && text.includes("x-yandex-music-device") && text.includes("x-request-id")) hasHeadersHook = true;
      if (unsafeStartupSwitch || authRedirect || clearCacheTimer) {
        edits.push({ start: node.getStart(ast), end: node.end, text: "" });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!hasHeadersHook) {
    if (!windowReturn) throw new Error("Native window return is missing; cannot install upstream headers hook");
    edits.push({ start: windowReturn.getStart(ast), end: windowReturn.getStart(ast), text: upstreamRequestHeaders + "\n" });
  }
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
