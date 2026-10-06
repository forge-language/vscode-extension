import { workspace, ExtensionContext, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { resolveServer } from './server';

let client: LanguageClient | undefined;

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

async function startClient(context: ExtensionContext): Promise<void> {
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
  const fileWatcher = workspace.createFileSystemWatcher('**/*.fg');
  context.subscriptions.push(fileWatcher);
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'forge' }],
    initializationOptions: buildInitializationOptions(),
    synchronize: { fileEvents: fileWatcher },
  };
  try {
    client = new LanguageClient('forgeLanguageServer', 'Forge Language Server', serverOptions, clientOptions);
    await client.start();
  } catch (error) {
    fileWatcher.dispose();
    context.subscriptions.splice(context.subscriptions.indexOf(fileWatcher), 1);
    client = undefined;
    throw error;
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('forge')) return;
    if (['serverMode', 'lspPath', 'serverModule'].some((key) => event.affectsConfiguration(`forge.${key}`))) {
      void window.showInformationMessage('Reload the VS Code window to apply Forge language server settings.');
    } else if (client?.isRunning()) {
      void client.sendNotification('workspace/didChangeConfiguration', {
        settings: { forge: buildInitializationOptions().forge },
      }).catch((error: unknown) => {
        void window.showErrorMessage(`Forge configuration update failed: ${String(error)}`);
      });
    }
  }));
  try {
    await startClient(context);
  } catch (error) {
    void window.showErrorMessage(`Forge: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deactivate(): Promise<void> | undefined {
  return client?.stop();
}
