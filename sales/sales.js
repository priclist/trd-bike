// TRD Sales: download screen → sign in → post photos to the website, edit your profile, and (managers) run the team.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "R" + Math.round(n).toLocaleString("en-US");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

  const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }; // Android haptics; iOS ignores it
  let me = null;
  let posts = [];

  // ---------- api ----------
  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`/api${path}`, {
      method, credentials: "same-origin",
      headers: { "X-TRD": "1", ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
      body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again."), { status: res.status });
    return data;
  }
  // XHR for uploads, so the bar can show real progress on slow data
  function upload(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api${path}`);
      xhr.setRequestHeader("X-TRD", "1");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || "Upload failed. Try again."));
      };
      xhr.onerror = () => reject(new Error("No connection. Your post wasn't sent, try again when you have signal."));
      xhr.send(form);
    });
  }

  // ---------- screens + views ----------
  function screen(name) {
    $$("[data-screen]").forEach((s) => (s.hidden = s.dataset.screen !== name));
    document.documentElement.dataset.mode = name;
    loginVideo(name === "login");
  }
  // the website's track clip loops behind the sign-in form; it only loads when that screen shows
  const lv = $("[data-login-video]");
  function loginVideo(on) {
    if (!on) return lv.pause();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!lv.currentSrc && !lv.querySelector("source")) {
      const wide = matchMedia("(min-width: 760px)").matches;
      lv.innerHTML = `<source src="${wide ? lv.dataset.srcMp4 : lv.dataset.srcMobile}" type="video/mp4">`;
      lv.load();
    }
    lv.play().catch(() => addEventListener("pointerdown", () => lv.play().catch(() => {}), { once: true }));
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("[data-screen=login]").hidden) lv.play().catch(() => {}); });
  function view(name) {
    if (name === "team" && me?.role !== "manager") name = "home";
    $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== name));
    $$(".tabbar [data-go]").forEach((b) => b.dataset.go === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
    scrollTo(0, 0);
    if (name === "team") loadTeam();
    if (name === "stock") loadStock();
    history.replaceState(null, "", name === "home" ? location.pathname : `#${name}`);
    if (name !== "post") store.set("trd-view", name); // reopen the app where you left it
  }
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) view(go.dataset.go);
    const nw = e.target.closest("[data-new]");
    if (nw) { resetPost(nw.dataset.new); view("post"); }
  });

  let toastTimer = 0;
  function toast(text) {
    const t = $("[data-toast]");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ---------- download gate ----------
  $("[data-install]").addEventListener("click", async () => {
    if (await window.TRDInstall()) { store.set("trd-gate", "done"); screen("login"); }
  });
  $("[data-skip-gate]").addEventListener("click", () => { store.set("trd-gate", "done"); screen("login"); $("[data-login] input").focus(); });

  // ---------- sign in ----------
  // "Keep me signed in" = a 90-day session. The email, name and photo are remembered on the phone so the next
  // sign-in is just the password (or the phone's saved password); "Not you?" forgets them.
  const loginForm = $("[data-login]");
  const remembered = () => { try { return JSON.parse(store.get("trd-account")); } catch { return null; } };
  function paintLogin() {
    const acct = remembered();
    $("[data-welcome]").hidden = !acct;
    $("[data-email-field]").hidden = !!acct;
    $("[data-login-sub]").textContent = acct ? "Enter your password to carry on." : "Use the email your manager set up for you.";
    if (acct) {
      loginForm.email.value = acct.email;
      $("[data-welcome-name]").textContent = `Welcome back, ${acct.name.split(" ")[0]}`;
      $("[data-welcome-email]").textContent = acct.email;
      $("[data-welcome-av]").innerHTML = avatarHtml(acct, "av av-md");
    }
    loginForm.remember.checked = store.get("trd-remember") !== "0";
  }
  $("[data-not-me]").addEventListener("click", () => {
    store.set("trd-account", "");
    loginForm.email.value = "";
    paintLogin();
    loginForm.email.focus();
  });
  $("[data-pw-eye]").addEventListener("click", (e) => {
    const b = e.currentTarget;
    const show = loginForm.password.type === "password";
    loginForm.password.type = show ? "text" : "password";
    b.setAttribute("aria-pressed", show);
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    loginForm.password.focus();
  });
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector("button[type=submit]");
    $("[data-error]").textContent = "";
    btn.disabled = true;
    try {
      const remember = f.remember.checked;
      const { user } = await api("/login", { method: "POST", body: { email: f.email.value, password: f.password.value, remember } });
      store.set("trd-remember", remember ? "1" : "0");
      store.set("trd-account", remember ? JSON.stringify({ email: user.email, name: user.name, avatar: user.avatar }) : "");
      // offer to save the password in the phone's password manager (Chrome / Android)
      if (remember && window.PasswordCredential) {
        navigator.credentials.store(new PasswordCredential({ id: user.email, password: f.password.value, name: user.name })).catch(() => {});
      }
      f.password.value = "";
      f.password.type = "password";
      tap(12);
      start(user);
    } catch (err) {
      $("[data-error]").textContent = err.message;
      f.password.select();
      tap(40);
    } finally {
      btn.disabled = false;
    }
  });
  $("[data-logout]").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    me = null;
    store.set("trd-view", "");
    history.replaceState(null, "", location.pathname);
    paintLogin();
    screen("login");
  });

  // ---------- signed in ----------
  const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarHtml = (u, cls) => u.avatar ? `<img class="${cls}" src="${esc(u.avatar)}" alt="">` : `<span class="${cls} av-blank">${esc(initials(u.name))}</span>`;

  function paintMe() {
    if (remembered()) store.set("trd-account", JSON.stringify({ email: me.email, name: me.name, avatar: me.avatar }));
    $$("[data-me-name]").forEach((el) => (el.textContent = me.name));
    $("[data-me-email]").textContent = me.email;
    $("[data-me-username]").value = me.email;
    $("[data-me-avatar]").innerHTML = avatarHtml(me, "av av-sm");
    $("[data-me-avatar-lg]").innerHTML = avatarHtml(me, "av av-lg");
    $$("[data-manager-only]").forEach((el) => (el.hidden = me.role !== "manager"));
    const h = new Date().getHours();
    $("[data-greeting]").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const f = $("[data-profile-form]");
    f.name.value = me.name;
    f.title.value = me.title || "";
    f.phone.value = me.phone || "";
    f.bio.value = me.bio || "";
    f.public.checked = !!me.public;
  }

  async function start(user) {
    me = user;
    paintMe();
    screen("app");
    const wanted = location.hash.slice(1) || store.get("trd-view");
    view(["post", "profile", "team", "stock"].includes(wanted) ? wanted : "home");
    loadPosts();
  }

  // ---------- posts ----------
  const LABEL = { bike: "Just in", gear: "Gear", floor: "Showroom", handover: "Handover" };
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };
  async function loadPosts() {
    try { posts = (await api("/posts/mine")).posts; } catch (err) { if (err.status === 401) return screen("login"); }
    const mine = posts.filter((p) => p.author?.id === me.id);
    $("[data-stat=all]").textContent = mine.length;
    $("[data-stat=bike]").textContent = mine.filter((p) => p.kind === "bike").length;
    $("[data-stat=gear]").textContent = mine.filter((p) => p.kind === "gear").length;
    $("[data-list-title]").textContent = me.role === "manager" ? "Everyone's posts" : "Your posts";
    $("[data-posts-empty]").hidden = posts.length > 0;
    $("[data-posts]").innerHTML = posts.map((p) => `
      <li class="post-row">
        <img src="${esc(p.photos[0])}" alt="" loading="lazy">
        <div class="post-meta">
          <span class="tag tag-${p.kind}">${LABEL[p.kind]}</span>
          <b>${esc(p.title || p.caption || "Photos")}</b>
          <small>${p.price ? `${money(p.price)} · ` : ""}${p.photos.length} photo${p.photos.length > 1 ? "s" : ""} · ${ago(p.created)}${p.author && p.author.id !== me.id ? ` · ${esc(p.author.name)}` : ""}</small>
        </div>
        <button class="icon-btn" type="button" data-delete="${esc(p.id)}" aria-label="Take this post off the website">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12"/></svg>
        </button>
      </li>`).join("");
  }
  $("[data-posts]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-delete]");
    if (!b || !confirm("Take this post off the website? The photos are deleted too.")) return;
    try { await api(`/posts/${b.dataset.delete}`, { method: "DELETE" }); toast("Taken off the website"); loadPosts(); } catch (err) { toast(err.message); }
  });

  // ---------- stock: every bike and gear item on the website; anyone can mark one sold (and put it back) ----------
  let stock = [];
  let gear = [];
  const km = (n) => `${Math.round(n).toLocaleString("en-US")} km`;
  const bikeTitle = (b) => [b.year, b.make, b.model].filter(Boolean).join(" ");
  const CATEGORY = { helmets: "Helmets", jackets: "Jackets", gloves: "Gloves", pants: "Pants", boots: "Boots", essentials: "Essentials" };
  const titleOf = (x) => x.category ? x.title : bikeTitle(x);
  async function loadStock() {
    try { ({ stock, gear } = await api("/stock")); } catch (err) { if (err.status === 401) return screen("login"); return toast(err.message); }
    paintStock();
  }
  function paintStock() {
    const type = $("[data-stock-type] input:checked").value;
    const isGear = type === "gear";
    const all = isGear ? gear : stock;
    const live = all.filter((b) => !b.sold);
    const sold = all.filter((b) => b.sold).sort((a, b) => (b.soldAt || "").localeCompare(a.soldAt || ""));
    $("[data-stock-type]").style.setProperty("--seg", isGear ? 1 : 0);
    $("[data-count-bikes]").textContent = `Bikes · ${stock.filter((b) => !b.sold).length}`;
    $("[data-count-gear]").textContent = `Gear · ${gear.filter((b) => !b.sold).length}`;
    $("[data-stock-summary]").textContent = isGear
      ? `${live.length} gear ${live.length === 1 ? "item" : "items"} on the website${sold.length ? `, ${sold.length} sold` : ""}. They show under “Kit up” with a WhatsApp button.`
      : `${live.length} ${live.length === 1 ? "bike" : "bikes"} on the website${sold.length ? `, ${sold.length} sold` : ""}. Mark a bike sold and it comes off the site straight away.`;
    $("[data-stock-add]").dataset.new = isGear ? "gear" : "bike";
    $("[data-stock-add-label]").textContent = isGear ? "Add gear" : "Add a bike";
    $("[data-stock-q]").placeholder = isGear ? "Name, brand or category" : "Make, model, year or stock no.";
    $("[data-count-live]").textContent = `On the site · ${live.length}`;
    $("[data-count-sold]").textContent = `Sold · ${sold.length}`;
    const which = $("[data-stock-seg] input:checked").value;
    $("[data-stock-seg]").style.setProperty("--seg", which === "sold" ? 1 : 0);
    const q = $("[data-stock-q]").value.trim().toLowerCase();
    const hay = (b) => (isGear ? `${b.title} ${b.brand || ""} ${CATEGORY[b.category] || ""}` : `${bikeTitle(b)} ${b.stock_no || ""}`).toLowerCase();
    const list = (which === "sold" ? sold : live).filter((b) => !q || hay(b).includes(q));
    $("[data-stock-empty]").hidden = list.length > 0;
    $("[data-stock-empty-text]").textContent = q ? "Nothing matches that search."
      : which === "sold" ? "Anything you mark sold lands here, in case you need to put it back."
      : isGear ? "Tap “Add gear” to put helmets, jackets and the rest on the website." : "Tap “Add a bike” to put one on the website.";
    $("[data-stock-list]").innerHTML = list.map((b) => `
      <li class="stock-row${b.sold ? " is-sold" : ""}${isGear ? " is-gear" : ""}">
        <img src="${esc(b.photo)}" alt="" loading="lazy" decoding="async">
        <div class="post-meta">
          ${isGear ? `<span class="tag tag-gear">${esc(CATEGORY[b.category] || "Gear")}</span>` : b.source === "team" ? '<span class="tag tag-bike">Just in</span>' : ""}
          <b>${esc(titleOf(b))}</b>
          <small>${isGear
            ? [b.brand && esc(b.brand), b.price ? money(b.price) : "Ask for price", b.sizes && `Sizes ${esc(b.sizes)}`].filter(Boolean).join(" · ")
            : `${b.price ? money(b.price) : "Ask for price"}${b.mileage_km != null ? ` · ${km(b.mileage_km)}` : ""}${b.stock_no ? ` · ${esc(b.stock_no)}` : ""}`}</small>
          ${b.sold ? `<small>Sold${b.soldBy ? ` by ${esc(b.soldBy)}` : ""} · ${ago(b.soldAt)}</small>` : b.postedBy ? `<small>Added by ${esc(b.postedBy)}</small>` : ""}
        </div>
        ${b.sold
          ? `<button class="btn btn-glass btn-sm" type="button" data-unsold="${esc(b.id)}">Put back</button>`
          : `<button class="btn btn-sold btn-sm" type="button" data-sold="${esc(b.id)}">Mark sold</button>`}
      </li>`).join("");
  }
  $("[data-stock-q]").addEventListener("input", paintStock);
  $("[data-stock-seg]").addEventListener("change", paintStock);
  $("[data-stock-type]").addEventListener("change", () => { $("[data-stock-q]").value = ""; paintStock(); });
  $("[data-stock-list]").addEventListener("click", async (e) => {
    const s = e.target.closest("[data-sold]");
    const u = e.target.closest("[data-unsold]");
    const id = (s || u)?.dataset.sold || (s || u)?.dataset.unsold;
    if (!id) return;
    const b = [...stock, ...gear].find((x) => x.id === id);
    if (s && !confirm(`Mark the ${titleOf(b)} as sold?\n\nIt comes off the website straight away. You can put it back from the Sold tab.`)) return;
    (s || u).disabled = true;
    try {
      await api(`/stock/${encodeURIComponent(id)}/sold`, { method: s ? "POST" : "DELETE" });
      Object.assign(b, s ? { sold: true, soldBy: me.name, soldAt: new Date().toISOString() } : { sold: false, soldBy: "", soldAt: "" });
      paintStock();
      toast(s ? "Sold. It's off the website." : "Back on the website");
      tap(s ? 20 : 8);
    } catch (err) {
      toast(err.message);
      (s || u).disabled = false;
    }
  });

  // ---------- scroll wheels (iOS-style pickers) for the gear category and the bike's year ----------
  // A scroll-snapped list; each row tilts on a drum by its distance from the middle. The value lands in a hidden input.
  function makeWheel(el, input, options) {
    const ROW = 40;
    el.innerHTML = `<div class="wheel-band" aria-hidden="true"></div>
      <ul class="wheel-list" role="listbox" tabindex="0" aria-label="${esc(el.dataset.label)}">
        ${options.map(([, label], i) => `<li role="option" data-i="${i}">${esc(label)}</li>`).join("")}
      </ul>`;
    const list = el.querySelector(".wheel-list");
    const items = [...list.children];
    let index = -1;
    let quiet = true; // no haptic tick while setting the starting value
    function paint() {
      const pos = list.scrollTop / ROW;
      items.forEach((li, i) => {
        const d = i - pos;
        li.style.transform = `rotateX(${Math.max(-80, Math.min(80, -d * 22))}deg)`;
        li.style.opacity = Math.max(0.12, 1 - Math.abs(d) * 0.3);
      });
      const i = Math.min(items.length - 1, Math.max(0, Math.round(pos)));
      if (i === index) return;
      index = i;
      items.forEach((li, n) => li.setAttribute("aria-selected", n === i));
      input.value = options[i][0];
      if (!quiet) tap(4);
    }
    let raf = 0;
    list.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }, { passive: true });
    list.addEventListener("pointerdown", () => (quiet = false));
    list.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) go(Number(li.dataset.i), true); });
    list.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); quiet = false; go(index + (e.key === "ArrowDown" ? 1 : -1), true); }
    });
    function go(i, smooth) {
      i = Math.max(0, Math.min(items.length - 1, i));
      list.scrollTo({ top: i * ROW, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
      if (!smooth) paint();
    }
    // a wheel inside a hidden section can't scroll, so callers set the value again once it shows
    return {
      set(value) {
        quiet = true;
        index = -1;
        go(Math.max(0, options.findIndex(([v]) => String(v) === String(value))), false);
      },
    };
  }

  // ---------- new post ----------
  const form = $("[data-post-form]");
  const HELP = {
    bike: "A bike that just came in. It goes to the top of the stock list on the website with a “Just in” tag.",
    gear: "Helmets, jackets, gloves and the rest. They show in the website's gear section with a price and a WhatsApp button.",
    floor: "Shots of the showroom. They show in “Fresh from the floor” on the website.",
    handover: "A customer collecting their bike. Ask them first before you post their face.",
  };
  const categoryWheel = makeWheel($("[data-wheel=category]"), form.category, [
    ["helmets", "Helmets"], ["jackets", "Jackets"], ["gloves", "Gloves"], ["pants", "Pants"],
    ["boots", "Riding shoes & boots"], ["essentials", "Other essentials"],
  ]);
  const thisYear = new Date().getFullYear();
  const yearWheel = makeWheel($("[data-wheel=year]"), form.year,
    [["", "Year"], ...Array.from({ length: thisYear - 1979 }, (_, n) => [thisYear - n, String(thisYear - n)])]);
  let picked = []; // { blob, url }
  function resetPost(kind = "bike") {
    form.reset();
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    picked = [];
    paintPhotos();
    form.kind.value = kind;
    paintKind();
    $("[data-post-error]").textContent = "";
  }
  function paintKind() {
    const kind = form.kind.value;
    const i = ["bike", "gear", "floor", "handover"].indexOf(kind);
    form.style.setProperty("--seg", i);
    $("[data-kind-help]").textContent = HELP[kind];
    $("[data-bike-fields]").hidden = kind !== "bike";
    $("[data-gear-fields]").hidden = kind !== "gear";
    if (kind === "gear") categoryWheel.set(form.category.value || "helmets");
    if (kind === "bike") yearWheel.set(form.year.value);
    $("[data-title-field]").hidden = kind === "bike";
    $("[data-title-label]").textContent = kind === "gear" ? "Item name" : "Title";
    form.title.placeholder = kind === "gear" ? "Supertech R10 helmet" : "Saturday on the floor";
    $("[data-caption-label]").textContent = kind === "bike" || kind === "gear" ? "Notes for buyers" : "Caption";
    form.caption.placeholder = {
      bike: "Full service history, new tyres, one owner…",
      gear: "Carbon shell, pinlock visor, comes with a bag.",
      floor: "Fresh stock out on the floor this morning.",
      handover: "Congrats Thabo on the new Tracer 9!",
    }[kind];
  }
  form.addEventListener("change", (e) => { if (e.target.name === "kind") paintKind(); });

  // shrink on the phone before upload: longest side 1800 px, WebP where the browser can encode it, else JPEG
  async function shrink(file, max = 1800) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    if (!bmp) return file;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const webp = await new Promise((r) => c.toBlob(r, "image/webp", 0.82));
    if (webp && webp.type === "image/webp") return webp;
    return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  }
  $("[data-file]").addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, 12 - picked.length);
    e.target.value = "";
    for (const f of files) {
      const blob = await shrink(f);
      picked.push({ blob, url: URL.createObjectURL(blob) });
      paintPhotos();
    }
  });
  function paintPhotos() {
    const wrap = $("[data-photos]");
    $$(".photo", wrap).forEach((el) => el.remove());
    wrap.insertAdjacentHTML("afterbegin", picked.map((p, i) => `
      <div class="photo">
        <img src="${p.url}" alt="Photo ${i + 1}">
        ${i === 0 ? '<span class="cover">Cover</span>' : ""}
        <button type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}"><svg class="icon" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
      </div>`).join(""));
    $(".photo-add", wrap).hidden = picked.length >= 12;
  }
  $("[data-photos]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const [gone] = picked.splice(Number(b.dataset.remove), 1);
    URL.revokeObjectURL(gone.url);
    paintPhotos();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("[data-post-error]");
    err.textContent = "";
    if (!picked.length) return (err.textContent = "Add at least one photo.");
    if (form.kind.value === "bike" && (!form.make.value.trim() || !form.model.value.trim())) return (err.textContent = "Add the make and model.");
    if (form.kind.value === "gear" && !form.title.value.trim()) return (err.textContent = "Give the item a name.");
    const data = new FormData();
    for (const k of ["kind", "title", "caption", "make", "model", "year", "price", "mileage_km", "engine_cc", "colour", "category", "brand", "sizes"]) data.append(k, form[k].value);
    if (form.kind.value === "gear") data.set("price", form.gear_price.value);
    picked.forEach((p, i) => data.append("photos", p.blob, `photo-${i}.${p.blob.type === "image/webp" ? "webp" : "jpg"}`));
    const bar = $("[data-progress]");
    const btn = $("[data-post-submit]");
    bar.hidden = false;
    btn.disabled = true;
    btn.textContent = "Posting…";
    try {
      await upload("/posts", data, (p) => bar.style.setProperty("--p", p));
      toast("Live on the website");
      tap(20);
      resetPost();
      view("home");
      loadPosts();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      bar.hidden = true;
      bar.style.setProperty("--p", 0);
      btn.disabled = false;
      btn.textContent = "Post to the website";
    }
  });

  // ---------- profile ----------
  $("[data-profile-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    $("[data-profile-error]").textContent = "";
    try {
      ({ user: me } = await api("/me", { method: "PATCH", body: { name: f.name.value, title: f.title.value, phone: f.phone.value, bio: f.bio.value, public: f.public.checked } }));
      paintMe();
      toast("Profile saved");
    } catch (err) { $("[data-profile-error]").textContent = err.message; }
  });
  $("[data-password-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    $("[data-password-error]").textContent = "";
    try {
      await api("/me", { method: "PATCH", body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value } });
      f.reset();
      toast("Password changed");
    } catch (err) { $("[data-password-error]").textContent = err.message; }
  });
  $("[data-avatar-file]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const blob = await shrink(file, 600);
    const data = new FormData();
    data.append("photo", blob, `me.${blob.type === "image/webp" ? "webp" : "jpg"}`);
    try { ({ user: me } = await upload("/me/avatar", data, () => {})); paintMe(); toast("Photo updated"); } catch (err) { toast(err.message); }
  });

  // ---------- team ----------
  async function loadTeam() {
    let team = [];
    try { ({ team } = await api("/team")); } catch (err) { return toast(err.message); }
    $("[data-team-list]").innerHTML = team.map((u) => `
      <li class="member-row${u.active ? "" : " off"}">
        ${avatarHtml(u, "av av-md")}
        <div><b>${esc(u.name)}</b><small>${esc(u.email)} · ${u.role === "manager" ? "Manager" : "Sales"}${u.active ? "" : " · switched off"}</small></div>
        ${u.id === me.id ? '<span class="you">You</span>' : `
          <button class="btn btn-glass btn-sm" type="button" data-reset="${esc(u.id)}">Reset</button>
          <button class="btn ${u.active ? "btn-glass" : "btn-red"} btn-sm" type="button" data-toggle="${esc(u.id)}" data-on="${u.active}">${u.active ? "Switch off" : "Switch on"}</button>`}
      </li>`).join("");
  }
  $("[data-team-list]").addEventListener("click", async (e) => {
    const t = e.target.closest("[data-toggle]");
    const r = e.target.closest("[data-reset]");
    try {
      if (t) {
        await api(`/team/${t.dataset.toggle}`, { method: "PATCH", body: { active: t.dataset.on !== "true" } });
        toast(t.dataset.on === "true" ? "Switched off. Their posts are hidden from the website." : "Switched back on");
        loadTeam();
      }
      if (r) {
        const pw = prompt("New password for them (at least 8 characters):");
        if (!pw) return;
        await api(`/team/${r.dataset.reset}`, { method: "PATCH", body: { password: pw } });
        toast("Password reset. Send it to them.");
      }
    } catch (err) { toast(err.message); }
  });
  $("[data-add-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    $("[data-add-error]").textContent = "";
    try {
      await api("/team", { method: "POST", body: { name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.password.value, role: f.manager.checked ? "manager" : "sales" } });
      f.reset();
      toast("Added to the team");
      loadTeam();
    } catch (err) { $("[data-add-error]").textContent = err.message; }
  });

  // ---------- boot ----------
  paintLogin();
  api("/me")
    .then(({ user }) => start(user))
    .catch(() => screen(standalone || store.get("trd-gate") === "done" ? "login" : "gate"));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
