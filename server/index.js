// TRD Motorcycles: serves the website, the /sales app and the API the sales team posts to.
// Storage is a JSON file (server/data/db.json) plus photos in uploads/, which is plenty for one dealership's team.
//   npm start                      → http://localhost:4317
//   TRD_ADMIN_EMAIL / TRD_ADMIN_PASSWORD   first manager account, created when the team is empty
//   TRD_SECRET                     signs session cookies (set it in production)
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "server", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS = path.join(ROOT, "uploads");
const PORT = Number(process.env.PORT) || 4317;
const PROD = process.env.NODE_ENV === "production";
const SESSION_DAYS = 90;      // "Keep me signed in"
const SHORT_SESSION_HOURS = 12; // signed in on a shared or borrowed phone

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- store ----------
const db = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
  : { users: [], posts: [], secret: crypto.randomBytes(32).toString("hex") };
let saving = null;
function save() {
  // write to a temp file and rename, so a crash mid-write never leaves half a database
  clearTimeout(saving);
  saving = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
const SECRET = process.env.TRD_SECRET || db.secret;

const id = () => crypto.randomBytes(9).toString("base64url");
const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  const test = crypto.scryptSync(pw, salt, 64);
  return hash && crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

function seed() {
  if (db.users.length) return;
  const email = process.env.TRD_ADMIN_EMAIL || (PROD ? "" : "demo@trdmotorcycles.co.za");
  const password = process.env.TRD_ADMIN_PASSWORD || (PROD ? "" : "trd-demo-2026");
  if (!email || !password) {
    console.warn("No team yet: set TRD_ADMIN_EMAIL and TRD_ADMIN_PASSWORD to create the first manager.");
    return;
  }
  db.users.push({
    id: id(), email: email.toLowerCase(), name: PROD ? "TRD Manager" : "Demo Salesperson", role: "manager",
    title: "Sales", phone: "", bio: "", avatar: "", public: !PROD, active: true,
    password: hashPassword(password), created: new Date().toISOString(),
  });
  save();
  console.log(`Created manager ${email}${PROD ? "" : ` / ${password} (demo)`}`);
}
seed();

// ---------- sessions: signed cookie "uid.expiry.sig" ----------
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const makeToken = (uid, ms) => { const v = `${uid}.${Date.now() + ms}`; return `${v}.${sign(v)}`; };
function readToken(token) {
  const [uid, exp, sig] = String(token || "").split(".");
  if (!uid || !sig || Number(exp) < Date.now()) return null;
  const good = sign(`${uid}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return db.users.find((u) => u.id === uid && u.active) || null;
}
const cookieOf = (req, name) =>
  (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];
function setSession(req, res, token, maxAge) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie",
    `trd_session=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge == null ? "" : `; Max-Age=${maxAge}`}${secure ? "; Secure" : ""}`);
}

const publicUser = (u) => ({ id: u.id, name: u.name, title: u.title, phone: u.phone, bio: u.bio, avatar: u.avatar });
const selfUser = (u) => ({ ...publicUser(u), email: u.email, role: u.role, public: u.public, active: u.active });

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  req.user = readToken(cookieOf(req, "trd_session"));
  // writes need the app's own header, which a cross-site form can't send (CSRF guard on top of SameSite=Lax)
  if (req.method !== "GET" && req.get("X-TRD") !== "1") return res.status(403).json({ error: "Bad request origin" });
  next();
});
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Sign in first" }));
const needManager = (req, res, next) =>
  req.user?.role === "manager" ? next() : res.status(403).json({ error: "Only a manager can do that" });

// a few wrong passwords per address per 15 minutes, then a pause
const attempts = new Map();
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const key = `${req.ip}|${email}`;
  const recent = (attempts.get(key) || []).filter((t) => t > Date.now() - 15 * 6e4);
  if (recent.length >= 8) return res.status(429).json({ error: "Too many tries. Wait 15 minutes, or ask your manager to reset your password." });
  const user = db.users.find((u) => u.email === email && u.active);
  if (!user || !checkPassword(String(req.body.password || ""), user.password)) {
    attempts.set(key, [...recent, Date.now()]);
    return res.status(401).json({ error: "That email and password don't match." });
  }
  attempts.delete(key);
  // remembered: a 90-day cookie that survives closing the app; otherwise a browser-session cookie good for 12 hours
  if (req.body.remember === false) setSession(req, res, makeToken(user.id, SHORT_SESSION_HOURS * 36e5), null);
  else setSession(req, res, makeToken(user.id, SESSION_DAYS * 864e5), SESSION_DAYS * 86400);
  res.json({ user: selfUser(user) });
});
app.post("/api/logout", (req, res) => { setSession(req, res, "", 0); res.json({ ok: true }); });
app.get("/api/me", needUser, (req, res) => res.json({ user: selfUser(req.user) }));

app.patch("/api/me", needUser, (req, res) => {
  const u = req.user;
  const b = req.body;
  for (const k of ["name", "title", "phone", "bio"]) if (typeof b[k] === "string") u[k] = b[k].trim().slice(0, k === "bio" ? 280 : 80);
  if (typeof b.public === "boolean") u.public = b.public;
  if (b.newPassword) {
    if (!checkPassword(String(b.currentPassword || ""), u.password)) return res.status(400).json({ error: "Your current password is wrong." });
    if (String(b.newPassword).length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
    u.password = hashPassword(String(b.newPassword));
  }
  if (!u.name) return res.status(400).json({ error: "Your name can't be empty." });
  save();
  res.json({ user: selfUser(u) });
});

// ---------- photos ----------
const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, `${Date.now().toString(36)}-${id()}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});
// check the bytes too, not just the declared type
function isImage(file) {
  const head = Buffer.alloc(12);
  const fd = fs.openSync(file.path, "r");
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  return (head[0] === 0xff && head[1] === 0xd8) || head.toString("hex", 0, 4) === "89504e47" ||
    (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP");
}
const removeUpload = (url) => { if (url?.startsWith("/uploads/")) fs.rm(path.join(UPLOADS, path.basename(url)), () => {}); };
function takeFiles(req, res) {
  const files = req.files || (req.file ? [req.file] : []);
  const bad = files.filter((f) => !isImage(f));
  if (bad.length) { files.forEach((f) => fs.rm(f.path, () => {})); res.status(400).json({ error: "Only JPEG, PNG or WebP photos." }); return null; }
  return files.map((f) => `/uploads/${f.filename}`);
}

app.post("/api/me/avatar", needUser, upload.single("photo"), (req, res) => {
  const [url] = takeFiles(req, res) || [];
  if (!url) return res.headersSent || res.status(400).json({ error: "Pick a photo." });
  removeUpload(req.user.avatar);
  req.user.avatar = url;
  save();
  res.json({ user: selfUser(req.user) });
});

// ---------- posts ----------
// kind: "bike" (just in, shows in the stock list), "gear" (riding kit in the shop), "floor" (showroom),
// "handover" (a customer collecting their bike)
const KINDS = ["bike", "gear", "floor", "handover"];
// the six categories of the TRD shop, same as the website's gear mosaic
const GEAR_CATEGORIES = ["helmets", "jackets", "gloves", "pants", "boots", "essentials"];
const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
const postOut = (p) => {
  const author = db.users.find((u) => u.id === p.author);
  return { ...p, author: author ? publicUser(author) : null };
};

app.post("/api/posts", needUser, upload.array("photos", 12), (req, res) => {
  const photos = takeFiles(req, res);
  if (!photos) return;
  const b = req.body;
  const kind = KINDS.includes(b.kind) ? b.kind : "floor";
  if (!photos.length) return res.status(400).json({ error: "Add at least one photo." });
  const post = {
    id: id(), kind, author: req.user.id, created: new Date().toISOString(), photos,
    caption: String(b.caption || "").trim().slice(0, 600),
    title: String(b.title || "").trim().slice(0, 120),
  };
  if (kind === "bike") {
    Object.assign(post, {
      make: String(b.make || "").trim().slice(0, 40), model: String(b.model || "").trim().slice(0, 80),
      year: num(b.year), price: num(b.price), mileage_km: num(b.mileage_km), engine_cc: num(b.engine_cc),
      colour: String(b.colour || "").trim().slice(0, 30),
    });
    if (!post.make || !post.model) { photos.forEach(removeUpload); return res.status(400).json({ error: "Add the make and model." }); }
    post.title = [post.year, post.make, post.model].filter(Boolean).join(" ");
  }
  if (kind === "gear") {
    Object.assign(post, {
      category: GEAR_CATEGORIES.includes(b.category) ? b.category : "essentials",
      brand: String(b.brand || "").trim().slice(0, 40), price: num(b.price),
      sizes: String(b.sizes || "").trim().slice(0, 60),
    });
    if (!post.title) { photos.forEach(removeUpload); return res.status(400).json({ error: "Give the item a name." }); }
  }
  db.posts.unshift(post);
  save();
  res.status(201).json({ post: postOut(post) });
});

app.get("/api/posts/mine", needUser, (req, res) =>
  res.json({ posts: db.posts.filter((p) => req.user.role === "manager" || p.author === req.user.id).map(postOut) }));

app.delete("/api/posts/:id", needUser, (req, res) => {
  const i = db.posts.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Already gone." });
  const p = db.posts[i];
  if (p.author !== req.user.id && req.user.role !== "manager") return res.status(403).json({ error: "That's someone else's post." });
  p.photos.forEach(removeUpload);
  db.posts.splice(i, 1);
  save();
  res.json({ ok: true });
});

// ---------- stock: the dealer feed plus the team's "just in" bikes; anyone on the team can mark one sold ----------
db.sold ||= []; // [{ id, by, at }]: a stock.json id, "p-<post id>" for a team bike, or "g-<post id>" for gear
const STOCK_FILE = path.join(ROOT, "data", "stock.json");
let stockCache = { mtime: 0, rows: [] };
function dealerStock() {
  // re-read only when the scraper has written a new file
  try {
    const { mtimeMs } = fs.statSync(STOCK_FILE);
    if (mtimeMs !== stockCache.mtime) stockCache = { mtime: mtimeMs, rows: JSON.parse(fs.readFileSync(STOCK_FILE, "utf8")) };
  } catch { stockCache = { mtime: 0, rows: [] }; }
  return stockCache.rows;
}
const soldIds = () => new Set(db.sold.map((x) => x.id));
const userName = (uid) => db.users.find((u) => u.id === uid)?.name || "";
const localPhoto = (rel) => (rel && fs.existsSync(path.join(ROOT, "data", rel)) ? `/data/${rel}` : null);
function stockList() {
  const sold = new Map(db.sold.map((x) => [x.id, x]));
  const team = db.posts.filter((p) => p.kind === "bike").map((p) => ({
    id: `p-${p.id}`, source: "team", stock_no: "", year: p.year, make: p.make, model: p.model, price: p.price,
    mileage_km: p.mileage_km, engine_cc: p.engine_cc, photo: p.photos[0], postedBy: userName(p.author), created: p.created,
  }));
  const dealer = dealerStock().map((r) => {
    const make = r.make === "Multiple Motorcycle Manufacturers" ? "" : r.make || "";
    let model = (r.model || "").trim();
    if (make && model.toLowerCase().startsWith(make.toLowerCase() + " ")) model = model.slice(make.length + 1);
    return {
      id: String(r.id), source: "dealer", stock_no: r.stock_no, year: r.year, make, model,
      price: r.on_special ? r.cash_price_incl_vat : r.price, mileage_km: r.mileage_km, engine_cc: r.engine_cc,
      photo: localPhoto(r.images?.[0]) || r.image_urls?.[0] || "",
    };
  });
  return [...team, ...dealer].map((b) => {
    const x = sold.get(b.id);
    return x ? { ...b, sold: true, soldBy: userName(x.by), soldAt: x.at } : b;
  });
}
function gearList() {
  const sold = new Map(db.sold.map((x) => [x.id, x]));
  return db.posts.filter((p) => p.kind === "gear").map((p) => {
    const x = sold.get(`g-${p.id}`);
    return {
      id: `g-${p.id}`, title: p.title, category: p.category, brand: p.brand, price: p.price, sizes: p.sizes,
      photo: p.photos[0], postedBy: userName(p.author), created: p.created,
      ...(x ? { sold: true, soldBy: userName(x.by), soldAt: x.at } : {}),
    };
  });
}
app.get("/api/stock", needUser, (req, res) => res.json({ stock: stockList(), gear: gearList() }));
app.post("/api/stock/:id/sold", needUser, (req, res) => {
  const bikeId = String(req.params.id);
  if (![...stockList(), ...gearList()].some((b) => b.id === bikeId)) return res.status(404).json({ error: "That's not in stock any more." });
  if (!soldIds().has(bikeId)) { db.sold.push({ id: bikeId, by: req.user.id, at: new Date().toISOString() }); save(); }
  res.json({ ok: true });
});
// undo, for a bike marked sold by mistake (or a deal that fell through)
app.delete("/api/stock/:id/sold", needUser, (req, res) => {
  db.sold = db.sold.filter((x) => x.id !== String(req.params.id));
  save();
  res.json({ ok: true });
});

// the website reads this: the team on the floor, their latest posts, and which bikes are sold
app.get("/api/public", (req, res) => {
  const team = db.users.filter((u) => u.active && u.public).map(publicUser);
  const visible = new Set(db.users.filter((u) => u.active).map((u) => u.id));
  const sold = soldIds();
  const posts = db.posts.filter((p) => visible.has(p.author) &&
    !(p.kind === "bike" && sold.has(`p-${p.id}`)) && !(p.kind === "gear" && sold.has(`g-${p.id}`)));
  res.json({ team, posts: posts.slice(0, 60).map(postOut), sold: [...sold] });
});

// ---------- team (managers) ----------
app.get("/api/team", needUser, needManager, (req, res) => res.json({ team: db.users.map(selfUser) }));
app.post("/api/team", needUser, needManager, (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim().slice(0, 80);
  const password = String(req.body.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Add a name and a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "The first password needs at least 8 characters." });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: "Someone already uses that email." });
  const user = {
    id: id(), email, name, role: req.body.role === "manager" ? "manager" : "sales", title: "Sales", phone: String(req.body.phone || "").slice(0, 30),
    bio: "", avatar: "", public: true, active: true, password: hashPassword(password), created: new Date().toISOString(),
  };
  db.users.push(user);
  save();
  res.status(201).json({ user: selfUser(user) });
});
app.patch("/api/team/:id", needUser, needManager, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "Not found." });
  if (u.id === req.user.id && req.body.active === false) return res.status(400).json({ error: "You can't switch yourself off." });
  if (typeof req.body.active === "boolean") u.active = req.body.active;
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
    u.password = hashPassword(String(req.body.password));
  }
  save();
  res.json({ user: selfUser(u) });
});

app.use("/api", (err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Each photo must be under 12 MB." : "Too many photos (12 max)." });
  console.error(err);
  res.status(500).json({ error: "Something broke on our side. Try again." });
});
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// ---------- static ----------
app.use("/uploads", express.static(UPLOADS, { maxAge: "30d", immutable: true }));
app.get("/sw.js", (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(ROOT, "sw.js")); });
for (const dir of ["assets", "data", "sales", "icons"]) app.use(`/${dir}`, express.static(path.join(ROOT, dir), { maxAge: PROD ? "7d" : 0 }));
app.get("/manifest.webmanifest", (req, res) => res.type("application/manifest+json").sendFile(path.join(ROOT, "manifest.webmanifest")));
app.get(["/", "/index.html"], (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(ROOT, "index.html")); });
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, "index.html")));

app.listen(PORT, () => console.log(`TRD running on http://localhost:${PORT}  (sales app: /sales/)`));
