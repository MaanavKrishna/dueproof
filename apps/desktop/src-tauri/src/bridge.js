// Dueproof desktop bridge. Injected by the shell into the main window before
// the page's own scripts. It does nothing unless the page is the pinned server
// origin and the top frame. The shell fills in the three constants below.
(() => {
  const ORIGIN = __DP_ORIGIN__;
  const PLATFORM = __DP_PLATFORM__;
  const VERSION = __DP_VERSION__;
  if (window.top !== window || location.origin !== ORIGIN) return;
  const ipc = window.__TAURI_INTERNALS__;
  if (!ipc || typeof ipc.invoke !== "function") return;

  const notify = (title, body) =>
    ipc.invoke("notify", { title: String(title ?? ""), body: String(body ?? "") }).catch(() => {});

  // The web app can tell it's in the desktop shell, and style for the title bar.
  const mark = () => {
    const html = document.documentElement;
    if (!html) return;
    html.dataset.desktop = PLATFORM;
  };
  mark();
  document.addEventListener("DOMContentLoaded", mark, { once: true });

  Object.defineProperty(window, "dueproofDesktop", {
    value: Object.freeze({ platform: PLATFORM, version: VERSION, notify }),
    configurable: false,
    writable: false,
  });

  // Web Notifications → OS notifications. The webviews either lack the API or
  // show nothing, so the page's `new Notification(…)` is forwarded instead.
  class DesktopNotification extends EventTarget {
    static get permission() {
      return "granted";
    }
    static requestPermission(callback) {
      if (typeof callback === "function") callback("granted");
      return Promise.resolve("granted");
    }
    constructor(title, options = {}) {
      super();
      this.title = String(title ?? "");
      this.body = String(options.body ?? "");
      this.tag = String(options.tag ?? "");
      this.data = options.data ?? null;
      this.onclick = null;
      this.onclose = null;
      this.onerror = null;
      this.onshow = null;
      notify(this.title, this.body);
    }
    close() {}
  }
  window.Notification = DesktopNotification;

  // Files dropped outside a drop zone: the webview would otherwise open the
  // file in place of the app. Drop zones call preventDefault, so this only
  // sees drops nobody handled, and sends people to the upload screen.
  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (location.pathname !== "/inbox") location.assign("/inbox?upload=1");
  });
})();
