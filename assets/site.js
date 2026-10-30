// Everything around the stock list: hero fan, brand marquee, spotlight, gear, showroom photos, the team and their posts,
// the install button and the service worker. Bike data comes from window.TRD (app.js).
(() => {
  const { ready, publicFeed, money, num, km, pickFeatured, img, cut, accentOf, reduceMotion, esc, waLink } = window.TRD;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const WA_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20.5 5.3 16A8.5 8.5 0 1 1 8.4 19l-4.4 1.5Z"/></svg>';
  const ARROW = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';

  // ---------- hero video: loops forever ----------
  // Phones get the portrait cut for the tall panel, bigger screens the wide one.
  // Reduced-motion visitors keep the still poster.
  const video = $("[data-hero-video]");
  if (!reduceMotion.matches) {
    const phone = matchMedia("(max-width: 860px)").matches;
    video.innerHTML = (phone ? [[video.dataset.srcMobile, "video/mp4"]] : [[video.dataset.srcWebm, "video/webm"], [video.dataset.srcMp4, "video/mp4"]])
      .map(([src, type]) => `<source src="${src}" type="${type}">`).join("");
    video.load();
    const play = () => video.play().catch(() => {});
    play();
    // keep it going: restart if the loop ever stops, when the tab comes back, and on the first tap
    // (iOS Low Power Mode blocks autoplay until the visitor touches the page)
    video.addEventListener("ended", () => { video.currentTime = 0; play(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) play(); });
    addEventListener("pointerdown", play, { once: true, passive: true });
  }

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

  // ---------- gear: same six categories (and photos) as the TRD shop ----------
  const GEAR = [
    ["gloves", "Motorcycle Gloves", "motorcycle-gloves"],
    ["helmets", "Motorcycle Helmets", "motorcycle-helmets"],
    ["jackets", "Motorcycle Jackets", "motorcycle-jackets"],
    ["pants", "Motorcycle Pants", "motorcycle-pants"],
    ["essentials", "Other Essentials", "other-essentials"],
    ["boots", "Riding Shoes & Boots", "riding-shoes-boots"],
  ];
  $("[data-gear]").innerHTML = GEAR.map(([key, label]) => `
    <li class="gear-tile gear-${key}">
      <a href="${esc(waLink(`Hi TRD, what ${label.replace("Motorcycle ", "").toLowerCase()} do you have in stock? My size is: `))}" target="_blank" rel="noopener" data-gear-cat="${key}">
        <img src="assets/gear/${key}.webp" alt="" loading="lazy" decoding="async">
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

    // brand marquee: the list twice, so the loop is seamless
    const row = makes.sort().map((m) => `<span>${esc(m)}</span>`).join("");
    $("[data-marquee]").innerHTML = `<div>${row}</div><div aria-hidden="true">${row}</div>`;

    // spotlight first; the phone mockup in the app section shows the next three
    startFloorCard(stock);
    const spot = pickFeatured(stock, 4);
    buildSpotlight(spot);
    $("[data-phone-cards]").innerHTML = pickFeatured(stock, 3, new Set(spot.map((b) => b.id))).map((b) => `
      <div class="phone-card">${img(b, 0, 'alt="" loading="lazy"')}<p><b>${esc(b.model)}</b>${money(b.price)}</p></div>`).join("");
    startPhoneNotes(stock);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) window.TRD.openBike(b.dataset.open);
  });

  // ---------- the hand-held phone: a live clock, and real stock dropping in as notifications ----------
  const clock = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg" });
  const tickClock = () => { const el = $("[data-hp-time]"); if (el) el.textContent = clock.format(new Date()); };
  tickClock();
  setInterval(tickClock, 15000);

  function startPhoneNotes(stock) {
    const phone = $("[data-hand-phone]");
    const note = $("[data-hp-note]");
    if (!phone || !note) return;
    const specials = stock.filter((b) => b.wasPrice && b.price)
      .map((b) => ["On special at TRD", `${b.title}, now ${money(b.price)}`]);
    const floor = pickFeatured(stock, 6).map((b) => ["On the floor at TRD", `${b.title} · ${money(b.price)}`]);
    const pool = [...specials, ...floor];
    if (!pool.length) return;
    let i = 0;
    let timer = 0;
    let inView = false;
    const show = () => {
      const [title, text] = pool[i++ % pool.length];
      $("[data-hp-note-title]").textContent = title;
      $("[data-hp-note-text]").textContent = text;
      note.classList.add("show");
      timer = setTimeout(() => {
        note.classList.remove("show");
        timer = setTimeout(show, 700); // let it slide away before the next one drops in
      }, 3000);
    };
    const run = () => {
      clearTimeout(timer);
      note.classList.remove("show");
      if (inView && !document.hidden) timer = setTimeout(show, 900);
    };
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; run(); }, { rootMargin: "0px 0px -15% 0px" }).observe(phone);
    document.addEventListener("visibilitychange", run);
  }

  // ---------- spotlight: sticky stage, one bike per quarter of the scroll ----------
  function buildSpotlight(list) {
    const section = $("[data-spotlight]");
    if (!list.length) { section.hidden = true; return; }
    section.style.setProperty("--count", list.length);
    $("[data-spot-bikes]").innerHTML = list.map((b, i) => `
      <figure class="spot-bike" data-i="${i}" style="--accent:${accentOf(b)}">
        ${cut(b, `alt="${esc(b.title)}" loading="lazy" decoding="async"`)}
      </figure>`).join("");
    $("[data-spot-dots]").innerHTML = list.map(() => "<li></li>").join("");
    const info = $("[data-spot-info]");
    const stat = (value, unit, label) => value ? `<div class="spot-stat"><dt>${label}</dt><dd>${value}<small>${unit}</small></dd></div>` : "";

    let active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      const b = list[i];
      section.style.setProperty("--accent", accentOf(b));
      $$(".spot-bike", section).forEach((el, n) => el.classList.toggle("on", n === i));
      $$("[data-spot-dots] li", section).forEach((el, n) => el.classList.toggle("on", n === i));
      info.innerHTML = `
        <p class="spot-make">${esc([b.year, b.makeLabel].filter(Boolean).join(" "))}</p>
        <h3>${esc(b.model)}</h3>
        <dl class="spot-stats">
          ${stat(b.power_kw && num(b.power_kw), "kW", "Power")}
          ${stat(b.torque_nm && num(b.torque_nm), "Nm", "Torque")}
          ${stat(b.engine_cc && num(b.engine_cc), "cc", "Engine")}
          ${stat(b.mileage_km != null && num(b.mileage_km), "km", "On the clock")}
        </dl>
        <div class="spot-buy">
          <p class="spot-price">${money(b.price)}${b.monthly_installment ? `<small>or about ${money(b.monthly_installment)} pm</small>` : ""}</p>
          <button class="btn btn-red" type="button" data-open="${esc(b.id)}">See this bike ${ARROW}</button>
        </div>`;
    }
    setActive(0);
    let tick = 0;
    const onScroll = () => {
      tick = 0;
      const r = section.getBoundingClientRect();
      const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      setActive(Math.floor(p * list.length));
    };
    addEventListener("scroll", () => { if (!tick) tick = requestAnimationFrame(onScroll); }, { passive: true });
    onScroll();
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
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatar = (u, cls = "avatar") => u.avatar
    ? `<img class="${cls}" src="${esc(u.avatar)}" alt="" loading="lazy">`
    : `<span class="${cls} avatar-blank" aria-hidden="true">${esc(initials(u.name || "TRD"))}</span>`;
  const waNumber = (phone) => {
    const d = String(phone || "").replace(/\D/g, "");
    return d.startsWith("0") ? "27" + d.slice(1) : d;
  };

  publicFeed.then(({ team, posts }) => {
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
    if (floor.length) {
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
            ${p.author ? `<p class="post-by">${avatar(p.author, "avatar-xs")}${esc(p.author.name)} · ${ago(p.created)}</p>` : ""}
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
    // the mosaic tiles show how many are in, and jump to them instead of WhatsApp
    $$("[data-gear-count]").forEach((el) => {
      const n = counts[el.dataset.gearCount];
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
      const a = e.target.closest("[data-gear-cat]");
      if (!a || !counts[a.dataset.gearCat]) return; // nothing posted in this category yet: let WhatsApp open
      e.preventDefault();
      const radio = $(`[data-gear-chips] input[value="${a.dataset.gearCat}"]`);
      radio.checked = true;
      paint(a.dataset.gearCat);
      $("[data-gear-shop]").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    });
  }

  // ---------- install ----------
  const installBtn = $("[data-install]");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  addEventListener("appinstalled", () => { $("[data-install-label]").textContent = "Installed"; installBtn.disabled = true; });
  if (standalone) { $("[data-install-label]").textContent = "You're in the app"; installBtn.disabled = true; }
  installBtn.addEventListener("click", () => window.TRDInstall());
  // the header's "Get the app" does the same as ClassroomX's Download button
  $(".nav-app").addEventListener("click", (e) => { if (!standalone) { e.preventDefault(); window.TRDInstall(); } });

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

  // ---------- floating WhatsApp: shows once the hero's buttons have scrolled away ----------
  const fab = $("[data-wa-fab]");
  const heroCtas = $(".hero-ctas");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => fab.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(heroCtas);
  }

  // ---------- reveal on scroll ----------
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -12% 0px" });
    $$(".head, .gear-tile, .photo-bento li, .offer, .app-card, .visit-info, .sell").forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }

  // ---------- offline ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
