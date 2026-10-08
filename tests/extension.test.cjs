const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function harness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-extension-'));
  const settings = { serverMode: 'typescript', serverModule: path.join(root, 'server.js'), path: '/installed/forge', includePaths: ['/modules'] };
  fs.writeFileSync(settings.serverModule, '');
  const state = { trusted: true, failStart: false, clients: [], watchers: [], notifications: [], errors: [], info: [], logs: [], executed: [], registered: new Map(), updates: [], answers: [], starts: 0, stops: 0, live: 0, maxLive: 0 };
  const output = { appendLine: (line) => state.logs.push(line), show: () => { state.shown = true; }, dispose() {} };
  const workspace = {
    get isTrusted() { return state.trusted; },
    workspaceFolders: [{ uri: { fsPath: '/project' } }],
    getConfiguration: () => ({ get: (key) => settings[key], update: async (key, value, target) => { state.updates.push({ key, value, target }); settings[key] = value; state.listener?.({ affectsConfiguration: (name) => name === 'forge' || name === `forge.${key}` }); } }),
    onDidGrantWorkspaceTrust: (callback) => { state.grant = callback; return { dispose() {} }; },
    onDidChangeConfiguration: (callback) => { state.listener = callback; return { dispose() {} }; },
    createFileSystemWatcher: (glob) => {
      const watcher = { glob, disposalCount: 0, dispose() { this.disposalCount++; } };
      state.watchers.push(watcher); return watcher;
    },
  };
  class Client {
    constructor(id, name, server, options) { if (state.failConstruct) throw new Error('client construction failed'); Object.assign(this, { server, options }); state.clients.push(this); }
    async start() {
      state.starts++;
      await Promise.resolve();
      if (state.failStart) throw new Error('startup failed');
      this.running = true; state.live++; state.maxLive = Math.max(state.maxLive, state.live);
    }
    isRunning() { return this.running; }
    async sendNotification(method, params) { state.notifications.push({ method, params }); }
    async stop() { state.stops++; if (this.running) state.live--; this.running = false; }
  }
  const originalLoad = Module._load;
  const extensionPath = require.resolve('../out/extension');
  try {
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') return { workspace, commands: {
        registerCommand: (name, callback) => { state.registered.set(name, callback); return { dispose() { state.registered.delete(name); } }; },
        executeCommand: async (...args) => { state.executed.push(args); return state.registered.get(args[0])?.(); },
      }, window: {
        createOutputChannel: () => output,
        showErrorMessage: async (message, ...actions) => { state.errors.push({ message, actions }); return state.answers.shift(); },
        showInformationMessage: async (message, ...actions) => { state.info.push({ message, actions }); return state.answers.shift(); },
        showQuickPick: async (items) => { state.picks = items; return state.pick; },
        showInputBox: async (options) => { state.inputOptions = options; return state.input; },
      } };
      if (request === 'vscode-languageclient/node') return { LanguageClient: Client, TransportKind: { ipc: 1 } };
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[extensionPath];
    state.extension = require(extensionPath);
  } finally { Module._load = originalLoad; }
  state.settings = settings;
  state.context = { subscriptions: [] };
  state.command = (name) => state.registered.get(name)();
  state.cleanup = async () => {
    await state.extension.deactivate();
    state.context.subscriptions.splice(0).forEach((disposable) => disposable.dispose());
    delete require.cache[extensionPath];
    fs.rmSync(root, { recursive: true });
  };
  return state;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('activation and commands preserve configuration and release restart watchers', async () => {
  const h = harness();
  try {
    await h.extension.activate(h.context);
    const client = h.clients[0];
    assert.equal(h.errors.length, 0);
    assert.equal(h.watchers[0].glob, '**/*.fg');
    assert.equal(client.options.synchronize.fileEvents, h.watchers[0]);
    assert.equal(client.server.run.module, h.settings.serverModule);
    assert.equal(client.server.run.transport, 1);
    assert.equal(client.options.initializationOptions.workspaceRoot, '/project');
    assert.equal(client.options.initializationOptions.forge.path, '/installed/forge');
    assert.deepEqual(client.options.initializationOptions.forge.includePaths, ['/modules']);
    h.listener({ affectsConfiguration: (key) => key === 'forge' });
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].method, 'workspace/didChangeConfiguration');
    h.listener({ affectsConfiguration: (key) => key === 'forge' || key === 'forge.serverModule' });
    await settle();
    assert.equal(h.info.length, 1);
    assert.equal(h.notifications.length, 1);
    await h.command('forge.startLanguageServer');
    assert.equal(h.starts, 1);
    await Promise.all([h.command('forge.restartLanguageServer'), h.command('forge.restartLanguageServer')]);
    assert.equal(h.starts, 3);
    assert.equal(h.maxLive, 1);
    assert.deepEqual(h.watchers.map((watcher) => watcher.disposalCount), [1, 1, 0]);
    h.command('forge.showLanguageServerOutput');
    assert.equal(h.shown, true);
    await h.extension.deactivate();
    assert.equal(h.live, 0);
    assert.deepEqual(h.watchers.map((watcher) => watcher.disposalCount), [1, 1, 1]);
  } finally { await h.cleanup(); }
});

test('untrusted workspace never spawns tools and trust grant starts once', async () => {
  const h = harness();
  try {
    h.trusted = false;
    await h.extension.activate(h.context);
    assert.equal(h.clients.length, 0);
    assert.equal(h.watchers.length, 0);
    await h.command('forge.restartLanguageServer');
    await h.command('forge.startLanguageServer');
    assert.equal(h.clients.length, 0);
    assert.deepEqual(h.executed, [['workbench.trust.manage']]);
    await h.command('forge.setup');
    assert.equal(h.updates.length, 0);
    h.trusted = true;
    h.grant();
    await settle();
    assert.equal(h.starts, 1);
    await h.command('forge.startLanguageServer');
    assert.equal(h.starts, 1);
  } finally { await h.cleanup(); }
});

test('failed startup is actionable, cleans resources and can retry', async () => {
  const h = harness();
  try {
    h.failStart = true;
    await h.extension.activate(h.context);
    assert.match(h.errors[0].message, /could not start.*startup failed/);
    assert.deepEqual(h.errors[0].actions, ['Set Up Forge', 'Show Output']);
    assert.equal(h.watchers[0].disposalCount, 1);
    assert.equal(h.live, 0);
    h.failStart = false;
    await h.command('forge.startLanguageServer');
    assert.equal(h.live, 1);
    assert.equal(h.starts, 2);
  } finally { await h.cleanup(); }
});

test('guided setup validates input and writes only user settings', async () => {
  const h = harness();
  try {
    await h.extension.activate(h.context);
    h.pick = { mode: 'typescript' };
    h.input = h.settings.serverModule;
    h.answers.push('Start Server');
    await h.command('forge.setup');
    assert.equal(h.inputOptions.validateInput('relative/server.js').includes('absolute path'), true);
    assert.equal(h.inputOptions.validateInput(h.input), undefined);
    assert.deepEqual(h.updates, [
      { key: 'serverModule', value: h.input, target: true },
      { key: 'serverMode', value: 'typescript', target: true },
    ]);
    assert.equal(h.info.length, 1); // Setup's own setting writes do not produce duplicate restart prompts.
    assert.equal(h.starts, 2);
    assert.match(h.info[0].message, /Forge SDK.*forge.path/);
    h.input = undefined;
    await h.command('forge.setup');
    assert.equal(h.updates.length, 2);
  } finally { await h.cleanup(); }
});


test('client constructor errors release watchers before retry', async () => {
  const h = harness();
  try {
    h.failConstruct = true;
    await h.extension.activate(h.context);
    assert.match(h.errors[0].message, /client construction failed/);
    assert.equal(h.watchers[0].disposalCount, 1);
    h.failConstruct = false;
    await h.command('forge.startLanguageServer');
    assert.equal(h.live, 1);
  } finally { await h.cleanup(); }
});
