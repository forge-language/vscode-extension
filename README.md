# Forge VS Code Extension

VS Code and Cursor language support for [Forge](https://github.com/forge-language/forge): syntax highlighting for `.fg` files and a language client for diagnostics, completion, hover, and document symbols. Available language features depend on the selected server.

This repository builds independently. It does not download, build, or bundle the compiler or language server.

## Build and run

Use Node.js 22 and npm:

```bash
npm ci
npm run build
npm test
```

Open this repository in VS Code and press **F5** to launch the Extension Development Host. Open a `.fg` file there to activate the extension. To package it for local installation, run `npx @vscode/vsce package`, then use **Extensions: Install from VSIX…**.

## Native language server (default)

Build and install `forge-lsp` from the [Forge compiler repository](https://github.com/forge-language/forge), or point to an already built executable. The extension searches `PATH` for `forge-lsp`. Configure an absolute path when it is not on `PATH`:

```json
{
  "forge.serverMode": "native",
  "forge.lspPath": "/absolute/path/to/forge/build/bin/forge-lsp"
}
```

An invalid explicit path produces an actionable error. The extension does not guess compiler checkout or sibling repository locations.

## TypeScript language server

Clone and build the separate [language-server repository](https://github.com/forge-language/language-server), then configure its module explicitly:

```json
{
  "forge.serverMode": "typescript",
  "forge.serverModule": "/absolute/path/to/language-server/out/server.js",
  "forge.path": "/absolute/path/to/forge/build/bin/forge",
  "forge.forgeRoot": "/absolute/path/to/forge",
  "forge.libDir": "/absolute/path/to/forge/build/lib",
  "forge.includePaths": ["/absolute/path/to/project/modules"]
}
```

The TypeScript server runs in a Node child process over IPC. Its own dependencies must be installed in its repository. Changes to `.fg` files anywhere in the workspace are forwarded to the server so imported-module caches can refresh. Compiler settings (`forge.path`, `forge.forgeRoot`, `forge.libDir`, and `forge.includePaths`) are passed to the server on initialization and when edited. Reload the VS Code window after changing `forge.serverMode`, `forge.lspPath`, or `forge.serverModule`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
