import { commands, workspace, ExtensionContext, window, OutputChannel, FileSystemWatcher } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { resolveServer } from './server';

let client: LanguageClient | undefined;
let watcher: FileSystemWatcher | undefined;
let output: OutputChannel | undefined;
let pending: Promise<void> = Promise.resolve();
let disposed = false;
let configuring = false;

function buildInitializationOptions() {
  const cfg = workspace.getConfiguration('forge');
  return {
    workspaceRoot: workspace.workspaceFolders?.[0]?.uri.fsPath,
    forge: {
      path: cfg.get<string>('path') || undefined,
      forgeRoot: cfg.get<string>('forgeRoot') || undefined,
      libDir: cfg.get<string>('libDir') || undefined,
      includePaths: cfg.get<string[]>('includePaths') || [],
    },
  };
}

async function stopClient(): Promise<void> {
  const previous = client;
  client = undefined;
  try {
    await previous?.stop();
  } finally {
    watcher?.dispose();
    watcher = undefined;
  }
}

async function openSettings(): Promise<void> {
  await commands.executeCommand('workbench.action.openSettings', '@ext:forge-language.forge-lsp-vscode');
}

async function setup(): Promise<void> {
  if (!workspace.isTrusted) {
    await window.showInformationMessage('Trust this workspace before configuring or starting Forge tools.', 'Manage Workspace Trust')
      .then((action) => action === 'Manage Workspace Trust' ? commands.executeCommand('workbench.trust.manage') : undefined);
    return;
  }
  const mode = await window.showQuickPick([
    { label: 'Native server', description: 'Installed forge-lsp executable', mode: 'native' },
    { label: 'TypeScript server', description: 'Installed language-server out/server.js', mode: 'typescript' },
  ], { title: 'Forge: Set Up Language Server', placeHolder: 'Choose the server you have installed' });
  if (!mode) return;
  const cfg = workspace.getConfiguration('forge');
  const key = mode.mode === 'native' ? 'lspPath' : 'serverModule';
  const value = await window.showInputBox({
    title: mode.mode === 'native' ? 'Forge native language server' : 'Forge TypeScript language server',
    prompt: mode.mode === 'native'
      ? 'Executable name on PATH or absolute path to forge-lsp. This does not install or download tools.'
      : 'Absolute path to the separately installed language-server out/server.js.',
    value: cfg.get<string>(key) || (mode.mode === 'native' ? 'forge-lsp' : ''),
    ignoreFocusOut: true,
    validateInput: (input) => {
      try {
        resolveServer({ serverMode: mode.mode, [key]: input });
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (value === undefined) return;
  // Store executable choices in user settings, never in a repository-controlled file.
  configuring = true;
  try {
    await cfg.update(key, value.trim(), true);
    await cfg.update('serverMode', mode.mode, true);
  } finally {
    configuring = false;
  }
  const action = await window.showInformationMessage(
    'Forge server configured. Compiler-backed checks also need the Forge SDK; set forge.path if forge is not on PATH.',
    'Start Server', 'Open Settings');
  if (action === 'Start Server') await scheduleStart(true);
  if (action === 'Open Settings') await openSettings();
}

async function startClient(): Promise<void> {
  if (disposed || client?.isRunning()) return;
  if (!workspace.isTrusted) {
    output?.appendLine('Language server paused: workspace is not trusted. Syntax highlighting remains available.');
    return;
  }
  const cfg = workspace.getConfiguration('forge');
  const server = resolveServer({
    serverMode: cfg.get<string>('serverMode'),
    lspPath: cfg.get<string>('lspPath'),
    serverModule: cfg.get<string>('serverModule'),
  });
  const serverOptions: ServerOptions = server.kind === 'native'
    ? { command: server.command, args: [] }
    : {
      run: { module: server.module, transport: TransportKind.ipc },
      debug: { module: server.module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6010'] } },
    };
  watcher = workspace.createFileSystemWatcher('**/*.fg');
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'forge' }],
    initializationOptions: buildInitializationOptions(),
    synchronize: { fileEvents: watcher },
    outputChannel: output,
  };
  try {
    client = new LanguageClient('forgeLanguageServer', 'Forge Language Server', serverOptions, clientOptions);
    await client.start();
    output?.appendLine(`Started ${server.kind} Forge language server.`);
  } catch (error) {
    try { await stopClient(); } catch (stopError) { output?.appendLine(`Server cleanup: ${String(stopError)}`); }
    throw error;
  }
}

function scheduleStart(restart = false): Promise<void> {
  pending = pending.then(async () => {
    if (disposed) return;
    try {
      if (restart) await stopClient();
      await startClient();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output?.appendLine(`Forge startup failed: ${message}`);
      // Do not hold the startup queue while a notification waits for user input.
      void window.showErrorMessage(`Forge language server could not start. ${message}`, 'Set Up Forge', 'Show Output')
        .then((action) => {
          if (action === 'Set Up Forge') return commands.executeCommand('forge.setup');
          if (action === 'Show Output') output?.show();
          return undefined;
        });
    }
  });
  return pending;
}

export async function activate(context: ExtensionContext): Promise<void> {
  disposed = false;
  pending = Promise.resolve();
  output = window.createOutputChannel('Forge Language Server');
  context.subscriptions.push(output, { dispose: () => { void deactivate(); } });
  context.subscriptions.push(
    commands.registerCommand('forge.setup', setup),
    commands.registerCommand('forge.startLanguageServer', async () => {
      if (!workspace.isTrusted) {
        await commands.executeCommand('workbench.trust.manage');
        return;
      }
      await scheduleStart();
    }),
    commands.registerCommand('forge.restartLanguageServer', () => scheduleStart(true)),
    commands.registerCommand('forge.showLanguageServerOutput', () => output?.show()),
    workspace.onDidGrantWorkspaceTrust(() => { void scheduleStart(); }),
    workspace.onDidChangeConfiguration((event) => {
      if (configuring || !event.affectsConfiguration('forge')) return;
      if (['serverMode', 'lspPath', 'serverModule'].some((key) => event.affectsConfiguration(`forge.${key}`))) {
        void window.showInformationMessage('Forge server settings changed. Restart the language server to apply them.', 'Restart Server')
          .then((action) => action === 'Restart Server' ? scheduleStart(true) : undefined);
      } else if (client?.isRunning() && workspace.isTrusted) {
        void client.sendNotification('workspace/didChangeConfiguration', {
          settings: { forge: buildInitializationOptions().forge },
        }).catch((error: unknown) => {
          output?.appendLine(`Configuration update failed: ${String(error)}`);
          void window.showErrorMessage('Forge configuration update failed. See Forge Language Server output for details.');
        });
      }
    }),
  );
  await scheduleStart();
}

export function deactivate(): Promise<void> {
  disposed = true;
  pending = pending.then(stopClient);
  return pending;
}
