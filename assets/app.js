// Stock list, filters and bike detail. Data comes from data/stock.json (see scraper/).
(() => {
  const WHATSAPP = "27642970282";
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const STYLES = [
    ["Adventure", /adventure|dual[- ]sport|v-strom|multistrada|\bgs\b|tiger|africa twin|tenere|pan america/i],
    ["Sport", /super ?sport|superbike|sport ?bike|track|\brr\b|ninja|zx|gsx-?r|cbr|r1\b|r6\b|panigale|hayabusa|1300r/i],
    ["Naked", /naked|streetfighter|duke|street triple|speed triple|monster|\bz\d{3}/i],
    ["Touring", /tour/i],
    ["Cruiser", /cruiser|harley|diavel|night rod|fat bob|vzr|boulevard|softail|bobber/i],
    ["Off-road", /enduro|motocross|off-road|atv|quad|dirt/i],
  ];

  const money = (n) => "R" + Math.round(n).toLocaleString("en-US");
  const km = (n) => n.toLocaleString("en-US") + " km";

  function styleOf(bike) {
    // the first sentence of the description says what kind of bike it is
    const text = `${bike.model} ${(bike.description || "").slice(0, 260)}`;
    const hit = STYLES.find(([, re]) => re.test(text));
    return hit ? hit[0] : "Other";
  }

  function normalise(raw) {
    const make = raw.make === "Multiple Motorcycle Manufacturers" ? "" : raw.make || "";
    let model = (raw.model || "").trim();
    if (make && model.toLowerCase().startsWith(make.toLowerCase() + " ")) model = model.slice(make.length + 1);
    const price = raw.price || 0;
    const special = raw.on_special ? raw.cash_price_incl_vat : null;
    return {
      ...raw,
      make,
      model,
      makeLabel: make || "Other brands",
      title: [raw.year, make, model].filter(Boolean).join(" "),
      price: special || price,
      wasPrice: special ? price : null,
      images: raw.images && raw.images.length ? raw.images.map((p) => "data/" + p) : raw.image_urls || [],
      style: styleOf(raw),
    };
  }

  // ---------- data ----------
  const ready = fetch("data/stock.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((rows) => rows.map(normalise));

  window.TRD = { ready, openBike: (id) => openBike(id), money, km };

  // ---------- grid ----------
  const grid = $("[data-grid]");
  const form = $("[data-filters]");
  const countEl = $("[data-count]");
  const emptyEl = $("[data-empty]");
  let bikes = [];

  function buildFilters() {
    const styleCounts = {};
    bikes.forEach((b) => (styleCounts[b.style] = (styleCounts[b.style] || 0) + 1));
    const styleBox = $("[data-styles]");
    const chip = (value, label, n, checked) => `
      <label class="chip"><input type="radio" name="style" value="${value}" ${checked ? "checked" : ""}>
      <span>${label} <small>${n}</small></span></label>`;
    styleBox.insertAdjacentHTML("beforeend",
      chip("", "All bikes", bikes.length, true) +
      [...STYLES.map(([s]) => s), "Other"]
        .filter((s) => styleCounts[s])
        .map((s) => chip(s, s, styleCounts[s]))
        .join(""));

    const makes = {};
    bikes.forEach((b) => (makes[b.makeLabel] = (makes[b.makeLabel] || 0) + 1));
    $("[data-make]").insertAdjacentHTML("beforeend",
      Object.keys(makes).sort((a, b) => (a === "Other brands") - (b === "Other brands") || a.localeCompare(b))
        .map((m) => `<option value="${esc(m)}">${esc(m)} (${makes[m]})</option>`).join(""));
  }

  function card(b) {
    const [first, second] = b.images;
    const specs = [b.mileage_km != null && km(b.mileage_km), b.engine_cc && b.engine_cc + " cc", b.style !== "Other" && b.style]
      .filter(Boolean).join(", ");
    return `
      <li class="bike">
        <button class="bike-link" type="button" data-id="${esc(b.id)}">
          <div class="bike-photo">
            ${b.wasPrice ? '<span class="bike-flag">On special</span>' : ""}
            ${first ? `<img src="${esc(first)}" alt="${esc(b.title)}" loading="lazy" width="668" height="501">` : ""}
            ${second ? `<img src="${esc(second)}" alt="" loading="lazy" width="668" height="501">` : ""}
          </div>
          <div class="bike-text">
            <h3 class="bike-title">${esc(b.title)}</h3>
            <p class="bike-price">${b.wasPrice ? `<s>${money(b.wasPrice)}</s>` : ""}${b.price ? money(b.price) : "Ask for price"}</p>
            <p class="bike-specs">${esc(specs)}</p>
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
      ? `${bikes.length} pre-owned bikes, all at our Boksburg showroom`
      : `Showing ${list.length} of ${bikes.length} bikes`;
  }

  form.addEventListener("input", render);
  $("[data-clear]").addEventListener("click", () => { form.reset(); render(); });
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openBike(btn.dataset.id);
  });

  // ---------- detail ----------
  const dialog = $("[data-detail]");
  const galleryImg = $("[data-gallery-img]");
  const thumbs = $("[data-thumbs]");
  let current = null;
  let photo = 0;

  function descriptionHtml(text) {
    if (!text) return "";
    const [intro, ...points] = esc(text).split("•").map((s) => s.trim()).filter(Boolean);
    return `<p>${intro}</p>${points.length ? `<ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}`;
  }

  function showPhoto(i) {
    const imgs = current.images;
    if (!imgs.length) return;
    photo = (i + imgs.length) % imgs.length;
    galleryImg.src = imgs[photo];
    galleryImg.alt = `${current.title}, photo ${photo + 1}`;
    $("[data-gallery-count]").textContent = `${photo + 1} / ${imgs.length}`;
    thumbs.querySelectorAll("button").forEach((t, n) => t.setAttribute("aria-current", n === photo));
  }

  function openBike(id) {
    const b = bikes.find((x) => String(x.id) === String(id));
    if (!b) return;
    current = b;
    $("[data-detail-title]").textContent = b.title;
    $("[data-detail-flag]").hidden = !b.wasPrice;
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
      ["Style", b.style !== "Other" && b.style],
      ["Stock no.", b.stock_no],
    ].filter(([, v]) => v);
    $("[data-specs]").innerHTML = specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    $("[data-desc]").innerHTML = descriptionHtml(b.description);

    thumbs.innerHTML = b.images
      .map((src, n) => `<button type="button" data-photo="${n}" aria-label="Photo ${n + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`)
      .join("");
    showPhoto(0);

    if (!dialog.open) dialog.showModal();
    $(".detail-info").scrollTop = 0;
    history.replaceState(null, "", `#bike-${b.id}`);
  }

  thumbs.addEventListener("click", (e) => {
    const t = e.target.closest("[data-photo]");
    if (t) showPhoto(Number(t.dataset.photo));
  });
  $("[data-prev]").addEventListener("click", () => showPhoto(photo - 1));
  $("[data-next]").addEventListener("click", () => showPhoto(photo + 1));
  $("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
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
      render();
      const m = location.hash.match(/^#bike-(.+)$/);
      if (m) openBike(m[1]);
    })
    .catch(() => {
      countEl.textContent = "Stock couldn't load. Refresh the page, or WhatsApp us on 064 297 0282 for what's available.";
    });
})();
