# Dorm Window Vote

A live dining-hall rating display for a dorm window. QR code on a screen, passersby scan and rate the meal, results update live.

## Stack

- **Cloudflare Pages** — static hosting + serverless functions, generous free tier
- **Cloudflare KV** — vote storage (key-value), free tier covers way more than needed
- Single `index.html` + one Pages Function at `functions/api/votes.js`

No build step. No framework. Push to GitHub, connect to Cloudflare Pages, done.

## Layout

```
.
├── index.html            # the whole UI (display mode + voter mode)
└── functions/
    └── api/
        └── votes.js      # GET reads tally, POST adds a vote
```

The URL routing is automatic:
- `/` → display mode (big screen view with QR)
- `/?mode=vote` → voter mode (what people land on after scanning)

## One-time setup

### 1. Push to GitHub
```bash
cd dorm-vote
git init
git add .
git commit -m "init"
gh repo create dorm-vote --public --source=. --push
```

(Or create the repo on github.com and `git push` manually.)

### 2. Create a Cloudflare account
Sign up at https://dash.cloudflare.com/sign-up — free, no card required.

### 3. Create a KV namespace
In the Cloudflare dashboard:
- Storage & Databases → KV → Create namespace
- Name it `dorm-votes` (or whatever)

### 4. Create the Pages project
- Workers & Pages → Create → Pages → Connect to Git
- Pick the `dorm-vote` repo
- Build settings: leave everything blank (no build command, no output directory)
- Deploy

### 5. Bind the KV namespace
After the first deploy:
- Open the Pages project → Settings → Bindings → Add → KV namespace
- Variable name: `VOTES` (must be exactly this — the Function code uses `env.VOTES`)
- KV namespace: pick the `dorm-votes` one
- Save, then redeploy (Deployments → ⋯ → Retry deployment)

That's it. You'll get a URL like `https://dorm-vote.pages.dev`. Open it on your screen → display mode with the live QR code.

## Custom subdomain (optional but nice)

If you have a domain on Cloudflare, you can map `food.yourname.com` to the Pages project in two clicks (Pages project → Custom domains). Shorter URLs make the QR code denser-but-still-scannable and the printed URL more memorable.

## Running on the dorm screen

For now, on your Mac:
- Open the deployed URL in fullscreen (Chrome: Cmd-Shift-F)
- Disable display sleep: System Settings → Lock Screen → "Turn display off on power adapter when inactive" → Never
- Disable screen lock while you're at it

When you get a Pi:
- Raspberry Pi OS, autostart Chromium in kiosk mode pointing at your URL
- I can write you the exact `~/.config/lxsession/LXDE-pi/autostart` line when you're ready

## Anti-abuse

The API rate-limits one vote per IP per meal per 4 hours. Roommates on the same Wi-Fi share an IP, so this is a soft limit, not a hard one — fine for a dorm window. If someone really wants to spam, they can switch to cellular or use a VPN. For a fun project this is the right level of friction.

If you want stronger protection later: add a Turnstile (Cloudflare's free captcha) check on the POST. ~10 lines of code.

## Cost

$0. The free tier covers:
- KV: 100,000 reads/day, 1,000 writes/day (you will not hit this)
- Pages Functions: 100,000 invocations/day
- Bandwidth: unlimited

## Adjusting things

- **Meal time boundaries**: edit `currentMeal()` in `index.html` (currently <10am breakfast, <3pm lunch, else dinner)
- **Verdict thresholds**: edit `verdictFor()` in `index.html`
- **Cooldown duration**: edit `COOLDOWN_SECONDS` in `functions/api/votes.js`
- **Refresh rate**: edit the `setInterval(renderDisplay, 3000)` line
