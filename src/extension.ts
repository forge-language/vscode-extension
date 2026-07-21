import * as fs from 'node:fs';
import * as path from 'node:path';
import { workspace, ExtensionContext, WorkspaceConfiguration } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

function resolveServerModule(context: ExtensionContext): string {
  const bundled = path.join(context.extensionPath, 'server', 'out', 'server.js');
  if (fs.existsSync(bundled)) return bundled;
  return bundled;
}

function forgeConfig(): WorkspaceConfiguration {
  return workspace.getConfiguration('forge');
}

function buildInitializationOptions() {
  const cfg = forgeConfig();
  const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
  return {
    workspaceRoot,
    forge: {
      path: cfg.get<string>('path') || undefined,
      forgeRoot: cfg.get<string>('forgeRoot') || undefined,
      libDir: cfg.get<string>('libDir') || undefined,
      includePaths: cfg.get<string[]>('includePaths') || [],
    },
  };
}

export function activate(context: ExtensionContext): void {
  const serverModule = resolveServerModule(context);
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6010'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'forge' }],
    synchronize: {
      configurationSection: 'forge',
    },
    initializationOptions: buildInitializationOptions(),
  };

  client = new LanguageClient('forgeLanguageServer', 'Forge Language Server', serverOptions, clientOptions);
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('forge') && client?.isRunning()) {
        void client.sendNotification('workspace/didChangeConfiguration', {
          settings: { forge: buildInitializationOptions().forge },
        });
      }
    }),
  );
  void client.start();
}

export function deactivate(): Promise<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
