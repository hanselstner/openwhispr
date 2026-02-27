const { exec } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

class FocusWatcher extends EventEmitter {
  constructor() {
    super();
    this._interval = null;
    this._initialPid = null;
    this._busy = false;
  }

  start() {
    if (this._interval) return;
    if (process.platform !== "win32") return;

    // Capture initial PID asynchronously; interval starts immediately
    // and skips until _initialPid is populated.
    this._getForegroundPid()
      .then((pid) => {
        this._initialPid = pid;
      })
      .catch(() => {
        /* ignore */
      });

    this._interval = setInterval(async () => {
      // Skip this tick if a previous PowerShell call is still running
      if (this._busy || !this._initialPid) return;
      this._busy = true;
      try {
        const currentPid = await this._getForegroundPid();
        if (currentPid && this._initialPid && currentPid !== this._initialPid) {
          this.emit("focus-changed", {
            from: this._initialPid,
            to: currentPid,
          });
          this.stop();
        }
      } catch (e) {
        /* ignore transient errors */
      } finally {
        this._busy = false;
      }
    }, 400);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._initialPid = null;
    this._busy = false;
  }

  _getForegroundPid() {
    return new Promise((resolve, reject) => {
      const psScript = path.join(
        __dirname,
        "../../resources/get-foreground-pid.ps1"
      );
      exec(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psScript}"`,
        { encoding: "utf8", timeout: 3000, windowsHide: true },
        (err, stdout) => {
          if (err) return reject(err);
          resolve(parseInt(stdout.trim(), 10) || null);
        }
      );
    });
  }
}

module.exports = { FocusWatcher };
