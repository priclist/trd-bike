// Cookie consent. One first-party cookie, trd_consent, remembers the choice for six months.
// The only optional category is maps: the Google map in "Visit us" sets Google's cookies, so its iframe
// is kept in a <template> and only goes into the page once maps are allowed.
(() => {
  const NAME = "trd_consent";
  const MAX_AGE = 60 * 60 * 24 * 182;
  const $ = (sel) => document.querySelector(sel);
  const banner = $("[data-cookies]");
  const dialog = $("[data-cookie-dialog]");
  const form = $("[data-cookie-form]");
  const map = $("[data-map]");

  const read = () => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${NAME}=([^;]*)`));
    return m ? { maps: decodeURIComponent(m[1]).includes("maps:1") } : null;
  };
  const write = (choice) => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${NAME}=${encodeURIComponent(`v1|maps:${choice.maps ? 1 : 0}`)}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    apply(choice);
    banner.hidden = true;
  };

  function loadMap() {
    if (!map || map.querySelector("iframe")) return;
    map.append($("[data-map-frame]").content.cloneNode(true));
    map.classList.add("is-live");
  }
  function apply(choice) {
    if (choice.maps) return loadMap();
    // maps switched off: take the iframe back out (cookies Google already set stay until they expire)
    const frame = map && map.querySelector("iframe");
    if (frame) { frame.remove(); map.classList.remove("is-live"); }
  }

  const saved = read();
  if (saved) apply(saved);
  else banner.hidden = false;

  banner.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-consent]");
    if (btn) write({ maps: btn.dataset.consent === "all" });
  });

  // "Show the map" is a choice too: remember it so the map is there next visit
  map && map.addEventListener("click", (e) => {
    if (e.target.closest("[data-map-load]")) write({ ...(read() || {}), maps: true });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-cookie-settings]")) return;
    form.maps.checked = !!(read() || {}).maps;
    dialog.showModal();
  });
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "all") write({ maps: true });
    else if (dialog.returnValue === "save") write({ maps: form.maps.checked });
    dialog.returnValue = "";
  });
  // a click on the backdrop closes without saving
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
})();
