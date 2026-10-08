# Forge LSP for VS Code

Forge language support for VS Code and Cursor: syntax highlighting for `.fg` files and a language client for diagnostics, completion, hover, and document symbols. Available features depend on the installed server.

To learn Forge before installing tools, see the [Forge website](https://forge-lang.org), its [browser playground](https://forge-lang.org/playground), and [compiler examples](https://github.com/forge-language/forge/tree/main/examples). The editor extension does not download, build, or bundle the SDK or language server.

## First use

1. Install the [Forge SDK](https://github.com/forge-language/forge-sdk) and the separate [Forge language server](https://github.com/forge-language/language-server). Put `forge` and `forge-lsp` on `PATH`, or keep their absolute executable paths.
2. Open a trusted project and a `.fg` file. The extension starts `forge-lsp` automatically when it is available.
3. If the server is missing, open the Command Palette and choose **Forge: Set Up Language Server**. Select the installed native executable or TypeScript server module. Paths are validated and saved in your user settings.
4. Use **Forge: Start Language Server** to retry, **Forge: Restart Language Server** after changing server settings, and **Forge: Show Language Server Output** to inspect errors. These commands work from the keyboard through the Command Palette.

In an untrusted workspace, syntax highlighting remains available and the extension does not launch tools. **Forge: Start Language Server** opens VS Code's workspace trust controls. After trust is granted, the server can start automatically. Trust a workspace only when you are willing to let its tools run.

## Native language server (default)

Build or install `forge-lsp` from the [language-server repository](https://github.com/forge-language/language-server). The extension searches `PATH` for `forge-lsp`. Set an absolute path if necessary:

```json
{
  "forge.serverMode": "native",
  "forge.lspPath": "/absolute/path/to/forge-install/bin/forge-lsp",
  "forge.path": "/absolute/path/to/forge-install/bin/forge"
}
```

The server uses the compiler for checks and document symbols. Set `forge.path` when `forge` is not on the editor process's `PATH`. An installed SDK normally resolves its own runtime and standard library; `forge.forgeRoot`, `forge.libDir`, and `forge.includePaths` are optional overrides.

## TypeScript language server

Build the separate [language-server repository](https://github.com/forge-language/language-server), including its npm dependencies, then use **Forge: Set Up Language Server**, or configure:

```json
{
  "forge.serverMode": "typescript",
  "forge.serverModule": "/absolute/path/to/language-server/out/server.js",
  "forge.path": "/absolute/path/to/forge-install/bin/forge",
  "forge.includePaths": ["/absolute/path/to/project/modules"]
}
```

The TypeScript server runs in a Node child process over IPC. Workspace `.fg` changes are forwarded to invalidate imported-module caches. Compiler settings are sent on initialization and when edited. Changing the server implementation or path offers a restart without reloading the editor.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Native server cannot start | Check that `forge-lsp` exists, is executable, and matches your operating system. Run setup with its absolute path. |
| TypeScript module cannot start | Run `npm ci` and `npm run build` in `language-server`; select its `out/server.js`, not its source `.ts` file. |
| Compiler launch fails in diagnostics | Install the Forge SDK and set `forge.path` to its `bin/forge` executable. Run that executable in a terminal to verify the installation. |
| Server works in a terminal but not VS Code | The editor may have an older `PATH`. Use absolute paths, or restart VS Code after changing `PATH`. |
| No server in Restricted Mode | Review the workspace and use VS Code's workspace trust controls. Syntax highlighting still works. |
| Server exits or checks fail | Open **Forge: Show Language Server Output**, check the reported dependency/path error, then choose **Forge: Restart Language Server**. |

Setup cancellation leaves your settings unchanged. This extension never installs tools automatically. Native builds may also need a host C compiler; follow the SDK installation guide for your platform.

## Build and run the extension

Use Node.js 22 and npm:

```bash
npm ci
npm run build
npm test
```

Open this repository in VS Code and press **F5** to launch the Extension Development Host. Open a `.fg` file to activate the extension. To package it locally, run `npx @vscode/vsce package`, then use **Extensions: Install from VSIX…**.

## 한국어 빠른 시작

Forge SDK와 별도 `language-server`를 설치하고 신뢰하는 프로젝트에서 `.fg` 파일을 여세요. 명령 팔레트의 **Forge: Set Up Language Server**에서 서버 경로를 지정할 수 있습니다. 컴파일러를 찾지 못하면 `forge.path`를 SDK의 `bin/forge` 경로로 설정하세요. 문제가 생기면 **Forge: Show Language Server Output**으로 오류를 확인하고 **Forge: Restart Language Server**로 재시도하세요. 제한 모드에서는 서버를 실행하지 않으며 구문 강조만 제공합니다.

## License

Apache License 2.0. See [LICENSE](LICENSE).
