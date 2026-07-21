#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = join(here, '..');
const require = createRequire(import.meta.url);

const lspPkg = require.resolve('@forge/language-server/package.json');
const lspRoot = dirname(lspPkg);
const lspOut = join(lspRoot, 'out');

if (!existsSync(join(lspOut, 'server.js'))) {
  console.error('forge-language-server is not built; run npm run build:lsp first');
  process.exit(1);
}

const serverRoot = join(extRoot, 'server');
rmSync(serverRoot, { recursive: true, force: true });
mkdirSync(join(serverRoot, 'out'), { recursive: true });
cpSync(lspOut, join(serverRoot, 'out'), { recursive: true });

writeFileSync(
  join(serverRoot, 'package.json'),
  JSON.stringify(
    {
      name: 'forge-language-server-bundle',
      private: true,
      type: 'commonjs',
      dependencies: {
        'vscode-languageserver': '^9.0.1',
        'vscode-languageserver-textdocument': '^1.0.12',
      },
    },
    null,
    2,
  ),
);

const npm = spawnSync('npm', ['install', '--omit=dev'], {
  cwd: serverRoot,
  stdio: 'inherit',
});
if (npm.status !== 0) process.exit(npm.status ?? 1);
