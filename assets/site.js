// Everything around the stock list: hero card, brand marquee, headliners, gear, showroom photos, the team and their posts,
// the install button and the service worker. Bike data comes from window.TRD (app.js).
(() => {
  const { ready, publicFeed, money, num, km, pickFeatured, img, reduceMotion, esc, waLink } = window.TRD;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const WA_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20.5 5.3 16A8.5 8.5 0 1 1 8.4 19l-4.4 1.5Z"/></svg>';
  const ARROW = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';

  // ---------- hero: "On the floor now" cycles through real bikes; tap it to open one ----------
  function startFloorCard(stock) {
    const card = $("[data-hx-floor]");
    const list = pickFeatured(stock, 6);
    if (!list.length) return;
    let i = 0;
    const paint = () => {
      const b = list[i % list.length];
      card.dataset.open = b.id;
      card.setAttribute("aria-label", `On the floor now: ${b.title}, ${money(b.price)}. Open it.`);
      $("[data-hx-model]").textContent = b.model;
      $("[data-hx-price]").textContent = money(b.price);
    };
    paint();
    card.hidden = false;
    if (reduceMotion.matches) return;
    setInterval(() => {
      if (document.hidden) return;
      card.classList.add("swap"); // text slides out, changes, slides back in
      setTimeout(() => { i++; paint(); card.classList.remove("swap"); }, 260);
    }, 4200);
  }

  // ---------- gear: the shop's six categories, shown as three tiles photographed in TRD's own gear shop ----------
  const GEAR = [
    ["helmets", "Helmets"],
    ["jackets", "Jackets"],
    ["gloves", "Gloves"],
    ["pants", "Pants"],
    ["boots", "Riding Shoes & Boots"],
    ["essentials", "Other Essentials"],
  ];
  const GEAR_TILES = [
    ["helmets", "Helmets", "3233", ["helmets"], "helmets"],
    ["kit", "Jackets, pants & gloves", "3205", ["jackets", "pants", "gloves"], "jackets, pants and gloves"],
    ["boots", "Boots, oils & essentials", "3225", ["boots", "essentials"], "boots, oils and essentials"],
  ];
  $("[data-gear]").innerHTML = GEAR_TILES.map(([key, label, photo, , ask]) => `
    <li class="gear-tile gear-${key}">
      <a href="${esc(waLink(`Hi TRD, what ${ask} do you have in stock? My size is: `))}" target="_blank" rel="noopener" data-gear-tile="${key}">
        <img src="assets/gallery/${photo}.webp" alt="" loading="lazy" decoding="async">
        <span class="gear-count" data-gear-count="${key}" hidden></span>
        <span class="gear-label">${esc(label)}${ARROW}</span>
      </a>
    </li>`).join("");

  // ---------- showroom photos (from trdmotorcycles.co.za/pages/gallery) ----------
  const SHOWROOM = [
    ["3257", "The TRD building at V-Max Square, Boksburg"],
    ["3109", "Rows of superbikes on the showroom floor"],
    ["3157", "The Kawasaki corner"],
    ["3225", "The parts and oils counter"],
    ["3205", "Riding gear and quads"],
    ["3189", "The floor from the mezzanine"],
    ["3101", "Sport bikes lined up under the roof"],
    ["3117", "Nakeds and tourers"],
    ["3125", "Adventure bikes by the stairs"],
    ["3129", "The back of the showroom"],
    ["3145", "Cruisers and customs"],
    ["3165", "Bikes ready for collection"],
    ["3177", "Looking out over the floor"],
    ["3197", "Rows of bikes from above"],
    ["3233", "Helmets on the wall"],
    ["3261", "The front of the dealership"],
    ["3265", "Kawasaki and the workshop entrance"],
  ];
  const BENTO = 8;
  $("[data-bento]").innerHTML = SHOWROOM.slice(0, BENTO).map(([n, alt], i) => `
    <li class="bento-${i}">
      <button type="button" data-shot="${i}" aria-label="Open photo: ${esc(alt)}">
        <img src="assets/gallery/${n}${i === 0 ? "" : "-sm"}.webp" alt="${esc(alt)}" loading="lazy" decoding="async">
        ${i === BENTO - 1 ? `<span class="bento-more">+${SHOWROOM.length - BENTO + 1} photos</span>` : ""}
      </button>
    </li>`).join("");

  const lb = $("[data-lightbox]");
  let shot = 0;
  function showShot(i) {
    shot = (i + SHOWROOM.length) % SHOWROOM.length;
    const [n, alt] = SHOWROOM[shot];
    const el = $("[data-lb-img]");
    el.src = `assets/gallery/${n}.webp`;
    el.alt = alt;
    $("[data-lb-count]").textContent = `${shot + 1} / ${SHOWROOM.length}`;
  }
  $("[data-bento]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-shot]");
    if (!b) return;
    showShot(Number(b.dataset.shot));
    lb.showModal();
  });
  $("[data-lb-prev]").addEventListener("click", () => showShot(shot - 1));
  $("[data-lb-next]").addEventListener("click", () => showShot(shot + 1));
  $("[data-lb-close]").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") showShot(shot - 1);
    if (e.key === "ArrowRight") showShot(shot + 1);
  });
  let lbX = null;
  lb.addEventListener("touchstart", (e) => (lbX = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (lbX == null) return;
    const dx = e.changedTouches[0].clientX - lbX;
    if (Math.abs(dx) > 40) showShot(shot + (dx < 0 ? 1 : -1));
    lbX = null;
  });

  // ---------- bikes ----------
  ready.then((bikes) => {
    const stock = bikes.filter((b) => !b.justIn);
    const makes = [...new Set(stock.map((b) => b.make).filter(Boolean))];

    // brand marquee: the list twice, so the loop is seamless; screen readers get it once, as plain text
    makes.sort();
    const row = makes.map((m) => `<span>${esc(m)}</span>`).join("");
    $("[data-marquee]").innerHTML = `<div>${row}</div><div>${row}</div>`;
    $("[data-marquee-sr]").textContent = `Brands on the floor: ${makes.join(", ")}.`;

    startFloorCard(stock);
    buildHeadliners(pickFeatured(stock, 3));
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) window.TRD.openBike(b.dataset.open);
  });

  // ---------- headliners: three standout bikes, each opens its detail sheet ----------
  function buildHeadliners(list) {
    if (!list.length) return;
    const stat = (value, label) => value ? `<li><b>${value}</b>${label}</li>` : "";
    $("[data-headliner-list]").innerHTML = list.map((b) => `
      <li class="headliner">
        <div class="headliner-photo">
          ${b.wasPrice ? '<span class="special-tag">On special</span>' : ""}
          ${img(b, 0, `alt="${esc(b.title)}" loading="lazy" decoding="async" width="668" height="445"`)}
        </div>
        <p class="headliner-make">${esc([b.year, b.makeLabel].filter(Boolean).join(" "))}</p>
        <h3><button type="button" data-open="${esc(b.id)}">${esc(b.model)}</button></h3>
        <ul class="headliner-stats">
          ${stat(b.power_kw && `${num(b.power_kw)} kW`, "Power")}
          ${stat(b.engine_cc && `${num(b.engine_cc)} cc`, "Engine")}
          ${stat(b.mileage_km != null && km(b.mileage_km), "On the clock")}
        </ul>
        <div class="headliner-buy">
          <p class="headliner-price">${money(b.price)}${b.wasPrice ? `<s>${money(b.wasPrice)}</s>` : ""}</p>
          <span class="btn btn-red btn-sm" aria-hidden="true">View bike ${ARROW}</span>
        </div>
      </li>`).join("");
    $("[data-headliners]").hidden = false;
  }

  // ---------- team + their posts ----------
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d < 7 ? `${d} d ago` : new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };
  const avatar = (u, cls = "avatar") => u.avatar ? `<img class="${cls}" src="${esc(u.avatar)}" alt="" loading="lazy">` : "";
  const waNumber = (phone) => {
    const d = String(phone || "").replace(/\D/g, "");
    return d.startsWith("0") ? "27" + d.slice(1) : d;
  };

  // the public only sees salespeople who have added a real photo; demo and test accounts never show
  const isReal = (u) => u.avatar && !/\b(demo|test)\b/i.test(`${u.name} ${u.bio || ""}`);

  publicFeed.then(({ team: everyone, posts }) => {
    const team = everyone.filter(isReal);
    if (team.length) {
      $("[data-team-wrap]").hidden = false;
      $$("[data-team-link]").forEach((a) => (a.hidden = false));
      $("[data-team]").innerHTML = team.map((u) => `
        <li class="member">
          ${avatar(u)}
          <h3>${esc(u.name)}</h3>
          <p class="member-title">${esc(u.title || "Sales")}</p>
          ${u.bio ? `<p class="member-bio">${esc(u.bio)}</p>` : ""}
          ${u.phone ? `<div class="member-ctas">
            <a class="btn btn-red btn-sm" href="https://wa.me/${waNumber(u.phone)}?text=${encodeURIComponent(`Hi ${u.name.split(" ")[0]}, I saw you on the TRD website.`)}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
            <a class="btn btn-glass btn-sm" href="tel:${esc(u.phone.replace(/\s/g, ""))}">Call</a>
          </div>` : ""}
        </li>`).join("");
    }
    buildGearShop(posts.filter((p) => p.kind === "gear"));
    const LABEL = { bike: "Just in", floor: "On the floor", handover: "Handover" };
    const floor = posts.filter((p) => p.kind !== "gear");
    if (floor.length >= 3) {
      $("[data-feed-wrap]").hidden = false;
      $("[data-feed]").innerHTML = floor.slice(0, 16).map((p) => `
        <li class="post">
          ${p.kind === "bike" ? `<button type="button" class="post-photo" data-open="p-${esc(p.id)}">` : '<div class="post-photo">'}
            <img src="${esc(p.photos[0])}" alt="${esc(p.title || p.caption || "Photo from the showroom")}" loading="lazy" decoding="async">
            <span class="post-kind kind-${p.kind}">${LABEL[p.kind]}</span>
            ${p.photos.length > 1 ? `<span class="post-count">${p.photos.length} photos</span>` : ""}
          ${p.kind === "bike" ? "</button>" : "</div>"}
          <div class="post-body">
            ${p.title ? `<p class="post-title">${esc(p.title)}${p.price ? ` <b>${money(p.price)}</b>` : ""}</p>` : ""}
            ${p.caption ? `<p class="post-caption">${esc(p.caption)}</p>` : ""}
            ${p.author && isReal(p.author) ? `<p class="post-by">${avatar(p.author, "avatar-xs")}${esc(p.author.name)} · ${ago(p.created)}</p>` : `<p class="post-by">${ago(p.created)}</p>`}
          </div>
        </li>`).join("");
    }
  });

  // ---------- gear the team posted: a rail under the mosaic, filtered by category ----------
  function buildGearShop(items) {
    if (!items.length) return;
    const NAMES = Object.fromEntries(GEAR.map(([key, label]) => [key, label.replace("Motorcycle ", "")]));
    const counts = {};
    items.forEach((g) => (counts[g.category] = (counts[g.category] || 0) + 1));
    $("[data-gear-shop]").hidden = false;
    // the tiles show how many are in, and jump to them instead of WhatsApp
    const tileCats = Object.fromEntries(GEAR_TILES.map(([key, , , cats]) => [key, cats.filter((c) => counts[c])]));
    $$("[data-gear-count]").forEach((el) => {
      const n = tileCats[el.dataset.gearCount].reduce((sum, c) => sum + counts[c], 0);
      el.hidden = !n;
      el.textContent = n ? `${n} in stock` : "";
    });
    const chip = (key, label, n, on) => `<label class="chip"><input type="radio" name="gearcat" value="${key}"${on ? " checked" : ""}><span>${esc(label)} <small>${n}</small></span></label>`;
    $("[data-gear-chips]").innerHTML = chip("", "All", items.length, true) +
      GEAR.map(([key]) => key).filter((k) => counts[k]).map((k) => chip(k, NAMES[k], counts[k])).join("");
    const paint = (cat) => {
      $("[data-gear-rail]").innerHTML = items.filter((g) => !cat || g.category === cat).map((g) => `
        <li class="post gear-item">
          <div class="post-photo">
            <img src="${esc(g.photos[0])}" alt="${esc(g.title)}" loading="lazy" decoding="async">
            <span class="post-kind kind-gear">${esc(NAMES[g.category] || "Gear")}</span>
          </div>
          <div class="post-body">
            ${g.brand ? `<p class="gear-brand">${esc(g.brand)}</p>` : ""}
            <p class="post-title">${esc(g.title)}</p>
            <p class="gear-price">${g.price ? money(g.price) : "Ask for price"}${g.sizes ? `<span>Sizes ${esc(g.sizes)}</span>` : ""}</p>
            ${g.caption ? `<p class="post-caption">${esc(g.caption)}</p>` : ""}
            <a class="btn btn-red btn-sm gear-wa" href="${esc(waLink(`Hi TRD, is the ${g.title}${g.price ? ` (${money(g.price)})` : ""} still in stock? My size is: `))}" target="_blank" rel="noopener">${WA_ICON}Reserve on WhatsApp</a>
          </div>
        </li>`).join("");
      $("[data-gear-rail]").scrollLeft = 0;
    };
    paint("");
    $("[data-gear-chips]").addEventListener("change", (e) => paint(e.target.value));
    $("[data-gear]").addEventListener("click", (e) => {
      const a = e.target.closest("[data-gear-tile]");
      const cats = a ? tileCats[a.dataset.gearTile] : [];
      if (!cats.length) return; // nothing posted for this tile yet: let WhatsApp open
      e.preventDefault();
      const cat = cats.length === 1 ? cats[0] : ""; // one category: filter to it, several: show all
      $(`[data-gear-chips] input[value="${cat}"]`).checked = true;
      paint(cat);
      $("[data-gear-shop]").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    });
  }

  // ---------- install ----------
  const installBtn = $("[data-install]");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  addEventListener("appinstalled", () => { $("[data-install-label]").textContent = "Installed"; installBtn.disabled = true; });
  if (standalone) $("#app").hidden = true;
  installBtn.addEventListener("click", () => window.TRDInstall());

  // ---------- cookies: essential only, unless the visitor allows Google Maps ----------
  const COOKIE_KEY = "trd-cookies";
  const banner = $("[data-cookies]");
  const mapFrame = $("[data-map]");
  const readChoice = () => { try { return JSON.parse(localStorage.getItem(COOKIE_KEY)); } catch { return null; } };
  function loadMap() {
    if (!mapFrame.src) mapFrame.src = mapFrame.dataset.src;
    mapFrame.hidden = false;
    $("[data-map-gate]").hidden = true;
  }
  function applyChoice(choice) {
    if (choice?.maps) loadMap();
  }
  function saveChoice(maps) {
    const choice = { maps, at: new Date().toISOString() };
    try { localStorage.setItem(COOKIE_KEY, JSON.stringify(choice)); } catch { /* private mode: ask again next visit */ }
    applyChoice(choice);
    closeBanner();
  }
  function openBanner(withPrefs = false) {
    banner.hidden = false;
    $("[data-cookie-maps]").checked = !!readChoice()?.maps;
    showPrefs(withPrefs);
  }
  function closeBanner() { banner.hidden = true; }
  function showPrefs(on) {
    $("[data-cookie-prefs]").hidden = !on;
    $("[data-cookie-settings]").hidden = on;
    $("[data-cookie-choice=save]").hidden = !on;
  }
  banner.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cookie-choice]");
    if (b) saveChoice(b.dataset.cookieChoice === "accept" || (b.dataset.cookieChoice === "save" && $("[data-cookie-maps]").checked));
    if (e.target.closest("[data-cookie-settings]")) showPrefs(true);
  });
  $("[data-cookie-open]").addEventListener("click", () => openBanner(true));
  $("[data-map-load]").addEventListener("click", () => saveChoice(true));
  const choice = readChoice();
  if (choice) applyChoice(choice);
  else setTimeout(() => openBanner(false), 900); // after the hero has painted

  // ---------- nav: highlight the section you're in ----------
  // Home is the hero (#top is the whole page); a section crossing the middle of the screen lights its link
  const spyPairs = $$(".nav-pill a")
    .map((a) => [a, a.getAttribute("href") === "#top" ? $(".hero") : $(a.getAttribute("href"))])
    .filter(([, el]) => el);
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      spyPairs.forEach(([a, el]) => a.toggleAttribute("aria-current", el === e.target));
    }), { rootMargin: "-45% 0px -50% 0px" });
    spyPairs.forEach(([, el]) => spy.observe(el));
  }

  // ---------- reveal on scroll ----------
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    $$(".head").forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }

  // ---------- offline ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
