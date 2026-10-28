// Stock list, filters, hero fan, riding styles and bike detail. Data comes from data/stock.json (see scraper/).
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
  const STYLE_INFO = {
    Adventure: { tint: "var(--adventure)", blurb: "Long-travel tourers for gravel, passes and the long way home." },
    Sport: { tint: "var(--sport)", blurb: "Superbikes and sport bikes for track days and early Sunday runs." },
    Naked: { tint: "var(--naked)", blurb: "Upright, light and quick. The everyday bike that still thrills." },
    Touring: { tint: "var(--touring)", blurb: "Big screens, cases and comfort for two-up trips." },
    Cruiser: { tint: "var(--cruiser)", blurb: "Low seats, big twins and plenty of chrome." },
    "Off-road": { tint: "var(--offroad)", blurb: "Enduro and dirt bikes for the trails." },
    Other: { tint: "var(--other)", blurb: "Everything else on the floor." },
  };
  const tintOf = (style) => (STYLE_INFO[style] || STYLE_INFO.Other).tint;

  const money = (n) => "R" + Math.round(n).toLocaleString("en-US");
  const km = (n) => n.toLocaleString("en-US") + " km";

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
      style: styleOf(raw),
    };
  }

  // Photos live in data/images when the scraper has run; otherwise (e.g. on GitHub) use the dealer's image host.
  // Any single photo that still fails swaps to its remote copy.
  const img = (b, i, attrs = "") => {
    const src = b.images[i];
    if (!src) return "";
    const fb = b.fallbacks[i] && b.fallbacks[i] !== src ? ` data-fb="${esc(b.fallbacks[i])}"` : "";
    return `<img src="${esc(src)}"${fb} ${attrs}>`;
  };
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && t.dataset.fb && t.getAttribute("src") !== t.dataset.fb) t.src = t.dataset.fb;
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

  window.TRD = { ready, openBike: (id) => openBike(id), money, km, pickFeatured, img, reduceMotion };

  // ---------- nav ----------
  const nav = $("[data-nav]");
  const menuBtn = $("[data-menu]");
  const menu = $("[data-menu-panel]");
  const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute("aria-expanded", open); };
  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest("[data-nav]")) setMenu(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  // the wordmark turns light over dark sections
  const darkSections = [...document.querySelectorAll("[data-dark]")];
  let navTick = 0;
  function checkNav() {
    navTick = 0;
    const y = 44;
    nav.classList.toggle("on-dark", darkSections.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
    nav.classList.toggle("scrolled", scrollY > 40);
  }
  addEventListener("scroll", () => { if (!navTick) navTick = requestAnimationFrame(checkNav); }, { passive: true });
  checkNav();

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
      <span>${value ? `<i style="--tint:${tintOf(value)}"></i>` : ""}${label} <small>${n}</small></span></label>`;
    $("[data-styles]").insertAdjacentHTML("beforeend",
      chip("", "All bikes", bikes.length, true) +
      [...STYLES.map(([s]) => s), "Other"].filter((s) => styleCounts[s]).map((s) => chip(s, s, styleCounts[s])).join(""));

    const makes = {};
    bikes.forEach((b) => (makes[b.makeLabel] = (makes[b.makeLabel] || 0) + 1));
    const makeNames = Object.keys(makes).sort((a, b) => (a === "Other brands") - (b === "Other brands") || makes[b] - makes[a] || a.localeCompare(b));
    $("[data-make]").insertAdjacentHTML("beforeend",
      [...makeNames].sort((a, b) => (a === "Other brands") - (b === "Other brands") || a.localeCompare(b))
        .map((m) => `<option value="${esc(m)}">${esc(m)} (${makes[m]})</option>`).join(""));
    $("[data-makes]").innerHTML = makeNames.filter((m) => m !== "Other brands")
      .map((m) => `<button class="make" type="button" data-make-pick="${esc(m)}">${esc(m)} <small>${makes[m]}</small></button>`).join("");
  }

  function card(b) {
    const meta = [b.year, b.mileage_km != null && km(b.mileage_km), b.engine_cc && b.engine_cc + " cc"].filter(Boolean);
    return `
      <li class="bike">
        <button class="bike-link" type="button" data-id="${esc(b.id)}">
          <div class="bike-photo">
            ${b.wasPrice ? '<span class="special-tag">On special</span>' : ""}
            ${img(b, 0, `alt="${esc(b.title)}" loading="lazy" width="668" height="501"`)}
            ${img(b, 1, 'alt="" loading="lazy" width="668" height="501"')}
          </div>
          <div class="bike-body">
            <p class="bike-make">${esc(b.makeLabel)}</p>
            <h3 class="bike-title">${esc(b.model || b.title)}</h3>
            <ul class="bike-meta">${meta.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
            <div class="bike-foot">
              <span class="style-tag" style="--tint:${tintOf(b.style)}">${esc(b.style)}</span>
              <p class="bike-price">${b.wasPrice ? `<s>${money(b.wasPrice)}</s>` : ""}${b.price ? money(b.price) : "Ask for price"}${b.monthly_installment ? `<small>or ${money(b.monthly_installment)} pm</small>` : ""}</p>
            </div>
          </div>
        </button>
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
      ? `${bikes.length} pre-owned bikes, all at our Boksburg showroom. Tap any bike for every photo and the full spec sheet.`
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
  $("[data-makes]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-make-pick]");
    if (btn) showStock(() => (form.elements.make.value = btn.dataset.makePick));
  });

  // ---------- riding styles ----------
  function buildRides() {
    const groups = {};
    bikes.forEach((b) => (groups[b.style] = groups[b.style] || []).push(b));
    const order = STYLES.map(([s]) => s).filter((s) => groups[s] && groups[s].length >= 2)
      .sort((a, b) => groups[b].length - groups[a].length)
      .slice(0, 5);
    const lowest = (list) => money(Math.min(...list.map((b) => b.price).filter(Boolean)));
    const rideCard = (value, name, list, blurb, photo, extra = "") => `
        <li>
          <button class="ride${extra}" type="button" data-ride="${esc(value)}" style="--tint:${value ? tintOf(value) : "var(--tarmac)"}">
            <h3>${esc(name)}</h3>
            <span class="ride-count">${list.length} bikes from ${lowest(list)}</span>
            <p>${esc(blurb)}</p>
            <div class="ride-photo">${photo}</div>
          </button>
        </li>`;
    const photoOf = (list, n) => [...list].filter((b) => b.images.length).sort((a, b) => b.price - a.price)[n];
    const cards = order.map((s) => {
      const cover = photoOf(groups[s], 0);
      return rideCard(s, s, groups[s], STYLE_INFO[s].blurb, cover ? img(cover, 0, 'alt="" loading="lazy" width="668" height="501"') : "");
    });
    // the sixth card shows the whole floor
    const stack = [0, 1, 2].map((n) => photoOf(bikes, n * 7)).filter(Boolean)
      .map((b) => `<span>${img(b, 0, 'alt="" loading="lazy" width="668" height="501"')}</span>`).join("");
    cards.push(rideCard("", "Everything", bikes, "Every bike on the floor, with specials first.", stack, " ride-all"));
    $("[data-rides]").innerHTML = cards.join("");
    $("[data-rides]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ride]");
      if (!btn) return;
      showStock(() => {
        const radio = form.querySelector(`input[name="style"][value="${CSS.escape(btn.dataset.ride)}"]`);
        if (radio) radio.checked = true;
      });
    });
  }

  // ---------- hero fan ----------
  function buildFan(skip) {
    const picks = pickFeatured(bikes, 5, skip);
    const pos = [-2, -1, 0, 1, 2];
    const order = [3, 1, 0, 2, 4]; // the priciest pick sits in the middle
    const fan = $("[data-fan]");
    fan.innerHTML = pos.map((p, i) => {
      const b = picks[order[i]];
      if (!b) return "";
      return `
        <button class="fan-card" type="button" data-id="${esc(b.id)}" data-pos="${p}" style="z-index:${3 - Math.abs(p)}; transition-delay:${Math.abs(p) * 60}ms">
          ${img(b, 0, `alt="${esc(b.title)}" width="668" height="501"${Math.abs(p) > 1 ? ' loading="lazy"' : ""}`)}
          <span class="fan-cap"><strong>${esc(b.model || b.title)}</strong><span>${money(b.price)}</span></span>
        </button>`;
    }).join("");
    const layout = () => {
      const w = fan.clientWidth;
      const step = Math.min(250, w * (w < 600 ? .3 : .21));
      fan.querySelectorAll(".fan-card").forEach((c) => {
        const p = Number(c.dataset.pos);
        c.style.setProperty("--x", `${p * step}px`);
        c.style.setProperty("--y", `${Math.abs(p) * Math.abs(p) * 9 + Math.abs(p) * 8}px`);
        c.style.setProperty("--r", `${p * 4.5}deg`);
        c.style.setProperty("--s", `${1 - Math.abs(p) * .08}`);
      });
    };
    layout();
    addEventListener("resize", layout);
    fan.addEventListener("click", (e) => {
      const c = e.target.closest("[data-id]");
      if (c) openBike(c.dataset.id);
    });
    // one orchestrated entrance: the cards fan out from a stack
    const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      fan.classList.add("is-in");
      setTimeout(() => fan.querySelectorAll(".fan-card").forEach((c) => (c.style.transitionDelay = "")), 1000);
    }));
    const middle = fan.querySelector('[data-pos="0"] img');
    if (reduceMotion.matches || !middle || middle.complete) reveal();
    else { middle.addEventListener("load", reveal, { once: true }); middle.addEventListener("error", reveal, { once: true }); setTimeout(reveal, 1200); }
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
    const styleTag = $("[data-detail-style]");
    styleTag.textContent = b.style;
    styleTag.style.setProperty("--tint", tintOf(b.style));
    $("[data-detail-flag]").hidden = !b.wasPrice;
    $("[data-detail-make]").textContent = [b.year, b.makeLabel].filter(Boolean).join(" ");
    $("[data-detail-title]").textContent = b.model || b.title;
    $("[data-detail-price]").innerHTML = (b.price ? money(b.price) : "Ask for price") + (b.wasPrice ? `<s>${money(b.wasPrice)}</s>` : "");
    $("[data-detail-monthly]").textContent = b.monthly_installment
      ? `About ${money(b.monthly_installment)} a month on finance, subject to approval`
      : "";
    const msg = `Hi TRD, I'm interested in the ${b.title} (stock no. ${b.stock_no}) for ${money(b.price)}.`;
    $("[data-wa]").href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

    const specs = [
      ["Year", b.year],
      ["Mileage", b.mileage_km != null && km(b.mileage_km)],
      ["Engine", b.engine_cc && `${b.engine_cc} cc`],
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

  ready
    .then((rows) => {
      bikes = rows;
      buildFilters();
      buildRides();
      render();
      buildFan(new Set(pickFeatured(bikes, 6).map((b) => b.id)));
      const monthly = bikes.map((b) => b.monthly_installment).filter(Boolean);
      if (monthly.length) $("[data-min-monthly]").textContent = money(Math.min(...monthly));
      const m = location.hash.match(/^#bike-(.+)$/);
      if (m) openBike(m[1]);
    })
    .catch(() => {
      countEl.textContent = "The stock list didn't load. Refresh the page, or WhatsApp us on 064 297 0282 to ask what's available.";
    });
})();
