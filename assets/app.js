// Hero video, nav, stock list, filters, riding styles and bike detail. Data comes from data/stock.json (see scraper/).
(() => {
  const WHATSAPP = "27642970282";
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const STYLES = [
    ["Adventure", /adventure|dual[- ]sport|v-strom|multistrada|\bgs\b|tiger|africa twin|tenere|pan america/i],
    ["Sport", /super ?sport|superbike|sport ?bike|track|\brr\b|ninja|zx|gsx-?r|cbr|r1\b|r6\b|panigale|hayabusa|1300r/i],
    ["Naked", /naked|streetfighter|duke|street triple|speed triple|monster|\bz\d{3}/i],
    ["Touring", /tour/i],
    ["Cruiser", /cruiser|harley|diavel|night rod|fat bob|vzr|boulevard|softail|bobber/i],
    ["Off-road", /enduro|motocross|off-road|atv|quad|dirt/i],
  ];
  const BLURBS = {
    Adventure: "Long-travel tourers for gravel, passes and the long way home.",
    Sport: "Superbikes and sport bikes for track days and early Sunday runs.",
    Naked: "Upright, light and quick. The everyday bike that still thrills.",
    Touring: "Big screens, cases and comfort for two-up trips.",
    Cruiser: "Low seats, big twins and plenty of chrome.",
    "Off-road": "Enduro and dirt bikes for the trails.",
    Other: "Everything else on the floor.",
  };

  // Accent per bike, picked from its paint or finish in the photos. Red is kept for the redline, yellow for buttons.
  const PAINT = {
    459683: "#ff8a3d", // Pan America 1250: Harley orange tank badge
    459655: "#8e8cff", // R 1250 RT: sapphire metallic
    474114: "#d3d9e0", // GSX 1300R: sword-silver graphics
    489254: "#8fa6bd", // Diavel 1200: gunmetal
    459648: "#d99a62", // Rocket 3 GT: bronze headers
    459729: "#3d7dff", // CRF 1100 A: tricolour blue
  };
  const COLOUR_ACCENTS = [
    [/blue/i, "#5b8cff"], [/white|pearl/i, "#e8eef6"], [/green|lime/i, "#62d68f"], [/orange/i, "#ff8a3d"],
    [/red/i, "#ff8f6b"], [/yellow/i, "#d8c98c"], [/grey|gray|silver/i, "#b7c1cc"], [/black/i, "#c9d1da"],
  ];
  const accentOf = (b) => PAINT[b.id] || (COLOUR_ACCENTS.find(([re]) => re.test(b.colour || "")) || [0, "#c9d1da"])[1];

  const money = (n) => "R" + Math.round(n).toLocaleString("en-US");
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const km = (n) => num(n) + " km";
  const waLink = (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
  const askAbout = (b) => `Hi TRD, I'm interested in the ${b.title} (stock no. ${b.stock_no})${b.price ? ` for ${money(b.price)}` : ""}.`;

  function styleOf(bike) {
    // the first sentence of the description says what kind of bike it is
    const text = `${bike.model} ${(bike.description || "").slice(0, 260)}`;
    const hit = STYLES.find(([, re]) => re.test(text));
    return hit ? hit[0] : "Other";
  }

  function normalise(raw, useLocal) {
    const make = raw.make === "Multiple Motorcycle Manufacturers" ? "" : raw.make || "";
    let model = (raw.model || "").trim();
    if (make && model.toLowerCase().startsWith(make.toLowerCase() + " ")) model = model.slice(make.length + 1);
    const price = raw.price || 0;
    const special = raw.on_special ? raw.cash_price_incl_vat : null;
    const local = (raw.images || []).map((p) => "data/" + p);
    const remote = raw.image_urls || [];
    return {
      ...raw,
      make,
      model,
      makeLabel: make || "Other brands",
      title: [raw.year, make, model].filter(Boolean).join(" "),
      price: special || price,
      wasPrice: special ? price : null,
      images: useLocal && local.length ? local : remote,
      fallbacks: remote,
      cutout: `assets/bikes/${raw.id}.webp`,
      style: styleOf(raw),
    };
  }

  // Photos live in data/images when the scraper has run; otherwise (e.g. on GitHub) use the dealer's image host.
  // data-fb holds the next sources to try, space-separated; a cut-out that's missing falls back to its photo.
  const img = (b, i, attrs = "") => {
    const src = b.images[i];
    if (!src) return "";
    const fb = b.fallbacks[i] && b.fallbacks[i] !== src ? ` data-fb="${esc(b.fallbacks[i])}"` : "";
    return `<img src="${esc(src)}"${fb} ${attrs}>`;
  };
  const cut = (b, attrs = "") =>
    `<img src="${esc(b.cutout)}" data-fb="${esc([b.images[0], b.fallbacks[0]].filter((s, n, a) => s && a.indexOf(s) === n).join(" "))}" data-cut ${attrs}>`;
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName !== "IMG" || !t.dataset.fb) return;
    const [next, ...rest] = t.dataset.fb.split(" ");
    t.dataset.fb = rest.join(" ");
    if (t.hasAttribute("data-cut")) t.classList.add("is-photo");
    t.src = next;
  }, true);

  // ---------- data ----------
  const ready = fetch("data/stock.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(async (rows) => {
      const probe = rows.find((r) => r.images && r.images.length);
      const useLocal = probe ? await fetch("data/" + probe.images[0], { method: "HEAD" }).then((r) => r.ok, () => false) : false;
      return rows.map((r) => normalise(r, useLocal));
    });

  // specials first, then the priciest bike from each make, skipping makes already used
  function pickFeatured(bikes, count, skip = new Set()) {
    const ranked = bikes.filter((b) => b.images.length && b.price && !skip.has(b.id))
      .sort((a, b) => (!!b.wasPrice - !!a.wasPrice) || b.price - a.price);
    const seen = new Set();
    const out = [];
    for (const b of ranked) {
      if (out.length === count) break;
      if (seen.has(b.makeLabel) || b.makeLabel === "Other brands") continue;
      seen.add(b.makeLabel);
      out.push(b);
    }
    return out;
  }

  window.TRD = { ready, openBike: (id) => openBike(id), money, num, km, pickFeatured, img, cut, accentOf, reduceMotion, esc };

  // ---------- hero video ----------
  // Sources are attached here rather than in the HTML, so nothing downloads for reduced-motion or Save-Data visitors.
  const hero = $("[data-hero]");
  const video = $("[data-hero-video]");
  const saveData = navigator.connection && navigator.connection.saveData;
  if (!reduceMotion.matches && !saveData) {
    const phone = matchMedia("(max-width: 700px)").matches;
    const sources = phone ? [[video.dataset.srcMobile, "video/mp4"]] : [[video.dataset.srcWebm, "video/webm"], [video.dataset.srcMp4, "video/mp4"]];
    video.innerHTML = sources.map(([src, type]) => `<source src="${src}" type="${type}">`).join("");
    video.preload = "auto";
    video.load();
    // play the video and keep it looping
    video.play().catch(() => {});
  }

  // ---------- nav + hero hand-off ----------
  const nav = $("[data-nav]");
  const menuBtn = $("[data-menu]");
  const menu = $("[data-menu-panel]");
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open);
    document.documentElement.classList.toggle("menu-open", open);
    if (open) menu.querySelector("a").focus();
  };
  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  // the nav bar goes dark while it sits over the hero footage
  const night = $("[data-rr]");
  let tick = 0;
  function onScroll() {
    tick = 0;
    const p = Math.min(1, scrollY / Math.max(1, hero.offsetHeight));
    hero.style.setProperty("--p", reduceMotion.matches ? 0 : p.toFixed(4));
    nav.classList.toggle("scrolled", scrollY > 40);
    nav.classList.toggle("on-dark", hero.getBoundingClientRect().bottom > nav.offsetHeight / 2);
  }
  addEventListener("scroll", () => { if (!tick) tick = requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();

  // ---------- grid + filters ----------
  const grid = $("[data-grid]");
  const form = $("[data-filters]");
  const countEl = $("[data-count]");
  const emptyEl = $("[data-empty]");
  let bikes = [];

  function buildFilters() {
    const styleCounts = {};
    bikes.forEach((b) => (styleCounts[b.style] = (styleCounts[b.style] || 0) + 1));
    const chip = (value, label, n, checked) => `
      <label class="chip"><input type="radio" name="style" value="${value}" ${checked ? "checked" : ""}>
      <span>${label} <small>${n}</small></span></label>`;
    $("[data-styles]").insertAdjacentHTML("beforeend",
      chip("", "All bikes", bikes.length, true) +
      [...STYLES.map(([s]) => s), "Other"].filter((s) => styleCounts[s]).map((s) => chip(s, s, styleCounts[s])).join(""));

    const makes = {};
    bikes.forEach((b) => (makes[b.makeLabel] = (makes[b.makeLabel] || 0) + 1));
    $("[data-make]").insertAdjacentHTML("beforeend",
      Object.keys(makes).sort((a, b) => (a === "Other brands") - (b === "Other brands") || a.localeCompare(b))
        .map((m) => `<option value="${esc(m)}">${esc(m)} (${makes[m]})</option>`).join(""));
  }

  function card(b) {
    return `
      <li class="bike">
        <div class="bike-photo">
          ${b.wasPrice ? '<span class="special-tag">On special</span>' : ""}
          ${img(b, 0, `alt="${esc(b.title)}" loading="lazy" decoding="async" width="668" height="501"`)}
        </div>
        <p class="bike-make">${esc([b.year, b.makeLabel].filter(Boolean).join(" "))}</p>
        <h3 class="bike-title"><button type="button" data-id="${esc(b.id)}">${esc(b.model || b.title)}</button></h3>
        <dl class="bike-nums">
          <div><dt class="sr">Price</dt><dd class="bike-price">${b.price ? money(b.price) : "Ask for price"}${b.wasPrice ? ` <s>${money(b.wasPrice)}</s>` : ""}</dd></div>
          ${b.mileage_km != null ? `<div><dt class="sr">Mileage</dt><dd>${km(b.mileage_km)}</dd></div>` : ""}
        </dl>
        ${b.monthly_installment ? `<p class="bike-pm">or about ${money(b.monthly_installment)} a month</p>` : ""}
        <a class="btn btn-wa" href="${esc(waLink(askAbout(b)))}" target="_blank" rel="noopener">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20.5 5.3 16A8.5 8.5 0 1 1 8.4 19l-4.4 1.5Z"/></svg>
          WhatsApp about this bike<span class="sr">: ${esc(b.title)}</span>
        </a>
      </li>`;
  }

  const sorters = {
    featured: (a, b) => (!!b.wasPrice - !!a.wasPrice) || b.price - a.price,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    "year-desc": (a, b) => (b.year || 0) - (a.year || 0) || a.price - b.price,
    "km-asc": (a, b) => (a.mileage_km ?? 1e9) - (b.mileage_km ?? 1e9),
  };

  function render() {
    const f = new FormData(form);
    const q = (f.get("q") || "").trim().toLowerCase();
    const style = f.get("style") || "";
    const make = f.get("make") || "";
    const max = Number(f.get("price")) || Infinity;
    const list = bikes
      .filter((b) => !q || `${b.title} ${b.style} ${b.colour || ""}`.toLowerCase().includes(q))
      .filter((b) => !style || b.style === style)
      .filter((b) => !make || b.makeLabel === make)
      .filter((b) => b.price <= max)
      .sort(sorters[f.get("sort")] || sorters.featured);

    grid.innerHTML = list.map(card).join("");
    emptyEl.hidden = list.length > 0;
    countEl.textContent = list.length === bikes.length
      ? `${bikes.length} pre-owned bikes, all at our Boksburg showroom. Tap a bike's name for every photo and the full spec sheet.`
      : `Showing ${list.length} of ${bikes.length} bikes.`;
  }

  function showStock(set) {
    form.reset();
    set();
    render();
    $("#stock").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
  }

  form.addEventListener("input", render);
  $("[data-clear]").addEventListener("click", () => { form.reset(); render(); });
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openBike(btn.dataset.id);
  });

  // ---------- riding styles ----------
  function buildStyles() {
    const groups = {};
    bikes.forEach((b) => (groups[b.style] = groups[b.style] || []).push(b));
    const order = STYLES.map(([s]) => s).filter((s) => groups[s] && groups[s].length >= 2)
      .sort((a, b) => groups[b].length - groups[a].length);
    const lowest = (list) => money(Math.min(...list.map((b) => b.price).filter(Boolean)));
    const cover = (list) => [...list].filter((b) => b.images.length).sort((a, b) => b.price - a.price)[0];
    const row = (value, name, list, blurb, b) => `
      <li>
        <button class="style-row" type="button" data-style-pick="${esc(value)}"${b ? ` style="--accent:${accentOf(b)}"` : ""}>
          <span class="style-name">${esc(name)}</span>
          <span class="style-meta"><strong>${list.length} bikes from ${lowest(list)}</strong>${esc(blurb)}</span>
          ${b ? cut(b, 'class="style-bike" alt="" loading="lazy" decoding="async" width="576" height="391"') : ""}
        </button>
      </li>`;
    $("[data-styles-list]").innerHTML =
      order.map((s) => row(s, s, groups[s], BLURBS[s], cover(groups[s]))).join("") +
      row("", "Everything", bikes, "Every bike on the floor, with specials first.", null);
    $("[data-styles-list]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-style-pick]");
      if (!btn) return;
      pickStyle(btn.dataset.stylePick);
    });
  }

  // ---------- detail ----------
  const dialog = $("[data-detail]");
  const galleryImg = $("[data-gallery-img]");
  const thumbs = $("[data-thumbs]");
  const toastEl = $("[data-toast]");
  let current = null;
  let photo = 0;
  let toastTimer = 0;

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function descriptionHtml(text) {
    if (!text) return "";
    const [intro, ...points] = esc(text).split("•").map((s) => s.trim()).filter(Boolean);
    return `<p>${intro}</p>${points.length ? `<ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}`;
  }

  function showPhoto(i) {
    const imgs = current.images;
    if (!imgs.length) return;
    photo = (i + imgs.length) % imgs.length;
    galleryImg.dataset.fb = current.fallbacks[photo] || "";
    galleryImg.src = imgs[photo];
    galleryImg.alt = `${current.title}, photo ${photo + 1}`;
    $("[data-gallery-count]").textContent = `${photo + 1} / ${imgs.length}`;
    thumbs.querySelectorAll("button").forEach((t, n) => {
      t.setAttribute("aria-current", n === photo);
      if (n === photo) t.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function similarTo(b) {
    return bikes.filter((x) => x.id !== b.id && x.style === b.style && x.images.length && x.price)
      .sort((x, y) => Math.abs(x.price - b.price) - Math.abs(y.price - b.price))
      .slice(0, 3);
  }

  function openBike(id) {
    const b = bikes.find((x) => String(x.id) === String(id));
    if (!b) return;
    current = b;
    dialog.style.setProperty("--accent", accentOf(b));
    $("[data-detail-style]").textContent = b.style;
    $("[data-detail-flag]").hidden = !b.wasPrice;
    $("[data-detail-make]").textContent = [b.year, b.makeLabel].filter(Boolean).join(" ");
    $("[data-detail-title]").textContent = b.model || b.title;
    $("[data-detail-price]").innerHTML = (b.price ? money(b.price) : "Ask for price") + (b.wasPrice ? `<s>${money(b.wasPrice)}</s>` : "");
    $("[data-detail-monthly]").textContent = b.monthly_installment
      ? `About ${money(b.monthly_installment)} a month on finance, subject to approval`
      : "";
    $("[data-wa]").href = waLink(askAbout(b));

    const specs = [
      ["Year", b.year],
      ["Mileage", b.mileage_km != null && km(b.mileage_km)],
      ["Engine", b.engine_cc && `${num(b.engine_cc)} cc`],
      ["Power", b.power_kw && `${b.power_kw} kW`],
      ["Torque", b.torque_nm && `${b.torque_nm} Nm`],
      ["Gears", b.gears],
      ["Colour", b.colour],
      ["Stock no.", b.stock_no],
    ].filter(([, v]) => v);
    $("[data-specs]").innerHTML = specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    $("[data-desc]").innerHTML = descriptionHtml(b.description);

    const similar = similarTo(b);
    $("[data-similar-wrap]").hidden = !similar.length;
    $("[data-similar]").innerHTML = similar.map((s) => `
      <li><button type="button" data-similar-id="${esc(s.id)}">
        ${img(s, 0, 'alt="" loading="lazy" width="668" height="501"')}
        <strong>${esc(s.title)}</strong><span>${money(s.price)}</span>
      </button></li>`).join("");

    thumbs.innerHTML = b.images
      .map((src, n) => `<button type="button" data-photo="${n}" aria-label="Photo ${n + 1}">${img(b, n, 'alt="" loading="lazy"')}</button>`)
      .join("");
    showPhoto(0);

    dialog.classList.remove("is-closing");
    if (!dialog.open) { dialog.showModal(); dialog.focus(); }
    $("[data-detail-body]").scrollTop = 0;
    $(".detail-info").scrollTop = 0;
    history.replaceState(null, "", `#bike-${b.id}`);
  }

  function closeDetail() {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    if (reduceMotion.matches) return dialog.close();
    dialog.classList.add("is-closing");
    setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 230);
  }

  thumbs.addEventListener("click", (e) => {
    const t = e.target.closest("[data-photo]");
    if (t) showPhoto(Number(t.dataset.photo));
  });
  $("[data-similar]").addEventListener("click", (e) => {
    const t = e.target.closest("[data-similar-id]");
    if (t) openBike(t.dataset.similarId);
  });
  $("[data-prev]").addEventListener("click", () => showPhoto(photo - 1));
  $("[data-next]").addEventListener("click", () => showPhoto(photo + 1));
  $("[data-close]").addEventListener("click", closeDetail);
  $("[data-share]").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: current.title, text: `${current.title} for ${money(current.price)} at TRD Motorcycles`, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied"); }
    } catch { /* share sheet dismissed */ }
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) closeDetail(); });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") showPhoto(photo - 1);
    if (e.key === "ArrowRight") showPhoto(photo + 1);
  });
  dialog.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));

  // swipe through photos on touch screens
  let touchX = null;
  galleryImg.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  galleryImg.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showPhoto(photo + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  $("[data-year]").textContent = new Date().getFullYear();

  // ---------- hero search and style shortcuts ----------
  const pickStyle = (style) => showStock(() => {
    const radio = form.querySelector(`input[name="style"][value="${CSS.escape(style)}"]`);
    if (radio) radio.checked = true;
  });
  $("[data-hero-search]").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    showStock(() => (form.q.value = q));
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hero-style]");
    if (btn) pickStyle(btn.dataset.heroStyle);
  });

  // ---------- 3D bike section: live price, mileage and finance for the bike it shows ----------
  function showcaseBike() {
    if (!night) return;
    const b = bikes.find((x) => x.id === night.dataset.rrBike);
    const open = $("[data-rr-open]");
    if (!b) {
      // sold: keep the showcase, point it at the rest of the floor
      document.querySelectorAll("[data-rr-price]").forEach((el) => (el.textContent = "Sold"));
      open.textContent = "See what's on the floor →";
      open.addEventListener("click", () => $("#stock").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" }));
      return;
    }
    document.querySelectorAll("[data-rr-price]").forEach((el) => (el.textContent = b.price ? money(b.price) : "Ask us"));
    if (b.mileage_km != null) document.querySelectorAll("[data-rr-km]").forEach((el) => (el.textContent = km(b.mileage_km)));
    if (b.monthly_installment) night.querySelectorAll("[data-rr-monthly]").forEach((el) => (el.textContent = money(b.monthly_installment)));
    $("[data-rr-wa]").href = waLink(askAbout(b));
    open.addEventListener("click", () => openBike(b.id));
  }

  ready
    .then((rows) => {
      bikes = rows;
      buildFilters();
      buildStyles();
      render();
      const monthly = bikes.map((b) => b.monthly_installment).filter(Boolean);
      if (monthly.length) $("[data-min-monthly]").textContent = money(Math.min(...monthly));
      $("[data-hero-count]").textContent = bikes.length;
      showcaseBike();
      const m = location.hash.match(/^#bike-(.+)$/);
      if (m) openBike(m[1]);
    })
    .catch(() => {
      countEl.textContent = "The stock list didn't load. Refresh the page, or WhatsApp us on 064 297 0282 to ask what's available.";
    });
})();
