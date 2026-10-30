# TRD Motorcycles

The TRD Motorcycles (Boksburg) website, an installable PWA, and **TRD Sales**, the app the sales team uses to post to the site.

```bash
npm install
npm run dev        # http://localhost:4317   (sales app: http://localhost:4317/sales/)
```

In development a demo manager account is created on first run: `demo@trdmotorcycles.co.za` / `trd-demo-2026`.

## What's where

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The website. `app.js` runs the stock list and bike sheet; `site.js` runs the hero, spotlight, gear, showroom photos, team and install button. |
| `sales/` | TRD Sales (installable on its own, scope `/sales/`): download screen, sign in, post photos, profile, team. |
| `server/index.js` | Serves both, plus the API. Accounts and posts live in `server/data/db.json`, photos in `uploads/` (both gitignored). |
| `data/stock.json` | Stock, from `python3 scraper/scrape_stock.py`. |
| `assets/gallery/`, `assets/gear/` | Showroom photos from trdmotorcycles.co.za/pages/gallery and the shop's gear category photos. |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: install, offline shell, icons. |

## The sales team flow

1. A manager signs in to `/sales/` and adds each salesperson under **Team** (name, email, first password).
2. The salesperson opens `/sales/`, taps **Download the app** (Add to Home Screen on iPhone), then signs in.
3. From the app they post:
   - **Just in**: a new bike with photos, make, model, price and mileage. It shows first in the website's stock list with a "Just in" tag.
   - **Gear**: helmets, jackets, gloves, pants, boots and essentials with brand, price and sizes. They show in "In the shop now" under the website's gear mosaic, and each mosaic tile shows how many are in.
   - **Showroom** and **Handover** photos, which show in "Fresh from the floor".
4. Under **Profile** they add a photo, WhatsApp number and a line about themselves; that card shows in "Talk to a rider" on the website.
5. Under **Stock** every salesperson sees every bike and gear item on the website (the dealer feed plus team posts). **Mark sold** takes a bike off the site straight away; the **Sold** tab shows who sold it and has **Put back** for mistakes.

"Keep me signed in" keeps a salesperson signed in for 90 days and remembers their email, name and photo on that phone, so next time it's just the password ("Not you?" forgets them). Turned off, the session ends with the browser (at most 12 hours). The app reopens on the last tab used.

Photos are resized on the phone (longest side 1800 px, WebP) before upload. A manager can switch someone off, which hides their posts and profile from the site.

## Production

```bash
TRD_ADMIN_EMAIL=you@trdmotorcycles.co.za TRD_ADMIN_PASSWORD='something-long' TRD_SECRET='random-64-chars' PORT=4317 npm start
```

Run it behind HTTPS (the PWA install and secure cookies need it), e.g. with pm2 and an Apache/Nginx reverse proxy. Back up `server/data/` and `uploads/`.
On static hosting (e.g. GitHub Pages) the website still works; the team, feed and "Just in" sections simply stay hidden.
