# OpenWhispr – Dictation Modifications

This fork extends [OpenWhispr](https://github.com/OpenWhispr/openwhispr) with features specifically designed for **German-speaking IT professionals and developers** who use speech-to-text as a daily dictation tool on Windows.

## Overview of Changes

Three feature commits on top of upstream v1.5.4 (`06c8b3d`):

| # | Commit | Description |
|---|--------|-------------|
| 1 | `feat: support dead-key hotkeys (^)` | Enables using dead keys like `^` (circumflex) as part of global hotkeys |
| 2 | `feat: auto-stop recording on focus loss` | Automatically stops recording when the user switches to another application |
| 3 | `feat: pre-populate IT/programmer dictionary` | Seeds the custom dictionary with ~55 IT/programming terms |

**Total impact:** ~140 lines added across 8 files (6 modified, 2 new). No dependencies added. No architectural changes.

---

## Feature 1: Dead-Key Hotkey Support

### Problem
German QWERTZ keyboards have the `^` key (circumflex) as a **dead key** directly left of the `1` key. Electron's `globalShortcut` API cannot register dead keys as accelerators, making `Win+^` impossible to use as a hotkey through the standard path.

### Solution
The `^` key is routed through OpenWhispr's existing **native Windows keyboard hook** (the compiled C listener) instead of Electron's `globalShortcut`.

### Files Changed
- **`resources/windows-key-listener.c`** – Added `VK_OEM_5` mapping (the virtual key code for `^` on German keyboards)
- **`src/helpers/hotkeyManager.js`** – New `hasNonStandardKey()` function that identifies keys requiring the native listener. Updated `register()`, `unregister()`, and cleanup logic to skip `globalShortcut` for these keys. Exported for use in `main.js`.
- **`main.js`** – Imported `hasNonStandardKey` and added it to the `needsNativeListener()` check

### How It Works
```
User presses Win+^ 
  → Native C listener detects VK_LWIN + VK_OEM_5
  → Sends key event via stdout to Node.js
  → hotkeyManager recognizes the combination
  → Triggers toggle-dictation (show panel + start/stop recording)
```

### Extensibility
The `NON_STANDARD_KEYS` set in `hotkeyManager.js` can be extended with additional dead keys (e.g., `` ` ``, `´`, `~`) for other keyboard layouts.

---

## Feature 2: Focus-Loss Auto-Stop

### Problem
During dictation, the user wants to:
1. Press `Win+^` to start recording
2. Speak their text
3. Switch to the target application (e.g., VS Code, email client)
4. Have the transcription automatically pasted

Step 3 requires the recording to stop automatically when focus leaves OpenWhispr.

### Solution
A **FocusWatcher** class polls the Windows foreground window at 500ms intervals using the Win32 API. When it detects a PID change (user switched apps), it emits a `focus-changed` event that triggers `sendStopDictation()`.

### Files Changed/Created
- **`src/helpers/focusWatcher.js`** *(new)* – EventEmitter-based class with `start()` and `stop()` methods. Spawns a PowerShell child process to call `GetForegroundWindow()` and `GetWindowThreadProcessId()`.
- **`resources/get-foreground-pid.ps1`** *(new)* – PowerShell script for P/Invoke access to `user32.dll`. Separated into its own file to avoid inline escaping issues.
- **`main.js`** – Creates FocusWatcher instance, connects `focus-changed` → `sendStopDictation()`, and listens for `recording-state-changed` IPC to activate/deactivate polling.
- **`preload.js`** – Exposes `notifyRecordingState` IPC channel to the renderer.
- **`src/hooks/useAudioRecording.js`** – Sends recording state changes to main process via the new IPC bridge.

### Architecture
```
Renderer (React)                    Main Process (Node.js)
─────────────────                   ──────────────────────
useAudioRecording                   main.js
  │ recording starts                  │
  ├──► notifyRecordingState(true) ──► ipcMain "recording-state-changed"
  │                                   │ focusWatcher.start()
  │                                   │   └── polls every 500ms
  │                                   │       └── PID changed?
  │                                   │           └── emit "focus-changed"
  │                                   │               └── sendStopDictation()
  │◄── "stop-dictation" ◄────────────┤
  │ recording stops                   │
  └──► notifyRecordingState(false) ──► focusWatcher.stop()
```

### Design Decisions
- **Polling (500ms)** was chosen over window event hooks because Electron's `BrowserWindow.on('blur')` doesn't reliably fire when the user switches via Alt+Tab or taskbar click.
- **PowerShell + P/Invoke** was chosen to avoid adding native dependencies. The `get-foreground-pid.ps1` script is only loaded once and runs with minimal overhead.
- The watcher **only runs while recording** to avoid unnecessary background CPU usage.

---

## Feature 3: IT/Programmer Dictionary

### Problem
Speech-to-text engines frequently misrecognize technical terms, especially when dictating in German where English loanwords are common. Words like "Kubernetes", "GraphQL", "Middleware", or "Deployment" are often transcribed incorrectly.

### Solution
The `customDictionary` default value in `settingsStore.ts` is seeded with ~55 common IT terms. These terms are passed to Whisper's prompt conditioning mechanism, biasing the model toward correct recognition without affecting general transcription quality.

### Files Changed
- **`src/stores/settingsStore.ts`** – Changed `customDictionary` default from `[]` to an array of IT terms

### Included Terms
| Category | Terms |
|----------|-------|
| Infrastructure | Server, Backup, Docker, Container, Kubernetes, Cluster, Node, Instance, Microservice, Proxy, Gateway |
| Development | API, REST, GraphQL, Endpoint, Middleware, Framework, TypeScript, JavaScript, Python, React, Codebase |
| DevOps | Deploy, Deployment, CI/CD, Pipeline, DevOps, Staging, Localhost, Webhook |
| Version Control | Commit, Branch, Merge, Repository, Git, Pull Request, Code Review |
| Security | Authentication, Authorization, Injection, Token, Session, Cookie, Cache |
| Project Management | Sprint, Ticket, Jira, Kanban |
| Cloud Platforms | Supabase, Vercel, AWS, Azure |
| Data | Datenbank, Database, SQL, Query |
| General | Upload, Download, Debugging, Refactoring, Frontend, Backend |

Users can add, remove, or modify terms through the existing settings UI.

---

## Pre-Existing Features (No Changes Needed)

These features were already present in OpenWhispr and required no modification:

- **Auto-Record on Toggle**: The `toggle-dictation` IPC message already shows the widget AND starts recording in one step. A second press stops recording. This is the desired behavior.
- **AI Text Cleaning**: The `useReasoningModel` setting defaults to `true` (line 210 in settingsStore.ts), meaning all transcriptions are automatically cleaned by the AI reasoning model (grammar, punctuation, formatting).

---

## Intended Workflow

```
1. User presses Win+^
   → OpenWhispr widget appears
   → Recording starts immediately

2. User speaks in German
   → "Bitte deploye den neuen Microservice auf den Kubernetes Cluster
      und erstelle einen Pull Request mit den Änderungen"

3. User clicks into target app (e.g., VS Code, Slack, Email)
   → Focus loss detected → Recording stops automatically
   → Whisper transcribes with IT dictionary bias
   → AI reasoning model cleans grammar and punctuation
   → Result is pasted into the target application
```

---

## Compatibility

- **Platform**: Windows only (the native keyboard hook and focus watcher use Windows-specific APIs)
- **Keyboard**: Optimized for German QWERTZ layout, but the dead-key mechanism works for any layout
- **OpenWhispr Version**: Based on v1.5.4. Changes are minimal and should be easy to rebase on newer versions.

---

## Contributing Upstream

These changes are designed to be PR-friendly for the OpenWhispr project:
- Each commit is self-contained and can be submitted as a separate PR
- No breaking changes to existing functionality
- No new dependencies
- Code style follows existing conventions
- All changes are additive (no removed features)