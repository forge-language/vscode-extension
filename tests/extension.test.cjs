const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Exercise activation without a GUI, replacing only VS Code and the client transport.
test('activation configures IPC and watched imports, owns disposables, and handles startup errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-extension-'));
  const originalLoad = Module._load;
  const settings = { serverMode: 'typescript', serverModule: path.join(root, 'server.js'), path: '/installed/forge', includePaths: ['/modules'] };
  fs.writeFileSync(settings.serverModule, '');
  const notifications = [];
  const errors = [];
  const info = [];
  let listener;
  let instance;
  let failStart = false;
  const watchers = [];
  let listenerDisposals = 0;
  class Client {
    constructor(id, name, server, options) { Object.assign(this, { server, options }); instance = this; }
    async start() { if (failStart) throw new Error('startup failed'); this.running = true; }
    isRunning() { return this.running; }
    async sendNotification(method, params) { notifications.push({ method, params }); }
    async stop() { this.running = false; }
  }
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return {
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/project' } }],
        getConfiguration: () => ({ get: (key) => settings[key] }),
        onDidChangeConfiguration: (callback) => { listener = callback; return { dispose() { listenerDisposals++; } }; },
        createFileSystemWatcher: (glob) => {
          const watcher = { glob, disposalCount: 0, dispose() { this.disposalCount++; } };
          watchers.push(watcher);
          return watcher;
        },
      },
      window: {
        showErrorMessage: async (message) => errors.push(message),
        showInformationMessage: async (message) => info.push(message),
      },
    };
    if (request === 'vscode-languageclient/node') return { LanguageClient: Client, TransportKind: { ipc: 1 } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const extensionPath = require.resolve('../out/extension');
  try {
    delete require.cache[extensionPath];
    const extension = require(extensionPath);
    const context = { subscriptions: [] };
    await extension.activate(context);
    assert.equal(errors.length, 0);
    assert.equal(watchers[0].glob, '**/*.fg');
    assert.equal(instance.options.synchronize.fileEvents, watchers[0]);
    assert.ok(context.subscriptions.includes(watchers[0]));
    assert.equal(instance.server.run.module, settings.serverModule);
    assert.equal(instance.server.run.transport, 1);
    assert.equal(instance.options.initializationOptions.workspaceRoot, '/project');
    assert.equal(instance.options.initializationOptions.forge.path, '/installed/forge');
    assert.deepEqual(instance.options.initializationOptions.forge.includePaths, ['/modules']);
    listener({ affectsConfiguration: (key) => key === 'forge' });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].method, 'workspace/didChangeConfiguration');
    listener({ affectsConfiguration: (key) => key === 'forge' || key === 'forge.serverModule' });
    assert.equal(info.length, 1);
    assert.equal(notifications.length, 1);
    await extension.deactivate();
    assert.equal(instance.running, false);
    context.subscriptions.splice(0).forEach((disposable) => disposable.dispose());
    assert.equal(watchers[0].disposalCount, 1);
    assert.equal(listenerDisposals, 1);
    failStart = true;
    await extension.activate(context);
    assert.match(errors[0], /startup failed/);
    assert.equal(extension.deactivate(), undefined);
    assert.equal(watchers[1].disposalCount, 1);
    assert.ok(!context.subscriptions.includes(watchers[1]));
    context.subscriptions.splice(0).forEach((disposable) => disposable.dispose());
    assert.equal(watchers[1].disposalCount, 1);
    assert.equal(listenerDisposals, 2);
  } finally {
    Module._load = originalLoad;
    delete require.cache[extensionPath];
    fs.rmSync(root, { recursive: true });
  }
});
