# 🏐 Gen Z Volleyball Malawi

A fully functional multi-page website for an under-25 volleyball community in Malawi.

## 🚀 Quick start

The site is a static multi-page app — no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd genz-volleyball
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 📁 Pages

| Page | File | Features |
|------|------|----------|
| 🏠 **Home** | `index.html` | Hero, live countdown, ticker, live stream preview, score pad, court map, leaderboard preview, scouting highlights |
| 💪 **Training** | `training.html` | Skill tabs (serve/spike/pass/set/block/fitness), featured videos, personal skill progress tracker |
| 📺 **Live** | `live.html` | Live stream player, schedule, live stats, chat link, **public highlight reel** |
| 🎬 **Videos** | `videos.html` | Upload & watch community videos, highlights, training clips, match replays |
| 👥 **Teams** | `teams.html` | All registered teams with logos, city filter, search, click for roster + schedule |
| 🏆 **Leaderboard** | `leaderboard.html` | Sortable/filterable stats table, podium for top 3, search, **player photos** |
| 📅 **Matches** | `matches.html` | Upcoming/live/completed tabs, booking modal, my-bookings tab |
| 📝 **Register** | `register.html` | Player signup with **photo** + waiver + medical upload + skill self-rating, team signup with **logo** |
| 💛 **Donate** | `donate.html` | Donation form with presets, progress bar, recent supporters |
| 🔐 **Login** | `login.html` | Account creation (player/coach/captain/admin/fan), login |
| 🔒 **Locker** | `locker.html` | Password-protected coach area: strategy videos, private feedback, roster |

## ✨ Features

- **3D animations** — Animated background blobs, floating volleyball, mouse-tilt on cards (`card-3d`), depth shadows
- **Live countdown** to the next match
- **Scrolling score ticker** that pulls from real match data
- **Live streaming panel** with viewer count
- **Match score pad** — Track sets, save completed matches
- **Interactive court map** with pinned practice locations
- **Player & team registration** with liability waiver, medical form upload, emergency contact
- **Skill progress tracker** that logs weekly snapshots with history
- **Dynamic leaderboard** with position filtering, search, sort, and a podium
- **Donation box** with preset amounts, payment methods, recent supporters
- **Floating chatbox** with seed conversation
- **Password-protected Locker Room** (demo password: `locker2026`) for strategy videos & private player feedback
- **Multi-role auth** (player / coach / captain / admin / fan)

## 🗄️ Data layer

All data is persisted in **`localStorage`** under the key `gzvm_data_v2`. The storage layer is in `js/app.js` (`APP.data`, `APP.save`, `APP.load`).

### 🌐 Cross-device sync (Supabase)

By default, each browser is its own silo. To make team names, profile photos, registrations, chat, donations, leaderboard, and live streams **sync live across every device**:

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** → paste the contents of `supabase-setup.sql` → Run
3. Go to **Settings → API** and copy your "Project URL" and "anon public" key
4. Paste both into `js/supabase-sync.js`:
   ```js
   config: {
     url: 'https://xxxxx.supabase.co',
     anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
   }
   ```
5. Refresh the site. Sync runs silently in the background — visitors never see a setup page.

**What syncs in real time:**
- Team names + logos
- Player names + profile photos
- Player registrations (waivers, medical forms go to Supabase Storage)
- Match scores, results, and bookings
- Donations & donation progress bar
- Live stream rooms
- Chat messages
- Skill progress updates
- Leaderboard ranks
- Strategy videos + coach feedback

**How it works:** The `gzvm_sync` table holds one row per entity (team/player/match/etc) with the full JSON payload. When any device calls `APP.save()`, the new data is upserted to Supabase. A realtime subscription on every device fires `APP.handleChange()` when remote writes come in, which updates local state and triggers a re-render.

### To swap in a different real backend (Firebase / custom API)

The entire data layer is centralized in `js/app.js`. To migrate to another service:

1. Replace `APP.load()` and `APP.save()` with your service's read/write
2. Replace `APP.register()` / `APP.login()` with your auth provider
3. Add `currentUser()` listener via your auth provider's state-change event

The rest of the app reads/writes through `APP.data` so the rest of the code stays the same.

## 🔑 Demo coach accounts (for the Locker Room)

Click **"⚙️ Seed demo coach accounts"** on the login page, then log in as:

- `coach.mary@genzvolleyball.mw` / `coach123`
- `coach.joseph@genzvolleyball.mw` / `coach123`

Locker password: `locker2026`

## 🎨 Design

- **Style**: Bold, sporty, modern — dark navy with hot-pink + court-yellow + teal accents
- **Fonts**: Bebas Neue (display) + Inter (body)
- **Responsive**: Mobile-first, works down to 360px
- **No build step** — vanilla HTML / CSS / JS only
- **Watch-link live streams** — Go Live from your camera and share a link; the other person just opens it
- **Dark / light toggle**, cookie banner, site search, back-to-top, skip-to-content, FAQ, floating contact
- **Password show/hide**, copy buttons, print stylesheet, form confirmation + success states, UTM capture
