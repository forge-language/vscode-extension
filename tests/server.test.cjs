const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveServer } = require('../out/server');

test('native resolution respects explicit configuration and executable permissions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-vscode-'));
  try {
    const executable = path.join(root, process.platform === 'win32' ? 'forge-lsp.EXE' : 'forge-lsp');
    fs.writeFileSync(executable, '', { mode: 0o755 });
    assert.deepEqual(resolveServer({}, root), { kind: 'native', command: executable });
    assert.deepEqual(resolveServer({ lspPath: executable }, ''), { kind: 'native', command: executable });
    assert.deepEqual(resolveServer({ lspPath: 'forge-lsp' }, root), { kind: 'native', command: executable });
    assert.throws(() => resolveServer({ lspPath: path.join(root, 'missing') }, root), /Cannot execute/);
    if (process.platform !== 'win32') {
      fs.chmodSync(executable, 0o644);
      assert.throws(() => resolveServer({}, root), /Install forge-lsp/);
    }
    assert.throws(() => resolveServer({ lspPath: root }), /Cannot execute/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('TypeScript mode requires a real absolute module path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-vscode-'));
  try {
    const module = path.join(root, 'server.js');
    fs.writeFileSync(module, '');
    assert.deepEqual(resolveServer({ serverMode: 'typescript', serverModule: module }), { kind: 'typescript', module });
    assert.throws(() => resolveServer({ serverMode: 'typescript' }), /forge.serverModule/);
    assert.throws(() => resolveServer({ serverMode: 'typescript', serverModule: 'server.js' }), /forge.serverModule/);
    assert.throws(() => resolveServer({ serverMode: 'typescript', serverModule: root }), /forge.serverModule/);
    assert.throws(() => resolveServer({ serverMode: 'other' }), /Unsupported/);
  } finally { fs.rmSync(root, { recursive: true }); }
});
