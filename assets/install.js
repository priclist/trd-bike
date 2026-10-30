// Install, the ClassroomX way: use the browser's own install prompt when it has one, otherwise show the steps.
// Loaded early on both the website and the sales app, so Chrome's one-off beforeinstallprompt is never missed.
(() => {
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  addEventListener("appinstalled", () => { deferred = null; close(); });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const $ = (s) => document.querySelector(s);
  function close() { const d = $("[data-install-dlg]"); if (d) d.hidden = true; }
  function open() {
    const d = $("[data-install-dlg]");
    const name = $("[data-install-title]").textContent.replace("Download ", "");
    $("[data-install-steps]").innerHTML = (ios
      ? ["1. Open this page in Safari.", "2. Tap the Share button.", "3. Choose Add to Home Screen, then tap Add."]
      : ["1. Open your browser menu.", "2. Choose Install app or Add to Home screen.", `3. Confirm, and ${name} lands on your home screen.`])
      .map((t) => `<li>${t}</li>`).join("");
    d.hidden = false;
    d.querySelector(".install-done").focus();
  }
  window.TRDInstall = async () => {
    if (deferred) {
      try { await deferred.prompt(); await deferred.userChoice; } catch { /* dismissed */ } finally { deferred = null; }
      return true;
    }
    open();
    return false;
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-install-close]") || e.target.matches("[data-install-dlg]")) close();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
