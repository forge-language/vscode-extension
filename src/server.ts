import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ServerConfiguration {
  serverMode?: string;
  lspPath?: string;
  serverModule?: string;
}

export type ServerSelection = { kind: 'native'; command: string } | { kind: 'typescript'; module: string };

function isExecutable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function findExecutable(command: string, pathEnv = process.env.PATH ?? ''): string | undefined {
  const extensions = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')]
    : [''];
  for (const directory of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, command + extension);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

export function resolveServer(config: ServerConfiguration, pathEnv?: string): ServerSelection {
  if (config.serverMode === 'typescript') {
    const module = config.serverModule?.trim();
    if (!module || !path.isAbsolute(module) || !fs.existsSync(module) || !fs.statSync(module).isFile()) {
      throw new Error('Set forge.serverModule to the absolute path of the installed TypeScript language server out/server.js.');
    }
    return { kind: 'typescript', module };
  }
  if (config.serverMode && config.serverMode !== 'native') {
    throw new Error(`Unsupported forge.serverMode: ${config.serverMode}`);
  }
  const configured = config.lspPath?.trim();
  const command = configured || 'forge-lsp';
  const executable = path.isAbsolute(command)
    ? (isExecutable(command) ? command : undefined)
    : (!command.includes('/') && !command.includes('\\') ? findExecutable(command, pathEnv) : undefined);
  if (!executable) {
    throw new Error(configured
      ? `Cannot execute forge.lspPath (${configured}). Use an absolute executable path or a command on PATH.`
      : 'Install forge-lsp on PATH or set forge.lspPath to its absolute executable path.');
  }
  return { kind: 'native', command: executable };
}
