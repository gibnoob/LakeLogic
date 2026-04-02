
```
 ██╗      █████╗ ██╗  ██╗███████╗    ██╗      ██████╗  ██████╗ ██╗ ██████╗
 ██║     ██╔══██╗██║ ██╔╝██╔════╝    ██║     ██╔═══██╗██╔════╝ ██║██╔════╝
 ██║     ███████║█████╔╝ █████╗      ██║     ██║   ██║██║  ███╗██║██║
 ██║     ██╔══██║██╔═██╗ ██╔══╝      ██║     ██║   ██║██║   ██║██║██║
 ███████╗██║  ██║██║  ██╗███████╗    ███████╗╚██████╔╝╚██████╔╝██║╚██████╗
 ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝ ╚═════╝
```

```
               ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~
           ><(((º>          Minnesota Fisheries Intel         <°)))><
               ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~
```

---

# 🎣 LakeLogic — *Your Secret Weapon on the Water*

> *"The difference between a fisherman and a fish whisperer is data."*
> — Some guy who limits out every Sunday

LakeLogic is a **locally-run web app** that arms you with real Minnesota DNR fisheries data — fish stocking records, population surveys, lake depth maps, and species searches — all from the comfort of your browser before you even back the boat in.

No internet on the water? No problem. LakeLogic caches everything locally so you can scout lakes **offline** from your cabin, your truck, or your buddy's couch at 2 AM before a big trip.

---

## ⚙️ How It Works (The Short Version)

```
  [MN DNR Servers]                     [Your Machine]
        |                                    |
        |  -- npm run download -->           |
        |  Fish stocking records             |
        |  Lake survey data          ======> | [data/] folder
        |  Lake metadata                     |
        |                                    |
        |                            [server.js]
        |                            Node.js + Express
        |                            Port 3000
        |                                    |
        |                             [Browser]
        |                             http://localhost:3000
        |                             YOU, sipping coffee,
        |                             picking your honey hole
```

LakeLogic has two modes:

- **📦 Local Mode (preferred):** All data is pre-downloaded and served from disk. Instant results, works offline.
- **🌐 Live Mode (fallback):** If no local data exists, it goes out and scrapes the DNR directly. Slower, but always fresh.

---

## 🚀 Getting Started (5 Minutes to Your First Lake)

### 1. Install Dependencies

```bash
npm install
```

### 2. Download the Lake Data

This is the one-time setup that pulls all the Minnesota fishing data to your machine:

```bash
npm run download
```

> ☕ Go grab a coffee. This downloads stocking records, survey data, and metadata for thousands of Minnesota lakes. It's a big haul.

You can also grab just the lake index if you're impatient:

```bash
npm run download:lakes
```

Or pull a specific year's stocking data:

```bash
npm run download:year -- --year=2023
```

### 3. Fire Up the Server

```bash
npm start
```

Then open your browser to **[http://localhost:3000](http://localhost:3000)** and you're fishing. 🐟

---

## 🗺️ What You Can Do

```
  ┌─────────────────────────────────────────────────────┐
  │                    LakeLogic Features                │
  ├──────────────────┬──────────────────────────────────┤
  │ 🔍 Find a Lake   │ Search by name, click the map,   │
  │                  │ or drop a pin near your cabin     │
  ├──────────────────┼──────────────────────────────────┤
  │ 🐟 Species Hunt  │ "Show me every lake with         │
  │                  │ Walleye within 30 miles of me"    │
  ├──────────────────┼──────────────────────────────────┤
  │ 🧺 Stocking Data │ See exactly when fish were        │
  │                  │ stocked — how many, what size     │
  ├──────────────────┼──────────────────────────────────┤
  │ 📊 Survey Data   │ DNR survey reports: CPUE scores,  │
  │                  │ average weights, size ranges      │
  ├──────────────────┼──────────────────────────────────┤
  │ 📏 Lake Info     │ Depth, acreage, water clarity,    │
  │                  │ littoral zone, nearest town       │
  └──────────────────┴──────────────────────────────────┘
```

---

## 🦟 Species Coverage

LakeLogic recognizes **40+ Minnesota fish species**, including all the classics:

```
  ><(((º>  Walleye               ><(((º>  Northern Pike
  ><(((º>  Muskellunge           ><(((º>  Tiger Muskie
  ><(((º>  Largemouth Bass       ><(((º>  Smallmouth Bass
  ><(((º>  Bluegill Sunfish      ><(((º>  Black Crappie
  ><(((º>  Yellow Perch          ><(((º>  Lake Trout
  ><(((º>  Rainbow Trout         ><(((º>  Brown Trout
  ><(((º>  Brook Trout           ><(((º>  Channel Catfish
  ><(((º>  Lake Sturgeon         ><(((º>  Burbot
               ... and many more
```

---

## 🤓 The Nerdy Stuff (API Endpoints)

For the tinkerers who want to build their own tools on top of this:

| Endpoint | What it does |
|---|---|
| `GET /api/lake-by-id?id=XXXXXXXX` | Full lake profile by DOW ID |
| `GET /api/lakes-by-point?lat=&lon=&radius=` | All lakes within a radius (meters) |
| `GET /api/lake-search?name=` | Search lakes by name |
| `GET /api/fish-stocking?id=` | Stocking history for a specific lake |
| `GET /api/fish-stocking-history?id=` | Detailed year-by-year stocking breakdown |
| `GET /api/fish-survey?id=` | DNR survey data with CPUE & size stats |
| `GET /api/species-search?species=&sort=` | Find lakes with a specific species |
| `GET /api/species-list` | All known species in the local dataset |
| `GET /api/geocode?address=` | Street address → lat/lon (Nominatim) |
| `GET /api/data-status` | How much local data you have cached |

### Species Search Sort Options

```
  sort=recent        →  Most recently surveyed or stocked
  sort=cpue          →  Catch-Per-Unit-Effort (higher = more bites)
  sort=survey_count  →  Total fish counted in surveys
  sort=largest       →  Biggest fish recorded (by length)
  sort=recent_stocked → Most recently stocked lakes first
  sort=quantity      →  Most fish ever stocked
  sort=area          →  Biggest lakes first
  sort=name          →  Alphabetical
```

---

## 📁 Project Structure

```
lakefinder/
│
├── server.js              # The whole backend — Express API + scrapers
├── package.json           # Node dependencies & npm scripts
│
├── public/                # Frontend (served at localhost:3000)
│   ├── index.html         # Main app shell
│   ├── app.js             # All the UI logic
│   └── style.css          # Looks pretty
│
├── scripts/
│   └── download.js        # One-time MN DNR data downloader
│
├── data/                  # Local data cache (built by download.js)
│   ├── lakes.json         # Metadata for all MN lakes
│   ├── stocking/          # Per-lake stocking JSON files
│   └── surveys/           # Per-lake DNR survey JSON files
│
├── Launcher.cs            # GUI launcher source (C#)
└── launcher_ui.ps1        # PowerShell GUI launcher alternative
```

---

## 🪄 Standalone Launcher (No Terminal Required)

Don't want to mess with a terminal? There's a GUI launcher:

- **`LakeLogic Launcher.bat`** — Double-click this to start the server and open the app in your browser automatically.
- **`launcher_ui.ps1`** — Full PowerShell GUI with Start/Stop buttons and live status.

```
  ╔══════════════════════════════╗
  ║   🎣 LakeLogic Launcher      ║
  ╠══════════════════════════════╣
  ║  Status: ● Running           ║
  ║  http://localhost:3000       ║
  ╠══════════════════════════════╣
  ║   [  START  ]  [  STOP  ]   ║
  ╚══════════════════════════════╝
```

---
 
 ## ☁️ Cloud Deployment & Sync
 
 LakeLogic can be deployed to **Google Cloud Run** using the provided `Dockerfile`. It uses **Google Cloud Storage (GCS)** to store and serve the lake data.
 
 ### 💾 Syncing Data to Cloud
 After running a local download or refresh, sync your data to GCS:
 
 ```bash
 npm run upload
 ```
 
 ### 🚀 Redeploying
 To update the server logic or force a fresh data load on the cloud instance:
 
 ```bash
 gcloud run deploy lakelogic --source . --region us-central1
 ```
 
 ---

## 🏕️ Typical Pre-Trip Workflow

```
  SATURDAY NIGHT, 10:30 PM
  ─────────────────────────
  1. Double-click LakeLogic Launcher  .............. ✅
  2. Search "Walleye" within 40 miles of [your spot] ✅
  3. Sort by CPUE — find the honey holes  .......... ✅
  4. Check stocking history — was this lake stocked
     recently, or is it all wild fish?  ............. ✅
  5. Look at survey data — avg weight 2.1 lbs? Nice. ✅
  6. Set alarm for 4:45 AM  ........................ 😴
  7. Limit out by 8 AM  ............................ 🐟🐟🐟
```

---

## 🔒 Privacy & Data

All data comes from the **Minnesota DNR's public API** and website. As this application is a derivative work, we acknowledge the **MNDNR** as the owner and primary contributor of the data and software used. Your fishing secrets stay yours.

Data source: [Minnesota DNR LakeFinder](https://www.dnr.state.mn.us/lakefind/index.html)

---

## 🐛 Troubleshooting

**"No local data found"** at startup?
→ Run `npm run download` first. That's 99% of issues.

**Server won't start on port 3000?**
→ Something else is using that port. Stop it, or change `PORT` in `server.js`.

**Stocking data looks wrong?**
→ The DNR recently changed their website layout, which we've now fixed in the latest version. As of April 2026, we have performed a **full historical refresh (2000–2025)**. If you see missing data for a new year, run `npm run download:year -- --year=<year>`.

**Species showing up with weird codes like `WAE` or `BCS`?**
→ These are DNR shorthand codes. LakeLogic translates them automatically. Here's the full cheat sheet:

```
  -- Game Fish ---------------------------
  WAE  →  Walleye                NOP  →  Northern Pike
  MUE  →  Muskellunge            SXS  →  Saugeye
  SAR  →  Sauger                 WON  →  White Bass

  -- Bass & Panfish ----------------------
  LMB  →  Largemouth Bass        SMB  →  Smallmouth Bass
  BLG  →  Bluegill Sunfish       BOG  →  Bluegill Sunfish
  BLC  →  Black Crappie          BCS  →  Black Crappie
  WHC  →  White Crappie          RKB  →  Rock Bass
  YEP  →  Yellow Perch           PKS  →  Pumpkinseed Sunfish
  PMK  →  Pumpkinseed Sunfish    HSF  →  Hybrid Sunfish
  GSF  →  Green Sunfish

  -- Trout & Salmon ----------------------
  BKT  →  Brook Trout            BNT  →  Brown Trout
  RBT  →  Rainbow Trout          LKT  →  Lake Trout
  LAT  →  Lake Trout             SPK  →  Splake
  TLC  →  Tullibee (Cisco)

  -- Catfish & Bullheads -----------------
  CCF  →  Channel Catfish        FHC  →  Flathead Catfish
  BRB  →  Brown Bullhead         BKB  →  Black Bullhead
  BLB  →  Black Bullhead         YEB  →  Yellow Bullhead

  -- Other Sportfish ---------------------
  LKS  →  Lake Sturgeon          PSH  →  Paddlefish
  BUR  →  Burbot                 BOF  →  Bowfin (Dogfish)

  -- Rough Fish & Carp -------------------
  COC  →  Common Carp            CAP  →  Common Carp
  GZS  →  Gizzard Shad          QIL  →  Quillback
  WTS  →  White Sucker           WHS  →  White Sucker

  -- Minnows, Shiners & Darters ----------
  FHM  →  Fathead Minnow         GOS  →  Golden Shiner
  BNM  →  Bluntnose Minnow       CSH  →  Common Shiner
  BNS  →  Blacknose Shiner       SPO  →  Spottail Shiner
  SFS  →  Spotfin Shiner         BKS  →  Blackchin Shiner
  PGS  →  Pugnose Shiner         FTD  →  Finescale Dace
  BND  →  Blacknose Dace         LND  →  Longnose Dace
  CRC  →  Creek Chub             CNM  →  Central Mudminnow
  JND  →  Johnny Darter          IOD  →  Iowa Darter
  LED  →  Least Darter           TPM  →  Tadpole Madtom
  BST  →  Brook Stickleback
```

---

```
              ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~
          ><(((º>     Good luck out there!     <°)))><
              ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~

         "Give a man a fish and you feed him for a day.
          Give a man LakeLogic and he comes home with
          a cooler full every single weekend."
```

---

*Built for Minnesota anglers, by a Minnesota angler. 🎣*
