const { execSync } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

class FocusWatcher extends EventEmitter {
  constructor() {
    super();
    this._interval = null;
    this._initialPid = null;
  }

  start() {
    if (this._interval) return;
    if (process.platform !== "win32") return;
    try {
      this._initialPid = this._getForegroundPid();
    } catch (e) {
      return;
    }
    this._interval = setInterval(() => {
      try {
        const currentPid = this._getForegroundPid();
        if (
          currentPid &&
          this._initialPid &&
          currentPid !== this._initialPid
        ) {
          this.emit("focus-changed", {
            from: this._initialPid,
            to: currentPid,
          });
          this.stop();
        }
      } catch (e) {
        /* ignore transient errors */
      }
    }, 400);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._initialPid = null;
  }

  _getForegroundPid() {
    const psScript = path.join(
      __dirname,
      "../../resources/get-foreground-pid.ps1"
    );
    const result = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psScript}"`,
      { encoding: "utf8", timeout: 3000, windowsHide: true }
    );
    return parseInt(result.trim(), 10) || null;
  }
}

module.exports = { FocusWatcher };
