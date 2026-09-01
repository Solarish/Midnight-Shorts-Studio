import test from "node:test";
import assert from "node:assert/strict";
import {
  createProxyMessage,
  loadMessage,
  reloadMessage,
  selectPremiereClient
} from "../tools/reload-premiere-uxp.js";

test("Premiere UXP reload utility creates the Adobe service protocol messages", () => {
  const clients = [
    { id: 3, app: { appId: "photoshop" } },
    { id: 9, app: { appId: "premierepro", appVersion: "26.5.0" } }
  ];
  assert.equal(selectPremiereClient(clients), clients[1]);
  assert.deepEqual(reloadMessage("session-1"), {
    command: "Plugin",
    action: "reload",
    pluginSessionId: "session-1"
  });
  assert.deepEqual(loadMessage("/plugin"), {
    command: "Plugin",
    action: "load",
    params: { provider: { type: "disk", path: "/plugin" } },
    breakOnStart: false
  });
  assert.deepEqual(createProxyMessage(9, 1, reloadMessage("session-1")), {
    command: "proxy",
    clientId: 9,
    requestId: 1,
    message: { command: "Plugin", action: "reload", pluginSessionId: "session-1" }
  });
});
