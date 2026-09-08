# 阅读器

一个安静、专注的桌面阅读器，支持本地书籍管理、阅读进度、书签、标注与多种电子书格式。

![阅读器初始书架界面](docs/images/initial-library.png)

## 下载与使用

### 方式一：下载发布版安装包（推荐）

适合普通 Windows 用户。前往 [GitHub Releases](https://github.com/MF-77F4/reader/releases)，下载最新版本中的 `阅读器-1.0.0-setup.exe`，双击安装即可。

> 首个 Windows 安装包正在准备发布；在此之前，请使用下方的源码构建方式。

### 方式二：从源码构建

适合开发者，需预先安装 [Node.js](https://nodejs.org/)（建议 LTS）和 pnpm。

```powershell
git clone https://github.com/MF-77F4/reader.git
cd reader
pnpm install
pnpm build:win:unsigned
```

构建完成后，Windows 安装程序位于 `dist` 目录。若只想在开发模式下启动应用：

```powershell
pnpm dev
```

## Tauri 2 migration

The project is being migrated from Electron to Tauri 2 while preserving the existing reading,
pagination, annotation, highlight, bookmark, and progress behavior. See
[`docs/TAURI_REWRITE_PLAN.md`](docs/TAURI_REWRITE_PLAN.md) for the architecture, compatibility
contract, regression matrix, and staged rollout plan.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

Electron remains available as the compatibility baseline. To run the new Tauri 2 desktop host:

```bash
$ pnpm dev:tauri
```

To validate only the Tauri web frontend or create a Tauri release executable without installers:

```bash
$ pnpm build:tauri:web
$ pnpm tauri build --no-bundle
```

### Keyboard shortcuts

| Shortcut | Desktop behavior |
| --- | --- |
| `Up Arrow` / `Down Arrow` | Scroll through the book while scroll mode is active. |
| `Left Arrow` | Previous page while page mode is active. |
| `Right Arrow` | Next page while page mode is active. |
| `Space` | Next page while page mode is active. |
| `Esc` | Close the topmost dialog, annotation panel, sidebar, or menu. |
| `F12` (default) | Boss key: hide the reader immediately; press again to restore and focus it. |

The boss key is registered globally by the desktop host, so it still works while the reader is
hidden or another application has focus. It can be changed from the reader settings panel and is
intentionally disabled on Android and iOS.

Windows Tauri development requires Rust, Microsoft C++ Build Tools with the Windows SDK, and the
WebView2 runtime. VS Code remains the recommended editor; the Visual Studio IDE is not required.
This workspace keeps its project-specific toolchains under `E:\reader\.devtools`; the Tauri npm
scripts and VS Code terminal configuration load Rust, Cargo, JDK, Gradle, Android SDK, and build
caches from that location.

### Android

Android development uses JDK 21, Android SDK API 36, Build Tools 35/36, NDK 29, and the four Rust
Android targets. After generating the Android project, apply the repository's Windows path fixes:

```bash
$ pnpm init:android
$ pnpm configure:android
$ pnpm build:android:debug
$ pnpm build:android:release
```

`configure:android` is required on Windows when the user profile contains non-ASCII characters or
the project and Cargo registry are on different drives. It disables incompatible Kotlin incremental
path handling and points Gradle at the project-local Tauri CLI entry.
The debug command produces an emulator-friendly x86_64 APK; the release command produces the
optimized ARM64 package intended for physical Android devices.

### Build

The app does not require Python at build time or runtime. Build each operating system release on
that operating system.

```bash
# For windows
$ pnpm build:win

# For an unsigned local Windows installer
$ pnpm build:win:unsigned

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```
