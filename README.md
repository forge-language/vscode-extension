# Forge VS Code Extension

VS Code and Cursor extension for the [Forge](https://github.com/forge-language/forge) language.

## Features

- Syntax highlighting for `.fg` files
- Diagnostics, completion, hover, document symbols (via [language-server](https://github.com/forge-language/language-server))

## Prerequisites

Build the Forge compiler:

```bash
git clone https://github.com/forge-language/forge.git
cd forge
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## Build the extension

```bash
npm install
npm run build
```

## Install locally

1. **Extensions: Install Extension from Location…** → select this directory
2. Reload the window

Or press **F5** in this repo to open an Extension Development Host.

## Workspace settings

```json
{
  "forge.path": "/path/to/forge/build/bin/forge",
  "forge.forgeRoot": "/path/to/forge/project",
  "forge.libDir": "/path/to/forge/build/lib",
  "forge.includePaths": ["/path/to/forge/examples"]
}
```

## License

MIT
