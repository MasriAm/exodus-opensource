[![100% Local](https://img.shields.io/badge/Privacy-100%25_Local-028090?style=for-the-badge)](https://github.com/MasriAm/exodus-opensource)
[![Open Source](https://img.shields.io/badge/Open_Source-Yes-5F4B66?style=for-the-badge)](https://github.com/MasriAm/exodus-opensource)
[![Hackathon](https://img.shields.io/badge/Reclaim-Hackathon-2C1320?style=for-the-badge)](https://github.com/MasriAm/exodus-opensource)

---

## `ABOUT THE PROJECT`

Instagram and WhatsApp data exports are sterile, overwhelming, and usually sit gathering digital dust. **Exodus** turns those gigabytes of raw JSON and chat exports into a personal time capsule.

It is a Spotify Wrapped–style experience plus a full reading desk for your archive. Everything runs entirely in your browser to unearth forgotten relationships, past digital identities, and slightly embarrassing digital footprints.

No servers. No data harvesting. Just you and your history.

---

## `THE FEATURES`

Instead of sterile charts and corporate graphs, your data is presented as a continuous, interactive diary entry.

* **`>> THE REAL ONES`**
  * *The Library Checkout Card.* Before the algorithm, there was chronological order. This ledger extracts your longest-standing mutuals and calculates exactly how many years you've been connected.
* **`>> THE CHAT ERAS`**
  * *The Receipt.* A printed receipt detailing your peak texting eras. It scans your top conversations to reveal your longest phone calls, total message counts, and your most overused words.
* **`>> THE IDENTITY CRISIS`**
  * *The Stack.* You've changed your bio and username more times than you think. This interactive card stack lets you flip through your past digital identities.
* **`>> THE CRINGE`**
  * *The Redacted File.* A slot machine of nostalgia. We pull public comments from your export so you can laugh at exactly who you used to be.
* **`>> THE ARTIFACT`**
  * *The Polaroid.* We dig to the very bottom of your history to uncover and apply a 1970s analog film wash to early images from your DMs.
* **`>> THE INTERESTS`**
  * *The Algorithm.* While you were scrolling, the machine was taking notes. An interactive timeline that reveals how Meta's algorithmic view of your interests shifted year by year.
* **`>> THE READING DESK`**
  * After Wrapped, browse messages, people, media, calendar heatmaps, search, footprint, and local spreadsheet/JSON export — still fully offline.

---

## `SECURITY CLEARANCE: PRIVACY FIRST`

> **"If it's nostalgic, it's probably deeply personal."**

Instagram and WhatsApp exports contain DMs, search histories, and private photos. Because of this, the architecture is strictly client-side.

1. You drop your `.zip` file into the browser.
2. A Web Worker reads the archive on demand with `@zip.js/zip.js`, parses only what is needed, and loads rows into DuckDB-Wasm in memory.
3. **Everything is processed locally.** Your memories never leave your machine. There are no API routes and no uploads.

---

## `THE MAGIC`

Parsing large exports in a browser without crashing the tab is the hard part. While the data processes, users are greeted by the loading scenes:

* *Dusting off your old DMs...*
* *Finding out who your real friends are...*
* *Locating your most embarrassing comments...*

---

## `INITIATING SEQUENCE (RUN LOCALLY)`

Want to uncover your own history?

1. **Get your data:** Open Instagram → Settings → Your activity → Download your information (or Meta Accounts Center → Export your information). Select **JSON** format, not HTML. Choose a date range (use **All time** for the fullest archive). WhatsApp chat exports are also supported.
2. **Clone the archive:**

```bash
git clone https://github.com/MasriAm/exodus-opensource.git
cd exodus-opensource
```

3. **Install and run:**

```bash
npm install
npm run fixtures
npm run dev
```

Open `http://localhost:3000`, then drop your export or try the synthetic demo archive.

Other useful scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run preview`.

---

## `LICENSE`

MIT
