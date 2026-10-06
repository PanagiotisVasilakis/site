# Dolce Far Niente · Kalamata: visual identity and design system

Final design system and implementation spec (R3-V1 output). This is `docs/design/identity.md`; the local mockups and screenshots it cites live in the gitignored `.runtime/design/` of the lead's machine and are not part of the repository.

- **Status:** decided by the design lead on 2026-09-28 under owner decision O32 ("take the design decisions yourself; 3D, motion, something strong; make it wow"). G-DESIGN is a lead self-review.
- **Implementation (2026-10-06):** R3-V2 to R3-V14 are done. R3-V12b deleted the legacy style sheets (`src/styles/01…13`), so references to them below are history. §11 shows the current file layout; the migration plan (§12) is kept as the record of how the system was introduced. The owner-approved marketing copy of R3-C1 is applied (2026-10-06; the `// C1 review` draft markers are removed), and the remaining owner inputs in §13 are open.
- **Scope:** every public route (en/el), the guest portal, and the admin (tokens only).
- **Authority:** where this document and a mockup disagree, this document wins. The mockups in `.runtime/design/` are visual references only. Their JS is not production code.
- **Evidence labels:** CONFIRMED means read in the code or docs of the installed version, or computed/measured here. SUSPECTED means not yet verified; each SUSPECTED item names the check that settles it.

---

## 0. Decision

### 0.1 Winner

The panel scored seven criteria (wow, usability, conversion, performance, accessibility, brand fit, Greek typography), each 0–10. Sums were computed from the three judges' JSON:

| Direction | Judge 1 | Judge 2 | Judge 3 | **Total** | Usability + performance | Winner votes |
|---|---|---|---|---|---|---|
| **messinian-light** | 57.5 | 58.0 | 58.5 | **174.0** | 51.0 | 3 of 3 |
| aegean-depth | 52.5 | 52.0 | 51.5 | 156.0 | 39.5 | 0 |
| kalamata-playful | 50.0 | 49.5 | 51.0 | 150.5 | 46.5 | 0 |

**Base: messinian-light.** No tie-break was needed.

Its weakness is "wow" (7, 7 and 8 against aegean's 8.5, 9 and 9). The grafts in §0.2 exist to close that gap without giving up its performance, accessibility and honesty.

### 0.2 Grafts: accepted and rejected

**Accepted.** Each graft is listed with the judges who proposed it.

1. **From aegean (all 3 judges):** the hero **recedes into depth** on the first scroll. The photo stage tilts back and darkens (`rotateX 16°`, `scale .86`). It is CSS scroll-driven and chained with messinian's one-time light sweep.
2. **From aegean (all 3):** a **bilingual kinetic serif band** right after the fact strip. EN is an outline serif; EL is a terracotta (`primary-text`, both themes) italic reading "Ταΰγετος ✦ Μεσσηνιακός κόλπος ✦ Καλαμάτα". It is scroll-linked, never loops, and is `aria-hidden`.
3. **From aegean (all 3):** a **3D deck-fan gallery** at ≥ 1024 px. Captions show on the active card only. Below 1024 px, messinian's native scroll-snap coverflow stays.
4. **From aegean (all 3):** an **in-page "Reduce motion" switch** in the footer and the mobile menu, on top of `prefers-reduced-motion`.
5. **From aegean and playful (judges 1 and 3):** a **circular View Transition reveal** from the Day/Night switch, when motion is allowed.
6. **From aegean (judges 1 and 2):** Greek month names in the nominative in calendar headings, and the climate fee broken down by season in the summary.
7. **From aegean (judge 3):** a live-region message "Now pick your check-out, latest <date>".
8. **From playful (all 3):** the rule for a range that crosses a booked night: the tapped day becomes the new check-in, and the live region explains why.
9. **From playful (judges 2 and 3):** the **lowest price shown as a pill** on the price, not a dot. Mobile months are **stacked** (Airbnb pattern). A **sticky total bar** appears once a stay is selected.
10. **From playful (all 3):** **Summer/Winter highlights** tied to the real climate-fee seasons (April–October / November–March, `src/data/stayPolicy.ts:41-48`).
11. **From playful (all 3):** guide **search**, **category chips with counts**, **favourites with a heart burst**, and **Directions**.
12. **From playful (judges 2 and 3):** in the stay hub, an **SOS row with `tel:112`**, direct `tel:` call rows, and a skip link. The skip link already exists in `src/app/[locale]/layout.tsx`.
13. **From playful (judges 2 and 3):** **art-directed hero crops in several widths** (§7.2).
14. **From playful (judge 1):** tactile button press: `scale(.98)` on active and a 2 px lift on hover (fine pointers only).
15. **From playful (judge 2):** teaser copy that explains the "from" price ("Lowest prices from Sun 18 Oct"), and a "Free tonight / next free night" hint in the bottom bar.

**Rejected:**

- **Continuously animating WebGL sea (aegean).** It drains the battery, needs a second WebGL context, and implies a sea view that no photo proves.
- **Beach props: swim ring, lemon, stickers (playful).** They conflict with the brand.
- **"Facing the Messinian Gulf" copy.** No photo shows the gulf.
- **Dark-mode "descent" background (judge 1, optional).** It adds little over the sun/moon glow and costs paint.
- **Indigo/gold night palette (aegean).** It reads as a hotel bar.

### 0.3 Fixes applied to the base before implementation

Every fix the judges raised against messinian-light is resolved in this spec:

- **Double price in the first viewport at 1440 px.** The fact strip no longer shows a price (§9.1).
- **Headline cut off at 390 px** ("A slow walk through the rooms", SUSPECTED). The rooms section now uses its own reveal, and V5's G-VIS must show it uncut.
- **Soft mobile hero.** New portrait crops (§7.2).
- **Copy:** "You stay here" becomes "You're staying here".
- **Greek uppercase.** `.night__dow` and the weekday `abbr` elements no longer use uppercase under `:lang(el)` (§2.6).
- **Text size.** Nothing renders below 12 px; calendar prices are 12 px.
- **Emergency number.** `tel:112` link in the hub.
- **Grid overflow.** Grids always use `minmax(0, 1fr)`.
- **Missing photo tiles.** Illustrated guide tiles become a deliberate "art tile" instead of beige or striped placeholders.
- **Placeholders.** Never shipped; missing owner data hides the field (§1.4).

### 0.4 Reference screenshots (winning mockup)

Folder: `.runtime/design/messinian-light/shots/`. Every file was captured under the production CSP shape, with 0 violations according to the mockup's `tools/shoot.mjs` report.

| Screen | Files |
|---|---|
| Home, full page | `home-390-light.png`, `home-390-dark.png`, `home-1440-light.png`, `home-1440-dark.png`, `home-390-reduced.png`, `home-390-light-el.png` |
| Availability, full page | `availability-390-light.png`, `availability-390-dark.png`, `availability-1440-light.png`, `availability-1440-dark.png`, `availability-390-reduced.png` |
| Stay hub + guide, full page | `stay-390-light.png`, `stay-390-dark.png`, `stay-1440-light.png`, `stay-1440-dark.png`, `stay-390-reduced.png`, `stay-390-light-el.png` |
| Motion frames | `frame-hero-webgl-1440.png`, `frame-hero-webgl-390.png`, `frame-shutters-opening-1440.png`, `frame-relief-1440.png`, `frame-coverflow-390.png` |
| Measured hero contrast | `hero-contrast.json` |

Graft references, for look only:

- **aegean-depth** (`.runtime/design/aegean-depth/shots/`): `frame-1440-dark-hero-receding.png` (recede and kinetic band) and `frame-1440-dark-deck.png` (deck fan). **Do not copy** its empty dark caption boxes.
- **kalamata-playful** (`.runtime/design/kalamata-playful/shots/`): `availability-390-light-viewport.png` (sticky total bar) and `guide-1440-light.png` (search, chips with counts, favourites).

Mockup sources to read for exact geometry, as reference only:

- `messinian-light/styles.css`
- `messinian-light/hero-gl.js`
- `messinian-light/tools/gen-assets.mjs`
- `aegean-depth/styles.css:283-287`, `:355-374` and `:736-856`

---

## 1. Concept and brand voice

### 1.1 Concept: "Messinian light"

The site is built around the one thing the photos prove: a sunlit second-floor balcony that looks over the rooftops to Mount Taygetos.

- **Day mode** is warm sand paper with terracotta (the bedroom wall), olive (the balcony plants) and the deep blue of the gulf.
- **Night mode ("gulf night")** is deep sea blue, not grey.
- **Motion follows light and real objects of the place.** A living photograph gains depth; one warm pass of light crosses Taygetos. Greek louvred shutters swing open. A paper relief runs from Taygetos to the gulf. A sun glow moves east to west as you scroll and becomes moonlight at night.

### 1.2 Name and taglines

- **Brand:** "Dolce Far Niente · Kalamata" (O27).
- **Wordmark:** "Dolce Far Niente" in Noto Serif Display italic 400. Beneath it, "Kalamata" / "Καλαμάτα" in Commissioner 600. The Latin label is set in uppercase with tracking `.18em`; the Greek label is sentence case with tracking `.04em`.
- **H1 on Home:** "Dolce far niente" in both locales. It is Italian and the brand, so it carries `lang="it"`.

| Use | EN | EL |
|---|---|---|
| Primary tagline (hero lede opening, OG description) | Slow days on a sunlit balcony in Kalamata. | Αργές μέρες σε ένα ηλιόλουστο μπαλκόνι στην Καλαμάτα. |
| Secondary (location band, share cards) | Taygetos at breakfast, the gulf a short drive away. | Ο Ταΰγετος στο πρωινό σας, ο κόλπος λίγα λεπτά με το αυτοκίνητο. |
| Stay hub greeting | Welcome home. | Καλώς ήρθατε. |
| Kinetic band (decorative, both locales) | Taygetos ✦ Messinian Gulf ✦ Kalamata | Ταΰγετος ✦ Μεσσηνιακός κόλπος ✦ Καλαμάτα |

The final marketing strings belong to R3-C1, which the owner approves. The taglines above are the voice reference and the defaults.

### 1.3 Voice rules (both languages)

- **Warm, unhurried, precise.** Short sentences. Numbers beat adjectives: "90 m²", "50 m from the Town Hall", "2nd floor".
- **Person.** The host letter uses "we"; everything else addresses the guest as "you". The EL formal plural ("σας") is the default.
- **Banned words:** "luxury", "paradise", "hidden gem", "best price".
- **No direct-booking wording.** Never say "cheaper if you book direct" or anything like it, and never offer a discount for booking off Airbnb (plan §3; Airbnb Off-Platform policy).
- **Greek is written, not translated.** Use natural Greek word order; month headings in the nominative ("Οκτώβριος 2026") and dates in the genitive ("18 Οκτωβρίου"). This is what `Intl` `el-GR` produces: CONFIRMED on Node 22.19.0 and 26.8.1 (`{month:'long',year:'numeric'}` gives "Οκτώβριος 2026"; `{day:'numeric',month:'long'}` gives "18 Οκτωβρίου"). Prices use `formatCents` (`src/lib/availability/money.ts:30`): "85 €" in el and "€85" in en.

### 1.4 Honesty rules (binding)

1. **Sea view.** *Superseded by owner decision O45 (2026-10-04): the owner confirms the sea view, so copy and the amenity list may state it. The text below is kept for history.*
   - No photo shows the Messinian Gulf (assets research §1), so no copy claims a sea view. Copy says "the gulf a short drive away".
   - The gulf appears only on the relief map, which is labelled "Illustrative map, not to scale".
   - The claim unlocks only when the owner supplies a real balcony photo that shows the gulf (§7.4).
2. **No synthetic night.** Night mode tints the hero photo cooler as a theme treatment. It never presents a fake dusk photo.
3. **No placeholder ever ships.** If owner data is missing (host name, portrait, languages, reply time, Airbnb URL, reviews), the component omits that field or section. It never shows `[placeholder]`, `#` links or invented values.
4. **Prices and availability come only from the availability repository (R3-F05–F09).**
   - The "from €X / night" line is the lowest rate over the next 60 nights that can be booked.
   - Without data, the line reads "See prices & free dates" and shows no number.
   - Every total carries "Final price confirmed on Airbnb; Airbnb's own fees may apply."
5. **Reviews, rating and Superhost** appear only from the owner's real Airbnb data. The optional `ReviewsStrip` slot stays empty otherwise.

---

## 2. Typography

### 2.1 Fonts (final)

| Role | Family | Licence | Greek verified | Source |
|---|---|---|---|---|
| Display: H1–H3, numerals, quotes, wordmark | **Noto Serif Display** (variable, wght 100–900; italic) | SIL OFL 1.1, no Reserved Font Name | Yes. `greek` and `greek-ext` in METADATA.pb; `el_Grek` in the Google Fonts metadata; 72/72 monotonic codepoints (fonts research) | https://github.com/google/fonts/tree/main/ofl/notoserifdisplay |
| Text and UI | **Commissioner** (variable, wght 100–900), by Kostas Bartsokas, Thessaloniki | SIL OFL 1.1, no Reserved Font Name | Yes. `greek` in METADATA.pb; `el_Grek`; 72/72 | https://github.com/google/fonts/tree/main/ofl/commissioner |

**Why these two.**

- Noto Serif Display is the only verified high-contrast Didone-style display serif with full Greek.
- Commissioner is a warm, humanist-leaning grotesk from a Greek designer.
- The usual premium serifs have no Greek subset and are excluded: Playfair, Cormorant, Fraunces, Instrument Serif and Bodoni Moda (fonts research §2).

### 2.2 Files (woff2 subsets) and budget

**Where the files come from.**

- The files are the pre-subset woff2 builds in the npm packages `@fontsource-variable/noto-serif-display@5.3.0` and `@fontsource-variable/commissioner@5.3.0`. Those packages are built from the google/fonts sources.
- Fetch them with `npm pack <pkg>@5.3.0`: download only, **not** a dependency, nothing added to `package.json`. Before fetching, re-check the npm registry certificate issuer as O29 requires, and stop if interception is back.
- Extract only the six files below, plus each package's `LICENSE` saved as `OFL-<Family>.txt`.
- Record the SHA-256 of each committed file in `src/app/fonts/SOURCES.txt`, together with the package name, version and tarball integrity.
- **latin-ext is deliberately not shipped.** The Noto Serif Display latin-ext file is 174,044 B, and EN/EL copy has no latin-ext characters. Rare characters, such as foreign guest names, fall back to the metric-adjusted system face.

Sizes are exact bytes from the jsDelivr data API for fontsource 5.3.0, fetched 2026-09-28:

| File (committed to `src/app/fonts/`) | Bytes | Preload | Needed by |
|---|---|---|---|
| `commissioner-latin-wght-normal.woff2` | 36,700 | **yes** (the only preloaded font) | All text, both locales (digits, €, punctuation) |
| `commissioner-greek-wght-normal.woff2` | 15,380 | no | EL text; "ΕΛ" in the language switch on EN pages |
| `noto-serif-display-latin-wght-normal.woff2` | 41,232 | no | Latin headings |
| `noto-serif-display-latin-wght-italic.woff2` | 49,264 | no | H1 "Dolce far niente", wordmark, italic accents |
| `noto-serif-display-greek-wght-normal.woff2` | 30,004 | no | EL headings |
| `noto-serif-display-greek-wght-italic.woff2` | 33,808 | no | EL italic accents; kinetic band EL row (both locales) |
| **Total** | **206,388** | 36,700 critical | |

**Budget:**

- **Preloaded:** ≤ 40 KB (Commissioner latin only).
- **All fonts on any single page:** ≤ 210 KB. Roughly 176 KB on EN Home and 206 KB on EL Home.
- **Unicode ranges stop unneeded downloads.** A subset file is fetched only when the page renders glyphs in its unicode-range. Files are content-hashed and immutable-cached under `/_next/static/media`.
- **Why the display italic is not preloaded.** The Home LCP element is the hero `<img>`; the budget keeps the critical path for the image.
  - The H1 first renders in the metric-adjusted Times New Roman fallback and swaps when the font arrives.
  - V13 measures LCP with and without preloading `noto-serif-display-latin-wght-italic` and keeps the preload only if LCP stays ≤ 2.5 s (§5.10).
  - **Result (R3-V13):** the preload is not added; it raised the measured LCP by 170–205 ms.

### 2.3 `next/font/local` usage

**How this was verified.**

- CONFIRMED by reading the webpack loader:
  - `node_modules/next/dist/compiled/@next/font/dist/local/loader.js:31-45` applies `declarations` to **every** `src` file of one call, so per-file `unicode-range` inside one call is impossible.
  - `get-fallback-metrics-from-font-file.js` computes fallback metrics from Latin letters (`'aaabcdeeeefghiijklmnnoopqrrssttuvwxyz'`), so the adjusted fallback must come from a latin file.
  - `postcss-next-font.js` sets the CSS variable to `'<family>', '<family> Fallback', ...fallback`.
- **Design:** one call per **subset**. Each call holds the upright and italic files of that subset and declares its own `unicode-range`. The subsets are then stacked in one CSS font stack: Greek first, then Latin with its metric-adjusted fallback, then system fonts. The ranges do not overlap, so each glyph resolves to exactly one webfont.
- **Rule: next/font arguments must be literals.** Inline the range strings; do not reference constants.

```ts
// src/app/fonts/fonts.ts  (module scope, one const per call)
import localFont from 'next/font/local';

export const textLatin = localFont({
  src: [{ path: './commissioner-latin-wght-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-text-latin',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});

export const textGreek = localFont({
  src: [{ path: './commissioner-greek-wght-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-text-greek',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' }],
});

export const displayLatin = localFont({
  src: [
    { path: './noto-serif-display-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './noto-serif-display-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-display-latin',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  declarations: [{ prop: 'unicode-range', value: '<same latin range as textLatin>' }],
});

export const displayGreek = localFont({
  src: [
    { path: './noto-serif-display-greek-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './noto-serif-display-greek-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-display-greek',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: '<same greek range as textGreek>' }],
});
```

**Where the classes go.**

- The root layout (`src/app/layout.tsx`) sets `className={[textLatin, textGreek, displayLatin, displayGreek].map(f => f.variable).join(' ')}` on **`<html>`**, not on `<body>`.
- Reason: `--font-text` and `--font-display` are declared on `:root` and substitute these variables there.

The unicode ranges are the fontsource 5.3.0 `unicode.json` values, CONFIRMED by fetch. The Latin range does not contain `→` (U+2192) or `✦` (U+2726), so those are never typed as text; use the SVG icons in §6.

```css
/* in @theme (src/styles/tokens.css) */
--font-text: var(--font-text-greek), var(--font-text-latin), "Segoe UI", Roboto, "Noto Sans", system-ui, sans-serif;
--font-display: var(--font-display-greek), var(--font-display-latin), Georgia, "Noto Serif", serif;
```

**Open verification (SUSPECTED).** The build uses Turbopack (`next.config.ts` has `turbopack.root`), whose next/font implementation is native code I could not read. The R3-V2 spike must check, in `.next/static/css` and in a network log of a production build (`npm run build && npm start`):

1. Four font families are emitted, each with its `unicode-range`.
2. Only the Commissioner latin file gets `<link rel="preload">`.
3. An EN page without Greek glyphs does not request the Greek files.

**Result (R3-V2a):** all three checks passed on a production build, so the fallback below was not needed.

**Fallback if the check fails:** plain `@font-face` rules in `src/styles/fonts.css` using `url('../app/fonts/<file>.woff2')`, which the bundler emits as hashed immutable assets, with the same unicode-ranges. Fallback metrics are then hand-written from a one-off run of `get-fallback-metrics-from-font-file.js`, and there is no preload.

### 2.4 Weights and features

| Face | Weights used | Notes |
|---|---|---|
| Commissioner | 400 body · 500 nav, labels, chips · 600 buttons, prices, `strong` · 700 tile titles and the SOS number | No italic file is shipped. Emphasis in running text uses weight 600, never italic |
| Noto Serif Display | 400 upright (all display sizes) · 400 italic (H1, wordmark, `em` accents in headings, quotes, host letter title) | Italic accent colour: `primary-text` (light) / `primary-text` dark value |

- `font-synthesis: none` on `html`, so no fake bold or italic in Greek.
- `font-variant-numeric: tabular-nums lining-nums` on prices, dates, distances and the fact strip.
- `text-wrap: balance` on headings; `text-wrap: pretty` on paragraphs.
- `hyphens: manual`.
- All Greek strings in `src/i18n` must be NFC-normalized (precomposed tonos), because the Greek subset has no combining U+0301. Add the assertion `s === s.normalize('NFC')` to the existing i18n parity test in R3-V2.

### 2.5 Type scale (fluid)

Sizes at 390 px and 1440 px are computed from the clamp formulas. They are Tailwind `@theme` tokens (`--text-*`, with `--text-*--line-height`).

| Token | CSS value | ≈390 | ≈1440 | Face / weight | Line height | Tracking | Use |
|---|---|---|---|---|---|---|---|
| `--text-hero` | `clamp(4rem, 1.9rem + 9.6vw, 8.75rem)` | 68 | 140 | display italic 400 | .86 | −.025em | Home H1 only |
| `--text-d1` | `clamp(2.75rem, 1.7rem + 4.6vw, 5.5rem)` | 45 | 88 | display 400 | 1.02 (el 1.08) | −.015em | Page H1, contact title |
| `--text-d2` | `clamp(2.25rem, 1.55rem + 3vw, 4rem)` | 36 | 64 | display 400 | 1.02 (el 1.08) | −.015em | Section titles |
| `--text-d3` | `clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem)` | 29 | 40 | display 400 / italic | 1.12 (el 1.15) | −.01em | Quotes, letter title, FAQ title, month caption on desktop |
| `--text-h3` | `1.375rem` | 22 | 22 | display 400 | 1.15 | 0 | Card and tile titles |
| `--text-lead` | `clamp(1.125rem, 1.04rem + .45vw, 1.375rem)` | 18 | 22 | text 400 | 1.55 | 0 | Intros, hero lede |
| `--text-body` | `clamp(1rem, .96rem + .2vw, 1.0625rem)` | 16 | 17 | text 400 | 1.6 | 0 | Body |
| `--text-caption` | `.9375rem` | 15 | 15 | text 400/500 | 1.45 | 0 | Captions, chips, secondary text |
| `--text-label` | `.8125rem` | 13 | 13 | text 600 | 1.3 | .16em (en uppercase) / .04em (el) | Eyebrows, legends |
| `--text-micro` | `.75rem` | 12 | 12 | text 600 | 1.2 | 0 | Calendar prices, fine print. **The minimum size anywhere** |
| `--text-fact` | `clamp(2.25rem, 1.8rem + 1.2vw, 3rem)` | 36 | 48 | display 400, tabular | 1 | −.02em | Fact numerals |

Measure: running text ≤ 65ch; lead ≤ 38em.

### 2.6 Greek rules (binding)

- **No `text-transform: uppercase` under `:lang(el)`.** Safari and iOS keep the tonos (caniuse, fonts research §4.4); for example the short weekday "Τρί" would render as "ΤΡΊ". Eyebrows, weekday headers, the wordmark place label, chips and legends use sentence case with tracking `.04em` in Greek.
- Add `:lang(el) { --lh-display-extra: .06 }` for Greek display line-heights (values in the table above).
- The language switch label is written "ΕΛ" by hand, not produced by transforming "ελ".
- Mixed-language fragments carry `lang`: the H1 `lang="it"`, the kinetic band rows `lang="en"` / `lang="el"`.

---

## 3. Colour

### 3.1 Architecture

**Where the tokens live.**

- Semantic tokens are defined once in Tailwind `@theme` (`src/styles/tokens.css`), in the `--color-*` namespace, which generates `bg-*`, `text-*` and `border-*` utilities.
- Dark values override the same tokens, and **only** at token level, inside `@layer base`:

```css
@layer base {
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { color-scheme: dark; /* dark token values */ }
  }
  :root[data-theme="dark"] { color-scheme: dark; /* identical dark token values */ }
}
```

**Rules:**

- A unit test (`tests/unit/design-tokens.test.ts`, R3-V2) parses `tokens.css`. It asserts that the two dark blocks are identical and that every `--color-*` has a dark value.
- The same test computes every text/background pair in §3.3 with the WCAG formula and fails below the stated minimum. This automates G-CONTRAST.
- New code must not use Tailwind `dark:` colour utilities or per-component dark selectors. R3-V12b removed the legacy `@custom-variant dark` from `src/app/globals.css`, so a `dark:` utility would now fall back to Tailwind's default (OS preference only) and ignore a stored theme choice.
- No `light-dark()`: iOS Safari before 17.5 lacks it, and an invalid custom-property substitution would drop every colour.
- Token names were chosen so they did not collide with the legacy `:root` variables (`--fg-muted`, `--radius-*`, `--shadow-*`, `--font-sans`, and so on in `src/styles/01-tokens.css`, deleted in R3-V12b).

### 3.2 Tokens

| Token (`--color-…`) | Light | Dark | Role |
|---|---|---|---|
| `bg` | `#F6F0E6` | `#0A1A21` | Page (sand paper / gulf night) |
| `surface` | `#FFFBF5` | `#10252E` | Cards, calendar months |
| `surface-sunken` | `#EDE4D5` | `#0D2129` | Quiet bands, notes, booked cells, hover |
| `surface-raised` | `#FFFFFF` | `#163340` | Dialogs, menu sheet, popovers, toasts |
| `glass` | `rgb(246 240 230 / .84)` | `rgb(10 26 33 / .80)` | Header pill, bottom bars (with `backdrop-filter: blur(16px) saturate(1.2)`) |
| `fg` | `#1C2528` | `#F2EBDF` | Body text, headings |
| `fg-muted` | `#57524C` | `#A9B6BA` | Secondary text, prices per night, placeholders |
| `fg-on-photo` | `#FFF8EE` | `#FFF8EE` | Text on photo scrims (hero, captions) |
| `fg-on-photo-accent` | `#FFE2C0` | `#FFE2C0` | Eyebrow and price line on the hero |
| `primary` | `#A0452A` | `#E8946F` | Primary action fill (terracotta) |
| `primary-hover` | `#8A3A22` | `#F0A585` | Primary hover |
| `primary-fg` | `#FFFFFF` | `#1B100B` | Text and icons on primary |
| `primary-text` | `#8F3D24` | `#F2A585` | Terracotta used as text: eyebrows, totals, italic accents |
| `primary-tint` | `rgb(160 69 42 / .12)` | `rgb(232 148 111 / .16)` | Tints: calendar range, icon discs |
| `accent` | `#0D5568` | `#80CCDA` | Links, secondary button text, info (deep sea) |
| `accent-hover` | `#0A4454` | `#A5DDE7` | Link hover |
| `accent-fg` | `#FFFFFF` | `#0A1A21` | Text on an accent fill (rare: active step, map number disc) |
| `olive` | `#4F5E33` | `#BCCA8B` | Guide categories, "best price" text |
| `sun` | `#F0A95B` | `#F4B878` | **Decorative only** (logo sun, glow, shutter light). Never text on `bg` in light mode (1.76:1) |
| `border` | `rgb(28 37 40 / .13)` | `rgb(242 235 223 / .12)` | Decorative hairlines, card edges |
| `border-strong` | `rgb(28 37 40 / .28)` | `rgb(242 235 223 / .26)` | Outlined buttons and chips (their text identifies them; not a 1.4.11 boundary) |
| `border-control` | `#8A8178` | `#6E8389` | Input, checkbox and select boundaries (≥ 3:1) |
| `focus` | `#0D5568` | `#F4B878` | Focus ring: 3 px solid, offset 3 px |
| `success` / `success-bg` | `#2F6230` / `#E1EBD6` | `#9ED49A` / `#15301F` | Confirmations |
| `warning` / `warning-bg` | `#7A4B00` / `#F7E4C2` | `#F2C27A` / `#33270F` | Stale data, minimum-stay notes, blocked-range notes |
| `danger` / `danger-bg` | `#A1232B` / `#F8DEDB` | `#F4A3A0` / `#3A1719` | Errors (a crimson, distinct from the terracotta primary) |
| `info-bg` | `#DCEBEE` | `#0E3440` | Info callouts (text is `accent`) |
| `band-bg` | `#0C3440` | `#0F303B` | Deep-gulf bands: location, portal tile. Dark in both themes |
| `band-fg` | `#F6EFE4` | `#F2EBDF` | Text on bands |
| `band-muted` | `#B9CBCF` | `#A9C0C6` | Secondary text on bands |
| `band-accent` | `#F2B27A` | `#F4B878` | Accent text and CTA fill on bands and the warm band |
| `band-accent-fg` | `#231510` | `#231510` | Text on a `band-accent` fill |
| `band-line` | `rgb(246 239 228 / .20)` | `rgb(242 235 223 / .20)` | Rules on bands |
| `band-focus` | `#F2B27A` | `#F4B878` | Focus ring on bands and photos |
| `warm-1` / `warm-2` / `warm-3` | `#7A3522` / `#3B1D14` / `#24130E` | `#5E2A1B` / `#2A1610` / `#140B08` | Contact "sunset" band: `radial-gradient(120% 140% at 85% 0%, warm-1, warm-2 55%, warm-3)` |
| `warm-muted` | `#F0D9C8` | `#F0D9C8` | Secondary text on the warm band |
| `cal-free-bg` | = `surface` | = `surface` | Free night cell |
| `cal-price` | = `fg-muted` | = `fg-muted` | Price inside a cell |
| `cal-booked-bg` | = `surface-sunken` | = `surface-sunken` | Booked cell base |
| `cal-booked-hatch` | `rgb(28 37 40 / .12)` | `rgb(242 235 223 / .10)` | 135° stripes: 1.5 px stripe, 7 px period |
| `cal-booked-fg` | = `fg-muted` | = `fg-muted` | Struck-through date on booked cells |
| `cal-selected-bg` / `cal-selected-fg` | = `primary` / `primary-fg` | = `primary` / `primary-fg` | Check-in and check-out cells |
| `cal-range-bg` | = `primary-tint` (over `surface`: `#F4E5DD`) | = `primary-tint` (over `surface`: `#333738`) | Nights between check-in and check-out |
| `cal-best-bg` / `cal-best-fg` | `#E2E8CC` / `#3A4722` | `#2A3A22` / `#D6E2A6` | Lowest-price pill |
| `viewer-bg` | `#0E1418` | `#0E1418` | Lightbox backdrop (fixed dark in both themes) |
| `map-sea` | `#0A4A5C` | `#07303B` | Relief map sea |
| `map-land` | `#EFE6D6` | `#1E3E48` | Relief map land |
| `map-c1` … `map-c4` | `#DDCDB2`, `#CCB793`, `#B99E76`, `#A2865F` | `#28505C`, `#33616E`, `#427483`, `#5A8C9A` | Contour layers |
| `map-coast` / `map-wave` / `map-road` / `map-street` | `#F2B27A` / `rgb(170 222 232 / .38)` / `#FFFFFF` / `rgb(28 37 40 / .13)` | `#F4B878` / `rgb(128 204 218 / .30)` / `rgb(242 235 223 / .35)` / `rgb(242 235 223 / .07)` | Relief map details |
| `pin-bg` / `pin-fg` | `#FFFBF5` / `#1C2528` | same | Map pins are paper objects, the same in both themes |
| `pin-home-bg` / `pin-home-fg` | `#A0452A` / `#FFFFFF` | same | "You're staying here" pin |
| `shutter` / `shutter-hi` / `shutter-lo` / `shutter-frame` / `frame` | `#3C6258` / `#52806F` / `#294740` / `#31554C` / `#E4D8C4` | `#2B4B44` / `#3B6459` / `#1C332E` / `#233F39` / `#1A343D` | Greek shutter green and window frame (decorative) |
| `glow` | `rgb(240 169 91 / .20)` | `rgb(128 204 218 / .08)` | Sun path (day) and moonlight (night) |

**Non-colour atmosphere tokens:**

- `--scrim: 8 22 28` (an RGB triple used as `rgb(var(--scrim) / α)`).
- `--hero-tint`: `transparent` (light) / `linear-gradient(180deg, rgb(20 50 72 / .55), rgb(10 26 33 / .35))` (dark), applied as a multiply layer over the hero.
- `--grain`: `url(/design/grain-light.webp)` (light) / `url(/design/grain-dark.webp)` (dark).

**Theme colour.**

- Next `viewport.themeColor`: `[{ media: '(prefers-color-scheme: light)', color: '#F6F0E6' }, { media: '(prefers-color-scheme: dark)', color: '#0A1A21' }]`. This replaces `#36b9ab` in `src/app/layout.tsx:26`.
- Manifest (`public/app.webmanifest`): `theme_color` `#F6F0E6`, `background_color` `#F6F0E6`. Done in R3-V3.

### 3.3 Computed contrast (WCAG 2.x relative luminance)

**Method.**

- Computed with `/private/tmp/claude-503/-Users-pvasilakis-site/e6271ddf-8171-43b6-8d73-718dfd3a7330/scratchpad/contrast.mjs`: the WCAG formula, with alpha tokens composited over the stated background (the composite hex is shown).
- The R3-V2 unit test must reproduce these numbers.
- Minimums: 4.5 for text, 3.0 for large text (≥ 24 px, or ≥ 18.66 px bold) and for UI boundaries and focus indicators.
- **Result: 0 failures.** The table has 164 rows (the test's label count; rows with the same pair, minimum and ratio share one test case; rows from R3-V5b, V5c, V6, V7, V8, V9, V10 and V12a included); 163 have a minimum, and the decorative `sun` row has none (it is never text). R3-V9 note: over the stay hub's half sun, `fg-muted` would be 2.50:1 at night, so the sun is sized from `--text-d1` and ends above the lead; only the d1 H1 (large text) sits over it.

| Mode | Pair | FG | BG | Ratio | Min |
|---|---|---|---|---|---|
| light | fg on bg | `#1C2528` | `#F6F0E6` | **13.78** | 4.5 |
| light | fg on surface | `#1C2528` | `#FFFBF5` | **15.15** | 4.5 |
| light | fg on surface-sunken | `#1C2528` | `#EDE4D5` | **12.39** | 4.5 |
| light | fg on surface-raised | `#1C2528` | `#FFFFFF` | **15.62** | 4.5 |
| light | fg-muted on bg | `#57524C` | `#F6F0E6` | **6.82** | 4.5 |
| light | fg-muted on surface | `#57524C` | `#FFFBF5` | **7.50** | 4.5 |
| light | field placeholder (fg-muted) on surface (R3-V12a) | `#57524C` | `#FFFBF5` | **7.50** | 4.5 |
| light | fg-muted on surface-sunken | `#57524C` | `#EDE4D5` | **6.13** | 4.5 |
| light | fg-muted on surface-raised | `#57524C` | `#FFFFFF` | **7.73** | 4.5 |
| light | primary-fg on primary (primary button) | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| light | primary-fg on primary-hover | `#FFFFFF` | `#8A3A22` | **7.75** | 4.5 |
| light | primary-text on bg | `#8F3D24` | `#F6F0E6` | **6.48** | 4.5 |
| light | primary-text on surface | `#8F3D24` | `#FFFBF5` | **7.12** | 4.5 |
| light | primary-text on surface-sunken | `#8F3D24` | `#EDE4D5` | **5.82** | 4.5 |
| light | accent on bg (links) | `#0D5568` | `#F6F0E6` | **7.36** | 4.5 |
| light | accent on surface (secondary button) | `#0D5568` | `#FFFBF5` | **8.09** | 4.5 |
| light | map attribution links (accent) on surface (R3-V12a) | `#0D5568` | `#FFFBF5` | **8.09** | 4.5 |
| light | accent-hover on bg | `#0A4454` | `#F6F0E6` | **9.41** | 4.5 |
| light | accent-fg on accent | `#FFFFFF` | `#0D5568` | **8.35** | 4.5 |
| light | olive on bg | `#4F5E33` | `#F6F0E6` | **6.21** | 4.5 |
| light | olive on surface | `#4F5E33` | `#FFFBF5` | **6.83** | 4.5 |
| light | bg on fg (pressed chip) | `#F6F0E6` | `#1C2528` | **13.78** | 4.5 |
| light | success on success-bg | `#2F6230` | `#E1EBD6` | **5.86** | 4.5 |
| light | success on surface | `#2F6230` | `#FFFBF5` | **7.00** | 4.5 |
| light | warning on warning-bg | `#7A4B00` | `#F7E4C2` | **5.94** | 4.5 |
| light | warning on surface | `#7A4B00` | `#FFFBF5` | **7.19** | 4.5 |
| light | danger on danger-bg | `#A1232B` | `#F8DEDB` | **5.90** | 4.5 |
| light | danger on surface | `#A1232B` | `#FFFBF5` | **7.30** | 4.5 |
| light | danger on bg (admin login error, R3-V10) | `#A1232B` | `#F6F0E6` | **6.64** | 4.5 |
| light | accent on surface-sunken (admin outline button hover, R3-V10) | `#0D5568` | `#EDE4D5` | **6.62** | 4.5 |
| light | accent on info-bg | `#0D5568` | `#DCEBEE` | **6.82** | 4.5 |
| light | band-fg on band-bg | `#F6EFE4` | `#0C3440` | **11.63** | 4.5 |
| light | band-muted on band-bg | `#B9CBCF` | `#0C3440` | **7.91** | 4.5 |
| light | band-accent (text) on band-bg | `#F2B27A` | `#0C3440` | **7.23** | 4.5 |
| light | band-accent-fg on band-accent (CTA) | `#231510` | `#F2B27A` | **9.63** | 4.5 |
| light | band-fg on warm-1 (lightest stop of the contact band) | `#F6EFE4` | `#7A3522` | **7.79** | 4.5 |
| light | warm-muted on warm-1 | `#F0D9C8` | `#7A3522` | **6.55** | 4.5 |
| light | fg on header glass (transparent, O43) over bg | `#1C2528` | `#F7F2EA` | **13.99** | 4.5 |
| light | cal: date on free cell | `#1C2528` | `#FFFBF5` | **15.15** | 4.5 |
| light | cal: price on free cell | `#57524C` | `#FFFBF5` | **7.50** | 4.5 |
| light | cal: selected text | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| light | cal: date on range | `#1C2528` | `#F4E5DD` | **12.72** | 4.5 |
| light | cal: price on range | `#57524C` | `#F4E5DD` | **6.29** | 4.5 |
| light | cal: best pill | `#3A4722` | `#E2E8CC` | **7.91** | 4.5 |
| light | cal: booked text on darkest hatch stripe | `#57524C` | `#D4CDC0` | **4.90** | 4.5 |
| light | cal: booked text on sunken | `#57524C` | `#EDE4D5` | **6.13** | 4.5 |
| light | cal: price on selected cell (R3-V7) | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| light | cal: "out" label on booked hatch (R3-V7) | `#57524C` | `#D4CDC0` | **4.90** | 4.5 |
| light | cal: price on hovered cell (R3-V7) | `#57524C` | `#EDE4D5` | **6.13** | 4.5 |
| light | QuoteBar: fg on glass-bar over bg (R3-V7) | `#1C2528` | `#F6F0E6` | **13.78** | 4.5 |
| light | QuoteBar: fg on glass-bar over a primary cell (R3-V7) | `#1C2528` | `#E8D5C8` | **10.97** | 4.5 |
| light | kinetic band EL row (primary-text) on bg | `#8F3D24` | `#F6F0E6` | **6.48** | 4.5 |
| light | fg-muted on worst grain speck (8 % ink) | `#57524C` | `#E5E0D7` | **5.87** | 4.5 |
| light | primary-text on worst grain speck | `#8F3D24` | `#E5E0D7` | **5.57** | 4.5 |
| light | olive on worst grain speck | `#4F5E33` | `#E5E0D7` | **5.34** | 4.5 |
| light | UI: focus ring vs bg | `#0D5568` | `#F6F0E6` | **7.36** | 3 |
| light | UI: focus ring vs surface | `#0D5568` | `#FFFBF5` | **8.09** | 3 |
| light | UI: border-control vs surface | `#8A8178` | `#FFFBF5` | **3.71** | 3 |
| light | UI: border-control vs bg | `#8A8178` | `#F6F0E6` | **3.37** | 3 |
| light | UI: band-focus vs band-bg | `#F2B27A` | `#0C3440` | **7.23** | 3 |
| light | UI: primary fill vs bg | `#A0452A` | `#F6F0E6` | **5.48** | 3 |
| light | map: gulf label on map-sea | `#DDF1F5` | `#0A4A5C` | **8.37** | 4.5 |
| light | decorative only: sun on bg (**never text**) | `#F0A95B` | `#F6F0E6` | 1.76 | none |
| light | UI: amenity icon (primary-text) on its primary-tint disc over bg | `#8F3D24` | `#ECDBCF` | **5.47** | 3 |
| light | UI: lightbox focus ring (band-focus) on viewer-bg | `#F2B27A` | `#0E1418` | **10.09** | 3 |
| light | stay hub H1 (fg, d1 large text) over the half-sun rays (sun .5 over bg; the lead sits below the sun) (R3-V9) | `#1C2528` | `#F3CDA1` | **10.42** | 3 |
| light | UI: portal tile icon (band-accent) on band-line over band-bg (R3-V9) | `#F2B27A` | `#3B5961` | **4.08** | 3 |
| light | portal tile text (band-muted) on its band-accent .14 glow over band-bg (R3-V9) | `#B9CBCF` | `#2C4648` | **6.04** | 4.5 |
| light | UI: check-in rule icon (primary-text) on primary-tint over surface-sunken (R3-V9) | `#8F3D24` | `#E4D1C0` | **4.95** | 3 |
| dark | fg on bg | `#F2EBDF` | `#0A1A21` | **14.99** | 4.5 |
| dark | fg on surface | `#F2EBDF` | `#10252E` | **13.37** | 4.5 |
| dark | fg on surface-sunken | `#F2EBDF` | `#0D2129` | **13.99** | 4.5 |
| dark | fg on surface-raised | `#F2EBDF` | `#163340` | **11.21** | 4.5 |
| dark | fg-muted on bg | `#A9B6BA` | `#0A1A21` | **8.53** | 4.5 |
| dark | fg-muted on surface | `#A9B6BA` | `#10252E` | **7.61** | 4.5 |
| dark | field placeholder (fg-muted) on surface (R3-V12a) | `#A9B6BA` | `#10252E` | **7.61** | 4.5 |
| dark | fg-muted on surface-sunken | `#A9B6BA` | `#0D2129` | **7.96** | 4.5 |
| dark | fg-muted on surface-raised | `#A9B6BA` | `#163340` | **6.38** | 4.5 |
| dark | primary-fg on primary | `#1B100B` | `#E8946F` | **7.90** | 4.5 |
| dark | primary-fg on primary-hover | `#1B100B` | `#F0A585` | **9.26** | 4.5 |
| dark | primary-text on bg | `#F2A585` | `#0A1A21` | **8.88** | 4.5 |
| dark | primary-text on surface | `#F2A585` | `#10252E` | **7.92** | 4.5 |
| dark | primary-text on surface-sunken | `#F2A585` | `#0D2129` | **8.29** | 4.5 |
| dark | accent on bg (links) | `#80CCDA` | `#0A1A21` | **9.78** | 4.5 |
| dark | accent on surface | `#80CCDA` | `#10252E` | **8.72** | 4.5 |
| dark | map attribution links (accent) on surface (R3-V12a) | `#80CCDA` | `#10252E` | **8.72** | 4.5 |
| dark | accent-hover on bg | `#A5DDE7` | `#0A1A21` | **11.92** | 4.5 |
| dark | accent-fg on accent | `#0A1A21` | `#80CCDA` | **9.78** | 4.5 |
| dark | olive on bg | `#BCCA8B` | `#0A1A21` | **10.11** | 4.5 |
| dark | olive on surface | `#BCCA8B` | `#10252E` | **9.02** | 4.5 |
| dark | bg on fg (pressed chip) | `#0A1A21` | `#F2EBDF` | **14.99** | 4.5 |
| dark | success on success-bg | `#9ED49A` | `#15301F` | **8.37** | 4.5 |
| dark | success on surface | `#9ED49A` | `#10252E` | **9.30** | 4.5 |
| dark | warning on warning-bg | `#F2C27A` | `#33270F` | **8.88** | 4.5 |
| dark | warning on surface | `#F2C27A` | `#10252E` | **9.63** | 4.5 |
| dark | danger on danger-bg | `#F4A3A0` | `#3A1719` | **8.05** | 4.5 |
| dark | danger on surface | `#F4A3A0` | `#10252E` | **7.99** | 4.5 |
| dark | danger on bg (admin login error, R3-V10) | `#F4A3A0` | `#0A1A21` | **8.96** | 4.5 |
| dark | accent on surface-sunken (admin outline button hover, R3-V10) | `#80CCDA` | `#0D2129` | **9.13** | 4.5 |
| dark | accent on info-bg | `#80CCDA` | `#0E3440` | **7.30** | 4.5 |
| dark | band-fg on band-bg | `#F2EBDF` | `#0F303B` | **11.77** | 4.5 |
| dark | band-muted on band-bg | `#A9C0C6` | `#0F303B` | **7.33** | 4.5 |
| dark | band-accent (text) on band-bg | `#F4B878` | `#0F303B` | **7.95** | 4.5 |
| dark | band-accent-fg on band-accent | `#231510` | `#F4B878` | **10.09** | 4.5 |
| dark | band-fg on warm-1 | `#F2EBDF` | `#5E2A1B` | **9.72** | 4.5 |
| dark | warm-muted on warm-1 | `#F0D9C8` | `#5E2A1B` | **8.48** | 4.5 |
| dark | fg on header glass (transparent, O43) over bg | `#F2EBDF` | `#48535A` | **6.67** | 4.5 |
| dark | cal: date on free cell | `#F2EBDF` | `#10252E` | **13.37** | 4.5 |
| dark | cal: price on free cell | `#A9B6BA` | `#10252E` | **7.61** | 4.5 |
| dark | cal: selected text | `#1B100B` | `#E8946F` | **7.90** | 4.5 |
| dark | cal: date on range | `#F2EBDF` | `#333738` | **10.20** | 4.5 |
| dark | cal: price on range | `#A9B6BA` | `#333738` | **5.80** | 4.5 |
| dark | cal: best pill | `#D6E2A6` | `#2A3A22` | **8.85** | 4.5 |
| dark | cal: booked text on lightest hatch stripe | `#A9B6BA` | `#24353B` | **6.11** | 4.5 |
| dark | cal: booked text on sunken | `#A9B6BA` | `#0D2129` | **7.96** | 4.5 |
| dark | cal: price on selected cell (R3-V7) | `#1B100B` | `#E8946F` | **7.90** | 4.5 |
| dark | cal: "out" label on booked hatch (R3-V7) | `#A9B6BA` | `#24353B` | **6.11** | 4.5 |
| dark | cal: price on hovered cell (R3-V7) | `#A9B6BA` | `#0D2129` | **7.96** | 4.5 |
| dark | QuoteBar: fg on glass-bar over bg (R3-V7) | `#F2EBDF` | `#0A1A21` | **14.99** | 4.5 |
| dark | QuoteBar: fg on glass-bar over a primary cell (R3-V7) | `#F2EBDF` | `#363231` | **10.64** | 4.5 |
| dark | kinetic band EL row (primary-text) on bg | `#F2A585` | `#0A1A21` | **8.88** | 4.5 |
| dark | fg-muted on worst grain speck (8 % paper) | `#A9B6BA` | `#1D2B30` | **7.03** | 4.5 |
| dark | UI: focus ring vs bg | `#F4B878` | `#0A1A21` | **10.12** | 3 |
| dark | UI: focus ring vs surface | `#F4B878` | `#10252E` | **9.03** | 3 |
| dark | UI: border-control vs surface | `#6E8389` | `#10252E` | **3.97** | 3 |
| dark | UI: border-control vs bg | `#6E8389` | `#0A1A21` | **4.46** | 3 |
| dark | UI: band-focus vs band-bg | `#F4B878` | `#0F303B` | **7.95** | 3 |
| dark | UI: primary fill vs bg | `#E8946F` | `#0A1A21` | **7.52** | 3 |
| dark | map: gulf label on map-sea | `#DDF1F5` | `#07303B` | **12.02** | 4.5 |
| dark | UI: amenity icon (primary-text) on its primary-tint disc over bg | `#F2A585` | `#2E2E2D` | **6.83** | 3 |
| dark | UI: lightbox focus ring (band-focus) on viewer-bg | `#F4B878` | `#0E1418` | **10.58** | 3 |
| dark | stay hub H1 (fg, d1 large text) over the half-sun rays (sun .5 over bg; the lead sits below the sun) (R3-V9) | `#F2EBDF` | `#7F694D` | **4.40** | 3 |
| dark | UI: portal tile icon (band-accent) on band-line over band-bg (R3-V9) | `#F4B878` | `#3C555C` | **4.50** | 3 |
| dark | portal tile text (band-muted) on its band-accent .14 glow over band-bg (R3-V9) | `#A9C0C6` | `#2F4344` | **5.50** | 4.5 |
| dark | UI: check-in rule icon (primary-text) on primary-tint over surface-sunken (R3-V9) | `#F2A585` | `#303334` | **6.34** | 3 |
| both | hero H1 on scrim .58 over the brightest sky pixel (large text) | `#FFF8EE` | `#6B757B` | **4.48** | 3 |
| both | hero lede, price and CTA on scrim .80 over pure white | `#FFF8EE` | `#394549` | **9.42** | 4.5 |
| both | hero eyebrow on scrim .80 over pure white | `#FFE2C0` | `#394549` | **7.99** | 4.5 |
| both | room and gallery caption on scrim .62 over pure white | `#FFF8EE` | `#666F72` | **4.90** | 4.5 |
| both | map pin text on pin paper | `#1C2528` | `#FFFBF5` | **15.15** | 4.5 |
| both | map home pin | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| both | lightbox room name and counter on viewer-bg | `#FFF8EE` | `#0E1418` | **17.59** | 4.5 |
| both | UI: lightbox glass button border (`#FFF8EE` at 50 %) on viewer-bg | `#878683` | `#0E1418` | **5.09** | 3 |

**Hero contrast measured on the real photo pixels.**

- Source: `messinian-light/tools/hero-contrast.mjs` → `shots/hero-contrast.json`. The method keeps the scrim, hides the text, and computes `#FFF8EE` against every pixel behind each text block.
- **H1** (large text, ≥ 3:1), minimum per viewport: 4.31 at 390 px light, 4.35 at 1440 px light, 4.27 at 768 px light, ≥ 8.01 in dark.
- **Lede:** ≥ 10.3 everywhere.
- **Price:** ≥ 13.2.
- **Glass CTA:** ≥ 13.4.
- **Transient case.** The one-pass H1 light sweep highlight (`#FFD6A0`) drops to 3.45 for under 3.4 s; that is still ≥ 3:1 for large text.
- **Condition:** the scrim geometry in §5.5 must be kept exactly, because these numbers depend on it. V5 re-runs the measurement on the real page (G-CONTRAST).

**Open Graph share cards (R3-V11).** `npm run design:og` (`scripts/design/gen-og-images.ts`) measures each text line against the lightest pixel of the scrimmed photo inside its box and fails below 4.5:1. Measured (both locales): wordmark `band-fg` 6.84, place label `band-accent` 6.85, tagline `band-fg` 11.52. The brand mark above the wordmark is a logotype (no minimum): over its lightest pixel the waves give 2.85 and the sun 1.77, over the mean pixel 8.32 and 5.17.

**R3-V12a (legacy CSS consumers).** Placeholders in the guest, check-in and admin fields move from the legacy slate colour to `fg-muted`, and the Leaflet attribution links in dark take `accent` instead of the legacy dark link colour (rows above). The kinetic band EL row is `primary-text` in both themes (8.88 in dark; the earlier `sun` row described a colour that was never rendered). Everything else reuses existing pairs: the skip link `accent-fg` on `accent`, the PWA banner `fg` on `surface-raised`, the focus ring rows, and the scrollbar thumb `border-control` (the "UI: border-control vs bg/surface" rows).

**R3-V12b (legacy sweep) adds no colour pair.** It deletes the legacy sheets. The dark-mode contrast findings they carried are closed by the surfaces that replaced them, and each of those surfaces is covered by an existing row:

- R-166: guide card name and directions (`fg` and `accent` on `surface`).
- R-187: placeholders (`fg-muted` on `surface`, R3-V12a).
- R-188: primary button (`primary-fg` on `primary` and on `primary-hover`).
- R-189, R-190, R-277: the booking bar and its CTA are gone. Covered by the `cal:` and QuoteBar rows and the primary button rows.
- R-223 and R-274: the components are gone. Empty states use `fg` and `fg-muted` on `surface`, and their action is the secondary button.
- R-275: secondary button (`accent` on `surface`, hover `accent-hover` on `bg`).
- R-279 and R-282: the blanket inherit rule and the no-JS fallback are gone. Dark values exist only in the two `tokens.css` dark blocks, which the parity test checks.

**R3-V14 adds no colour pair.** The scroll hairline is decorative and uses `primary` (the "UI: primary fill vs bg" rows). The pointer glare is a transient white `soft-light` layer kept off text (over photos, or under the letter's text); the heading rise (M28) is a transient opacity, like the H1 sweep.

**Usage rules.**

- `sun`, `olive-soft`, the raw terracotta `#B26646` and the shutter greens are decorative and never used for text.
- Text on photos is allowed only over the scrim.
- Grain is a background image on `body` (§4.5), capped at 8 % alpha; the rows above prove the worst-case speck still passes.

---

## 4. Space, shape, elevation, layout

### 4.1 Spacing

- Tailwind's default 4 px spacing scale (`--spacing: .25rem`) is the scale. Steps in use: 1, 2, 3, 4, 6, 8, 12, 16, 24, 32 (4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px).
- Semantic tokens:
  - `--space-section: clamp(56px, 9vw, 112px)` (vertical padding of a section)
  - `--gutter: clamp(16px, 5vw, 64px)` (16 px phone gutter)
  - `--container: 1240px` (content max width; the container is `min(100% - 2*gutter, container)`)
  - `--header-h: 56px`
  - `--header-offset: 10px` (the header floats 10 px from the top and the sides)

### 4.2 Radii (`--radius-*`; semantic names avoid the legacy `--radius-sm…xl`)

| Token | Value | Use |
|---|---|---|
| `--radius-object` | 4px | "Objects", not UI: window frame, host letter, shutters |
| `--radius-field` | 12px | Inputs, calendar cells, 14-night cells |
| `--radius-tile` | 14px | Callouts, notes, small tiles |
| `--radius-card` | 22px | Cards, months, guide cards, room cards |
| `--radius-dialog` | 32px | Quote card, bottom sheet, lightbox corners (desktop) |
| `--radius-control` | 999px | Buttons, chips, segmented controls, header pill, bottom bars |

### 4.3 Elevation (`--shadow-*`, redefined in dark)

| Level | Token | Light | Dark | Use |
|---|---|---|---|---|
| 0 | none | none | none | Page, bands |
| 1 | `--shadow-rest` | `0 1px 2px rgb(60 40 25 / .06), 0 4px 14px -6px rgb(60 40 25 / .12)` | `0 1px 2px rgb(0 0 0 / .4), inset 0 1px 0 rgb(255 255 255 / .03)` | Resting cards, header |
| 2 | `--shadow-raised` | `0 18px 40px -18px rgb(60 40 25 / .32), 0 2px 6px rgb(60 40 25 / .06)` | `0 18px 40px -18px rgb(0 0 0 / .7), inset 0 1px 0 rgb(255 255 255 / .04)` | Fact strip, quote card, bars, hovered cards |
| 3 | `--shadow-object` | `0 50px 90px -40px rgb(40 25 15 / .5), 0 14px 28px -16px rgb(40 25 15 / .25)` | `0 50px 90px -40px rgb(0 0 0 / .8), 0 14px 28px -16px rgb(0 0 0 / .5)` | Window, letter, room cards, deck |
| 4 | `--shadow-overlay` | `0 24px 64px -12px rgb(28 20 14 / .45)` | `0 24px 64px -12px rgb(0 0 0 / .85)` | Dialogs, menu sheet |

Primary button glow: `0 14px 26px -14px rgb(160 69 42 / .55)` (light) / `0 14px 26px -14px rgb(0 0 0 / .6)` (dark).

### 4.4 Breakpoints and grid

**Breakpoints** are Tailwind's defaults and are not customised: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. The mockup's breakpoints map as follows:

| Feature | Breakpoint |
|---|---|
| Header nav visible | `lg` |
| Header CTA visible | `sm` |
| Fact strip in one row | `lg` |
| Calendar: two months side by side | `md` |
| Availability: two-column layout | `lg` |
| Guide list | 2 columns at `sm`, 3 at `lg` |
| Highlights | 2 columns at `sm`, 4 at `lg` |
| Deck fan instead of coverflow | `lg` |
| Bottom bars hidden | `lg` |

**Grid:** 4 columns (< 768, gap 16), 8 columns (768–1023, gap 24), 12 columns (≥ 1024, gap 32), inside the container.

**Grid rule:** always `repeat(n, minmax(0, 1fr))`, never `1fr 1fr`. This avoids the aegean hub overflow bug. No page may clip overflowing content to hide it: `overflow-x: clip` is allowed only on `html`/`body` as a safety net. The V13 audit checks every element's right edge ≤ viewport width, not only `scrollWidth`.

**z-index:** content 1, fixed sun glow 0 (behind content), sticky header 50, bottom bars 60, toasts 90. Dialogs use the top layer.

**Touch targets:** buttons 48 px (sm 40), icon buttons 44 px, chips 40 px with ≥ 8 px gaps, calendar cells ≥ 44 × 44 px. All meet WCAG 2.5.8.

### 4.5 Texture

- Paper grain is a pre-baked 160 px tile set as a background image on `body`: `background: var(--grain) 0 0 / 160px repeat, var(--color-bg)`.
- Two files: `public/design/grain-light.webp` (ink specks, ≤ 8 % alpha) and `grain-dark.webp` (paper specks, ≤ 8 % alpha). They are generated by `scripts/design/gen-hero-assets.ts` (§7.2).
- There is no fixed layer and no `mix-blend-mode`. This avoids per-scroll compositing on mid-range phones and is a change from the mockup's `body::before`.

---

## 5. Motion system

### 5.1 Principles (binding)

1. **Static by construction.** Default styles are the final state; animations only run from an offset state to the default. Without JS, with reduced motion, or in Firefox, the page is complete and still.
2. **Performance.** Animate only `transform`, `opacity`, `clip-path` and `filter` (filter only on small elements). No scroll hijacking and no smooth-scroll library.
3. **No preloader.** The H1 and the hero `<img>` are never at `opacity: 0`, because web.dev excludes opacity-0 elements from LCP.
4. **WCAG 2.2.2.** No autoplay loops. Every time-based animation ends within 5 s of starting. Continuous motion is only scroll-linked or pointer-linked, which is user-driven.
5. **Where each tier runs.**
   - Home carries the strong effects.
   - Apartment, Availability and Guide use moderate motion (reveals, morphs, page turns).
   - The stay hub, portal and phones use calm mode: crossfades and 10 px fades only.
   - Admin has no motion.

### 5.2 Motion gate

**Boot script.** The existing nonce'd inline script in `src/app/layout.tsx:40-49` is replaced with:

```js
(function(){var d=document.documentElement,r=null;
try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}
try{r=localStorage.getItem('motion')}catch(e){}
if(r==='reduce')d.setAttribute('data-motion','reduce');
else if(window.matchMedia&&matchMedia('(prefers-reduced-motion: no-preference)').matches){d.setAttribute('data-motion','full');
try{if(!sessionStorage.getItem('brand-intro')){sessionStorage.setItem('brand-intro','1');d.setAttribute('data-intro','')}}catch(e){}}})()
```

R3-V14 added the last line: `data-intro` marks the first full-motion load of the browser session (tab), for the brand mark intro (M26). The key `brand-intro` is listed in the privacy notice (sessionStorage).

**How the flag works.**

- `data-motion="full"` is the only flag that arms motion. It is a data attribute rendered by no React component, so hydration never touches it (unlike `className` on `<html>`, which next/font uses).
- `data-theme` is now set **only** when the visitor chose a theme. Otherwise the CSS media query follows the OS live. This is a change from today's always-set behaviour; `ThemeSwitch` derives the effective theme as `data-theme ?? (matchMedia dark ? 'dark' : 'light')`.

**Tailwind variant:**

```css
@custom-variant motion-ok {
  @media (prefers-reduced-motion: no-preference) {
    &:where(:root[data-motion="full"] *) { @slot; }
  }
}
```

**Plain-CSS gate.** Motion CSS outside utilities sits inside `@media (prefers-reduced-motion: no-preference) { :root[data-motion="full"] … }`. Scroll-driven rules are additionally inside `@supports (animation-timeline: view())`.

- This gate is required. Measured in Chrome 148 (tech research §1.3): the repo's global duration reset (then `src/styles/05-primitives.css:290-298`, in `src/styles/motion.css` since R3-V12b) does **not** stop scroll-driven animations.
- Keep a reset as a safety net in the new `motion.css`, extended to `:root:not([data-motion="full"])` for View Transition pseudo-elements.

**Live changes.** `src/lib/motion/motionPreference.ts`, a small client module mounted by the header, keeps `data-motion` in sync:

- On `matchMedia('(prefers-reduced-motion: reduce)')` `change`.
- On the in-page **MotionSwitch**, which stores `localStorage.motion = 'reduce'` or removes the key. Every storage access is wrapped in try/catch.

The WebGL hero watches `data-motion` with a `MutationObserver` and tears down when it leaves `full`.

### 5.3 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-micro` | 160ms | Press, arrow nudge |
| `--dur-ui` | 280ms | Hover, chips, bars, switches |
| `--dur-page` | 420ms | View Transitions (enter 420, exit 260) |
| `--dur-reveal` | 850ms | Section reveals, fact louvres |
| `--dur-gl-fade` | 700ms | WebGL canvas fade-in |
| `--dur-shutter` | 1800ms | Shutters |
| `--dur-sweep` | 3400ms | The single H1 light pass |
| `--ease-glide` | `cubic-bezier(.22, 1, .36, 1)` | Default ease-out |
| `--ease-sweep` | `cubic-bezier(.65, 0, .35, 1)` | Light sweeps, page turns |
| `--ease-shutter` | `linear(0, .008 1.1%, .034 2.3%, .134 4.9%, .264 7.3%, .4 9.9%, .65 16%, .78 20.4%, .88 25.4%, .946 31%, .985 37.5%, 1.004 45%, 1.012 54%, 1.008 66%, 1.001 83%, 1)` | Spring with about 1.7 % overshoot: shutters, louvres, night cells, deck |

**Browser support.** `linear()` needs Chrome 113, Safari 17.2 or Firefox 112; older engines fall back to `ease` (declare `transition-timing-function: ease` before it). Names avoid Tailwind's `--ease-out` default.

### 5.4 Tiers

| Tier | When | What |
|---|---|---|
| **T0 static** | No JS; `data-motion` not `full` (OS reduce or the in-page switch); or a feature missing | Photo hero, flat layouts, all content and CTAs visible, instant navigation, no canvas |
| **T1 CSS** | `data-motion="full"` | IntersectionObserver reveals (all browsers). CSS 3D: shutters, louvres, deck, relief. Scroll-driven effects where `animation-timeline` is supported (Chrome/Edge 115+, Safari/iOS 26+; not Firefox stable). View Transitions where supported |
| **T2 WebGL** | T1, plus the capability gate (§5.6), plus after `load` and idle | The living-photograph canvas fades in over the identical `<img>` on Home only |

### 5.5 Pattern catalogue

| # | Element | Motion | Trigger | Engine | Reduced / unsupported |
|---|---|---|---|---|---|
| M1 | Hero H1 | One warm light pass through the letters (gradient `#FFF8EE → #FFD6A0 → #FFF8EE`, `background-clip: text`, 3.4 s, 0.5 s delay). Line 2 slides from `.35em`. **Never opacity 0** | Load, once | CSS keyframes | Plain `#FFF8EE` text |
| M2 | Hero lede, price, CTAs | Rise 18 px with opacity (staggered 0 / .25 / .4 s, .9 s). These are not LCP candidates; the image is the LCP | Load, once | CSS | Visible at once |
| M3 | Hero stage **recede** (graft 1) | `.hero__stage` goes to `perspective(1400px) translateY(6%) rotateX(16deg) scale(.86)`, `border-radius` 0 → `var(--radius-card)`. A dark overlay (`rgb(var(--scrim) / 0 → .55)`) and hero content opacity 1 → 0 plus `translateY(-80px)` over the first 70 % of the exit | Scroll: `view()` on `section.hero`, `animation-range: exit 0% exit 100%` | CSS scroll-driven | Static |
| M4 | Hero dolly (T1) | `.hero__img` scale 1 → 1.14, `translateY(3%)`. Disabled when `[data-gl="on"]`, because the shader does the dolly | Scroll, same timeline | CSS scroll-driven | Static |
| M5 | Living photograph (T2) | §5.6 | Pointer, sideways touch-drag, scroll; ambient drift ≤ 4.8 s | WebGL | Never mounted |
| M6 | Fact strip | Six tiles open like louvres from `rotateX(-86deg)` (transform-origin top), 75 ms stagger, `--ease-shutter` | In view, once (IntersectionObserver, threshold .35) | CSS + IO | Visible |
| M7 | Kinetic band (graft 2) | Row A (EN outline, `-webkit-text-stroke: 1px` in `fg` at 45 % opacity) translateX 4 % → −38 %. Row B (EL italic, `primary-text`) −40 % → 0 %. Separators are the SVG star. Font `clamp(3.2rem, 11vw, 9.5rem)` | Scroll: `view()`, `animation-range: cover` | CSS scroll-driven | Static offsets: row A −10 %, row B −20 % |
| M8 | Highlights | Rise 40 px and untilt from `rotateX(18deg)`, 90 ms stagger. Afterwards they tilt toward the pointer (max 6°) on fine pointers | In view / pointer | CSS + IO; JS writes `--tx`/`--ty` (rAF-throttled) | Flat |
| M9 | Season switch (graft 10) | Cards flip `rotateY` 0 → 90° → 0 (640 ms, `--ease-sweep`, 70 ms stagger); content swaps at 50 % | Click | CSS class + JS | Instant swap |
| M10 | Balcony window **shutters** | Two louvred shutters swing to ±104° (`--dur-shutter`, spring); a warm flare fades; the photo settles 1.14 → 1 | 45 % in view, once | CSS 3D + IO | Shutters not rendered; the photo stays |
| M11 | Rooms coverflow (< 1024) | Each card `perspective(900px)`: `translateZ(-40px) rotateY(34deg) scale(.9)` → flat at the centre → mirrored; opacity .7 → 1 → .7 | The row's own horizontal scroll: `view(inline)` | CSS scroll-driven (0 JS) | Flat snap row |
| M12 | Rooms deck fan (≥ 1024, graft 3) | Six cards pile, then fan out (`translate3d(pos*175px, |pos|*18px, -|pos|*70px) rotateZ(pos*5deg) rotateY(pos*-7deg)`, 800 ms spring). Chip or click lifts the active card (`translateZ(140px)`, `translateY(-34px)`, `shadow-object`); the others desaturate (`saturate(.75) brightness(.8)`). The stage tilts toward the pointer (max 6°) | In view, once (IO adds `.is-fanned`) / chip / pointer | CSS transitions + JS classes and custom properties | Fanned static, no tilt |
| M13 | 14-night strip | Cells flip in `rotateY(-90deg)`, 45 ms stagger | In view, once | CSS + IO | Visible |
| M14 | Relief map | Contour layers rise (`translateZ` 0 → 18/36/54 px), pins stand up, stage tilt `rotateX(40deg) rotateZ(-6deg)` (≥ 1024: 50°/−14°). The home pin pulses **2×** (1.6 s, 1.2 s delay; ends at 4.4 s) | In view / pointer (fine) | CSS 3D + IO + JS custom properties | Flat 2D plan |
| M15 | Relief waves | Wave pattern `translateX(-60px → 0)` | Scroll: `view()` | CSS scroll-driven | Static |
| M16 | Sun path | A fixed 110vmax element with a static radial gradient (`glow` token) translates from top-right to bottom-left. It is moonlight in Night mode. **Transform only**, not a `@property` gradient animation (compositor-only; changed from the mockup) | Scroll: `scroll(root)` | CSS scroll-driven | Glow parked top-right |
| M17 | Generic section reveal | `translateY(32px)` + opacity over `--dur-reveal` | In view, once | CSS + IO | Visible |
| M18 | Buttons | Hover (fine pointers): lift −2 px plus a warm glint sweep on primary (700 ms). Active: `scale(.98)` for 160 ms | Pointer | CSS | Colour change only |
| M19 | Calendar month turn | Desktop previous/next: `rotateY(±58deg) translateZ(-40px)` → flat, 560 ms, origin at the spine | Click / PageUp / PageDown | CSS class | Instant |
| M20 | Calendar range light | One pass of light across the chosen nights (55 ms per cell); the total "bumps" (−4 px, 500 ms) | Selection complete | CSS | None |
| M21 | Favourite heart burst | 6 dots scale out and fade (400 ms); the heart scales 1 → 1.25 → 1 | Toggle on | CSS | Icon fill change only |
| M22 | Bottom bars | Slide up from `translateY(160%)` (`--dur-ui`) | IO state | CSS | Appear instantly |
| M23 | Menu sheet | Slides from the right via `@starting-style` (Chrome 117, Safari 17.5, Firefox 129) | Open | CSS | Appears instantly |
| M24 | FAQ | Height animates via `interpolate-size: allow-keywords` and `::details-content` where supported (Chrome 131+) | Toggle | CSS | Instant (default `<details>`) |
| M25 | Calm mode (hub, portal, phones, guide lists) | Tiles and cards fade up 10 px, 60 ms stagger (`--i` inline style, allowed by `style-src 'unsafe-inline'`) | Load, once | CSS | Visible |

**R3-V14 additions (owner request 2026-09-30, "more modern, extra motion, 3D").** Same rules: static by construction, the §5.2 gate, transform and opacity only, no new dependency, CSP unchanged. `tests/unit/motion-css-gate.test.ts` checks that every animation, transition, scroll timeline and view-transition name in `motion.css` and `components/*.css` is gated (the WebGL canvas fade is gated by its own capability check).

| # | Element | Motion | Trigger | Engine | Reduced / unsupported |
|---|---|---|---|---|---|
| M26 | Header brand mark | The sun rises 6 px with a fade (1 s, .45 s delay) while the two waves draw (stroke dash over `pathLength="1"`, 1.2 s). Ends by 1.45 s. Not in the stay header | First full-motion load of the session (`data-intro`, §5.2; removed when the sun has risen) | CSS | Static mark |
| M27 | Room deck cards (≥ 1024), guide cards, host letter | Tilt toward the pointer, max 6° (`perspective` + `rotateX/Y`), and a soft light glare (white radial, `soft-light`) at the pointer, kept off text: over the photo on room and guide cards, under the letter's text. Springs back with `--ease-shutter` (700 ms). The coverflow (< 1024) keeps M11 | Fine pointer (`pointerType` mouse); `src/lib/motion/pointerEffectsRuntime.ts`, a lazy chunk loaded only on fine-pointer devices (one delegated listener, box read on enter, custom properties written once per frame) | CSS + JS custom properties | Flat |
| M28 | Section headings (`.ui-section__title`: home, apartment, availability) | Rise out of a 3D plane: `perspective(600px) translateY(.5em) rotateX(-58deg)` and opacity → flat, origin at the baseline | Scroll: `view()`, `entry 0%` → `cover 30%` | CSS scroll-driven | Static |
| M29 | Header across navigations | Own view-transition group (`site-header`), no animation, above the morph (Next view-transitions guide, "Anchoring the header"); not during the theme reveal or the photo morph (`data-vt`) | Navigation View Transitions | CSS | Instant |
| M30 | Primary buttons | Magnetic pull toward the pointer, max 6 px (individual `translate`, so the M18 lift, press and glint stay) | Fine pointer | CSS + JS custom properties | Colour change only |
| M31 | Marketing header | 2 px `primary` hairline along the pill's bottom edge, `scaleX(0 → 1)` with the page scroll. Decorative (`aria-hidden`) | Scroll: `scroll(root)` | CSS scroll-driven | Not shown |
| M32 | Marketing footer waves | Drift `translateX(-160px → 0)` (user units; the path runs one period past the viewBox) | Scroll: footer `view()`, entry | CSS scroll-driven | Static |
| M33 | Apartment lead photo | CSS layered parallax: the photo drifts `translateY(-5% → 5%)` at `scale(1.12)` inside its frame; the frame recedes (`perspective(1400px) rotateX(7deg) scale(.95)`) as it leaves. Not WebGL: §5.10 gives the apartment no deferred GL budget (only the 1.5 KB fine-pointer effects chunk) | Scroll: `view()` | CSS scroll-driven | Static |
| M34 | Fact strip numbers | Plain numbers count up from 0 (850 ms, ease-out cubic) as the louvres open; ordinals ("2nd", "2ος") stay as rendered, since their suffix belongs to the final digit. The server markup holds the final numbers and the count ends on that exact text | In view, once (IO, threshold .35) | JS (rAF) | Final numbers |
| M35 | Guide map pins | Drop 40 px with a squash-and-settle spring (760 ms), 45 ms stagger (`--i` set by LeafletMap through the CSSOM) | Map opens | CSS | Pins appear |

### 5.6 The 3D hero: "living photograph"

**Decision: a hand-written WebGL fragment shader.** No library.

It is ported from `.runtime/design/messinian-light/hero-gl.js`, which the tech research prototype and the messinian mockup both ran without CSP violations under the production policy in headless Chrome 148.

| Option | Added JS (gz) | CSP fit | Verdict |
|---|---|---|---|
| **Hand-written WebGL: one triangle, one fragment shader** | **4.1 KB measured** (mockup, with comments; 3.4 KB stripped). **Budget ≤ 6 KB** | No `eval`, no WASM, no workers (CONFIRMED under the production CSP, tech research §1.2) | **Adopted** |
| three.js core | ≈ 175.7 KB (the `WebGLRenderer` import, bundlephobia) | Core fine; Draco, KTX2 and meshopt need `'wasm-unsafe-eval'` (absent) | Rejected: about 40× the bytes for one textured plane |
| @react-three/fiber + drei | ≥ 233 KB before any drei component | drei defaults fetch from CDNs (Draco from gstatic, environment presets, detect-gpu from unpkg), blocked by `connect-src 'self'` | Rejected |
| OGL | 10–15 KB for a minimal plane (SUSPECTED) | No WASM in core | Rejected: no gain at a single shader; unmaintained for about 20 months |
| GSAP / Lenis | 5.5 KB+ | Fine if bundled | Rejected: CSS does it, and Lenis moves scroll off the compositor |

**Rendering (from the mockup, unchanged).**

- GLSL ES 1.00 (runs on WebGL2 and WebGL1). One full-screen triangle. Two textures:
  - `uImg`: the LCP `<img>` itself, taken from `img.currentSrc` after `img.decode()`. It is the same origin, so there is no second download.
  - `uDepth`: a hand-painted depth map, white = near.
- Uniforms: `uCover` (object-fit cover plus object-position), `uPtr`, `uT`, `uScroll`, `uAmb`, `uSweep`.
- Effects:
  - Depth parallax around the mid plane: `off = (ptr + drift) * vec2(.018, .012) * (d - .42)`.
  - Depth-aware dolly on scroll: near planes grow faster.
  - One warm light pass strongest on sky and Taygetos: `c += vec3(1, .8, .52) * band * .17 * (.25 + .75 * (1 - d))`.
  - Afternoon warmth rising with scroll.
- **No water shimmer until a gulf photo exists** (§1.4).

**Loading sequence.**

1. SSR renders only the `<picture>` (§7.2), the scrim and the content. `section.hero` has `touch-action: pan-y`, so vertical scroll stays native and a sideways drag moves the view.
2. `HeroGlIsland` (client, ≤ 1.5 KB) runs `scheduleIdle`: after `load`, `requestIdleCallback({ timeout: 2500 })`, falling back to `setTimeout(1200)` because Safari has no `requestIdleCallback`. The idle helper is extracted from `src/components/DeferredRuntimeManagers.tsx:6-40` into `src/lib/motion/scheduleIdle.ts` and reused.
3. **Capability gate** (`src/lib/motion/heroCapability.ts`, a pure function taking `navigator`, `document` and the hero element). It aborts if any of these holds:
   - `data-motion` ≠ `full`;
   - `navigator.connection?.saveData === true`;
   - `navigator.deviceMemory` defined and < 4 (Chromium only; undefined counts as unknown, not as a fail);
   - `navigator.hardwareConcurrency` defined and < 4;
   - `document.visibilityState !== 'visible'`;
   - the hero not intersecting the viewport.
4. `import('./heroGl')` loads a separate `/_next/static` chunk, allowed by `script-src 'self'`. Then fetch the depth map matching the crop in use (`currentSrc` contains `-9x16-`, `-4x5-` or `-3x2-`; §7.2) with `fetchpriority="low"`.
5. Context creation: `{ alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }`, WebGL2 then WebGL1.
   - Link through `KHR_parallel_shader_compile`: poll `COMPLETION_STATUS_KHR` before reading `LINK_STATUS`.
   - The canvas is `aria-hidden`, absolutely positioned inside `.hero__media` under the tint and scrim.
6. Rendering is capped at 30 fps and DPR ≤ 1.5. It is paused off-screen (IntersectionObserver) and in hidden tabs.
   - The ambient drift and the sweep end by 4.8 s. After 5 s the loop stops and redraws only on `pointermove` (mouse over the hero), horizontal touch-drag, `scroll` or `resize`, until the pointer easing settles.
7. The canvas fades in (`opacity`, 700 ms) after the second frame; then `section.hero` gets `data-gl="on"`.
8. **Teardown (the `<img>` always stays underneath):**
   - `webglcontextlost`;
   - the watchdog: after 6 frames, more than 18 frames above 80 ms;
   - a texture, asset or link error;
   - `data-motion` leaving `full`.
   - On teardown the canvas fades out, then `WEBGL_lose_context` is called and the canvas removed. The reason is recorded as `data-gl="off:<reason>"`.
9. Device orientation is not used. Permissions-Policy blocks the accelerometer and gyroscope (`src/lib/security-config.ts:176-177`); do not relax it.

**Assets:** depth maps ≤ 2 KB each (§7.2). They are drawn from the SVG polygon layers in `messinian-light/tools/gen-assets.mjs:17-38`: sky, Taygetos, pine and rooftops, far parapet, table and chairs, right plant, left plant and parapet nearest. Rasterised with `sharp` `blur(9)`.

**Files:**

- `src/components/home/hero/HeroLivingPhoto.tsx` (server)
- `HeroGlIsland.tsx` (client)
- `heroGl.ts` (the module: `mountHeroGl({ hero, img, depthSrc }): { destroy(): void }`, no globals)
- `heroCover.ts` (pure cover and object-position maths)

**Tests:**

- The jsdom `getContext` returns `null`, so the "no-context" path keeps the image and sets `data-gl="off:no-context"`.
- The gate function: each abort condition.
- Depth-map selection from `currentSrc`.
- `heroCover` maths.
- A teardown on `data-motion` change.

### 5.7 Page transitions (View Transitions)

**React `<ViewTransition>`.**

- It works in the Next 16.3.6 App Router with no configuration. Next vendors a React canary that exports it (CONFIRMED: `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md:50`).
- Wrappers live in `page.tsx`, not in layouts (same guide).
- It is a canary API, so it is isolated in `src/components/motion/PageTransition.tsx` and `SharedElement.tsx`.

| Navigation | Transition |
|---|---|
| Forward links (Home → Apartment/Availability/Guide; list → detail) | `transitionTypes={['nav-forward']}`: the old page sinks (`opacity 0`, `translateZ(-120px) rotateX(6deg)`, 260 ms); the new page rises (`translateY(48px) rotateX(-6deg)` → 0, 420 ms, `--ease-glide`) |
| Back links | `nav-back`: the mirror of forward |
| Untyped (browser back/forward, refresh, Suspense) | `default: 'none'` |
| Guide card → guide detail | Shared element `name="guide-<slug>"` with `share="morph" default="none"` on the card image and the detail hero |
| Gallery thumbnail → lightbox | Shared element `name="photo-<id>"`; the lightbox opens inside `startTransition` so the morph runs. Morphing into a top-layer `<dialog>` is SUSPECTED; V6 verifies it in Chrome and Safari 26, and falls back to a 200 ms crossfade |
| Stay hub, portal, phones | Crossfade only (`vt-fade`, 200 ms) |
| Header (R3-V14, M29) | Anchored: its own group without animation, above the morphing elements |
| Theme switch (graft 5) | `document.startViewTransition` with `html[data-vt="theme"]`; the new root reveals with `clip-path: circle(0 → 150vmax)` from the switch's centre (`--vt-x`/`--vt-y`), 760 ms. Only when `data-motion="full"` and the API exists; otherwise the switch is instant |

Always add `::view-transition { pointer-events: none; }` (Next guide). With reduced motion or the switch off: `:root:not([data-motion="full"])::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }`, plus the same inside `@media (prefers-reduced-motion: reduce)`.

### 5.8 Reduced motion (summary)

Reduced motion comes from the OS setting or from the in-page switch (`data-motion="reduce"`). It gives:

- No canvas, and live teardown if the preference changes.
- No shutters (the window shows the photo).
- A flat room row or a fanned static deck.
- A flat map.
- Reveals already visible.
- Static kinetic rows.
- No sun movement.
- View Transitions and scroll behaviour: instant.
- Only colour and opacity changes on hover.

Screenshot proof in the mockup: `home-390-reduced.png`, `availability-390-reduced.png`, `stay-390-reduced.png`.

### 5.9 CSP interaction (unchanged in spirit)

- **Scripts.**
  - The production `script-src` is `'self' 'nonce-…'` (`src/lib/security-config.ts:141-157`, 213-222).
  - Lazy chunks load via `'self'`.
  - Inline code is only the existing nonce'd boot script.
  - No WASM, no `eval`, no blob workers.
- **Styles.**
  - Keep `style-src 'self' 'unsafe-inline'` **without** a nonce, so React and SSR `style=""` attributes such as `--i` and the hero custom properties keep working.
  - Do not add a style nonce: a nonce makes browsers ignore `'unsafe-inline'` (tech research §4.4).
- **Fonts.** Remove `https://fonts.googleapis.com` from `styleSrc` and `https://fonts.gstatic.com` from `fontSrc` in both the dev policy (`security-config.ts:84, 86`) and the production policy (`:145, :147`), with CSP tests (R3-V2).
- **Verification.** Every motion or 3D change is verified on a production build (`npm run build && npm start` or `npm run smoke:image`) with a `securitypolicyviolation` listener. The dev CSP is report-only and allows `unsafe-eval`, so dev cannot reveal violations.

### 5.10 Performance budget

- **Measured profile** for V5/V13: puppeteer (repo devDependency) on a production build, 390×844 @3x, CPU throttling ×4, network 1.6 Mbps down / 750 kbps up / 150 ms RTT.
- **Metrics:** `largest-contentful-paint` via PerformanceObserver, CLS via `layout-shift`, TBT from long tasks, median of 5 runs. This replaces the Lighthouse matrix removed by R3-D24; see the V13 advisory `audit:vitals` in §12.

| Budget | Limit |
|---|---|
| LCP (mobile profile) | ≤ 2.5 s on every public route |
| CLS | ≤ 0.05 |
| INP (interaction tests: calendar select, chip filter, menu open) | ≤ 200 ms |
| TBT | ≤ pre-redesign baseline + 50 ms (baseline recorded in PROGRESS.md before V2) |
| WebGL init | No long task > 50 ms on a real mid-range Android (owner device check; SwiftShader measured 397 ms and is not representative) |
| WebGL frame | ≤ 8 ms per frame at ≤ 0.65 MP render target |
| Critical-path fonts | ≤ 40 KB (one preload) |
| All fonts per page | ≤ 210 KB |
| Global CSS after R3-V12 | ≤ 30 KB gz (the mockup's whole stylesheet was 13.5 KB gz) |
| Mobile hero image | ≤ 60 KB WebP / ≤ 40 KB AVIF at 720 w |
| Desktop hero image | ≤ 180 KB at 1920 w |

**First-party client JS added by the redesign, per route (gz).** Measured as the sum of `encodedDataLength` of script responses minus the pre-redesign baseline.

| Route | Sync | Deferred | LCP element |
|---|---|---|---|
| Home `/{l}` | ≤ 14 KB (header menu, switches, bottom bar, season switch, rooms chips/deck, reveal observer, relief pointer, fact counters) | Hero GL ≤ 6 KB + depth map ≤ 2 KB (capable devices only); pointer effects ≤ 1.5 KB (fine pointer only) | Hero `<img>` (9:16 crop on phones) |
| Apartment | ≤ 8 KB (chips, lightbox) | Pointer effects ≤ 1.5 KB (fine pointer only) | Lead photo (`living_8` crop) |
| Availability | Calendar island (react-day-picker 9 + quote) ≤ 40 KB. SUSPECTED size; measure in R3-F09 and record | Pointer effects ≤ 1.5 KB (fine pointer only) | H1 text |
| Stay hub | ≤ 4 KB | none | H1 text |
| Guide list | ≤ 8 KB (search, chips, favourites) | Leaflet + map only when "Map" is chosen; pointer effects ≤ 1.5 KB (fine pointer only) | First card image or H1 |
| Guide detail | ≤ 3 KB | Pointer effects ≤ 1.5 KB (fine pointer only) | Detail photo |
| Phones, privacy, 404 | ≤ 1 KB | Pointer effects ≤ 1.5 KB (fine pointer only) | H1 text |
| Offline | ≤ 1 KB | none | H1 text |
| Guest sign-in, check-in, portal refresh | ≤ baseline + 2 KB | none | H1 text |
| Admin | 0 change | none | n/a |

- **Pointer effects** (R3-V14 M27/M30, `src/lib/motion/pointerEffectsRuntime.ts`): one lazy chunk, 1.0 KB gz in the R3-V14 production build. The site header mounts it on every non-stay route, so magnetic primary buttons work beyond home. Coarse-pointer devices never fetch it, and the stay routes (§5.1 calm mode) never load it.
- **Fact counters** (M34, `src/components/home/FactCounters.tsx`): about 0.6 KB gz (esbuild minified estimate), inside the home sync budget.

---

## 6. Iconography and brand mark

**Icon set** (`src/components/icons/Icon.tsx`).

- It extends the existing inline-SVG pattern in `src/components/navigation/MenuIcons.tsx`, which is folded into it: one `Icon` component with `name` and a union type; no sprite file, no icon font, no emoji.
- Spec: 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, stroke width 1.75, round caps and joins, `aria-hidden="true"`.
- Sizes: 20 px in buttons, 24 px standalone, 30 px in tiles, 44 px discs in highlights (10 px padding, `primary-tint` bg, `primary-text` stroke).
- An icon-only control always has a localized `aria-label`.

**Names** (57 listed here, plus `image` and `user` kept from the former MenuIcons), grouped:

- **Navigation:** `arrow-right`, `arrow-left`, `arrow-up-right` (external), `chevron-left`, `chevron-right`, `chevron-down`, `close`, `menu`.
- **Theme and language:** `sun`, `moon`, `motion` (a wave line with a slash for "reduce").
- **Contact:** `phone`, `message` (WhatsApp; generic bubble, the label says "WhatsApp"), `mail`, `camera` (Instagram; generic, the label says "Instagram"), `map-pin`, `directions`, `sos` (a ring with "112" set in text next to it).
- **Stay facts:** `area` (m²), `bed`, `bath`, `guests`, `stairs` (floor), `parking` (a "P" sign drawn as a stroked square with P), `mountain`, `walk`, `car`, `bus` (fixes the 🚗-for-bus bug, assets research §6), `plane`.
- **Amenities:** `wifi`, `snowflake` (A/C), `flame` (fireplace), `kitchen`, `washer`, `dishwasher`, `tv`, `baby` (cot, high chair), `key`, `lock`, `rules`.
- **Guide:** `heart`, `heart-filled`, `search`, `filter`, `grid`, `map`, `compass`, `museum`, `beach`, `fork` (food), `star` (kinetic separator and "best price" legend).
- **Status:** `info`, `check`, `alert`, `x-circle`, `clock`, `calendar`.

**Brand mark** (from `messinian-light/assets/favicon.svg`): a half sun over two wave lines.

- In the header the sun uses `--color-sun` and the waves `--color-accent`.
- App icons (R3-V3) replace today's QR-code PNGs in `public/icons/*.png` (180, 192 and 512 px, maskable): the mark on a `#0C3440` rounded square, with the mark inside the central 80 % safe zone. They are generated with `sharp` from the SVG.
- `favicon.ico` is regenerated from the same SVG.

---

## 7. Imagery

### 7.1 Rules

- Photo-first, real photos only. No stock photo is ever presented as the apartment.
- **Treatment:** no filters, no duotone. Night mode applies `--hero-tint` on the hero only.
- **Rounded corners:** `--radius-card` on cards; 0 on full-bleed; `--radius-object` inside the window frame.
- **Text over photos** only on the scrim: the hero content scrim is attached to the text block (`.hero__content::before`: 0 → .58 at 150 px → .80 at 150 px + 30 % → .90). Room and gallery captions use `transparent 35 % → .62 at 62 % → .88`.
- **Formats:** AVIF + WebP `<source>`s with pre-generated sizes via `<picture>` for hero crops. Everything else uses `next/image` with correct `sizes`. `alt` text is localized and descriptive; decorative duplicates get `alt=""`.
- **Loading:** only the LCP image uses `loading="eager"` and `fetchPriority="high"`; everything else is lazy. There is no separate `<link rel="preload">` for the art-directed hero, because the SSR `<picture>` is discovered by the preload scanner and `ReactDOM.preload` has no `media` option.
- **File size:** `check:image-assets` (512 KB cap) still applies. Recompress the heavy guide images: `archaeological-museum-hero.jpg` 293 KB, `railway-museum-hero.jpg` 278 KB, `taxi-hero.webp` 362 KB. Target ≤ 120 KB.

### 7.2 Hero crops and depth maps

**Generator.** `scripts/design/gen-hero-assets.ts` (tsx, imports `sharp` like `scripts/check-image-assets.ts:4`) is run once and its outputs are committed to `public/house/balcony/hero/`. The master is `public/house/balcony/balcony_1.jpeg` (1920×1281).

| Viewport (`<source media>`) | Crop | Files (w × h) | Crop origin | Quality | Expected size |
|---|---|---|---|---|---|
| `(max-width: 639px)` | 9:16 | `balcony-hero-9x16-480.{avif,webp}` (480×853), `-9x16-720` (721×1281) | Crop width 721, left = round((1920 − 721) × .62) = 743, top 0 | WebP q60, AVIF q45 | 721 w: ≈ 53 KB WebP / ≈ 36 KB AVIF (assets research) |
| `(max-width: 1023px)` | 4:5 | `-4x5-800` (800×1000), `-4x5-1024` (1025×1281) | Crop width 1025, left = round(895 × .60) = 537 | WebP q60, AVIF q45 | 1025 w: ≈ 72 KB / ≈ 48 KB |
| default | 3:2 | `-3x2-1440` (1440×961), `-3x2-1920` (1920×1281) | Full frame, `object-position: 60% 40%` | WebP q70, AVIF q50 | ≤ 180 KB at 1920 |
| Depth maps | same crops | `depth-9x16.webp` (216×384), `depth-4x5.webp` (256×320), `depth-3x2.webp` (480×320) | Same crop maths on the blurred full depth map | WebP q80 | ≤ 2 KB each (mockup: 0.9 / 1.8 KB) |
| Grain | n/a | `public/design/grain-light.webp`, `grain-dark.webp` (160×160, alpha) | Deterministic LCG noise (`gen-assets.mjs:41-45`) | n/a | ≤ 10 KB each |

Hero height: `height: min(760px, 88svh); min-height: 600px` (≥ 768 px: `min(900px, 88svh)`, min 640). It must stay below 100svh so the image stays the LCP element (web.dev on full-viewport elements). On mobile, `object-position` is `50% 50%` for the 9:16 crop.

The old `balcony_1_hero_720.webp`, `_1440.webp` and `balcony_1_hero.webp` are deleted in V5 once no reference remains. Search the whole repo, including `public/sw.js`, before deleting.

### 7.3 Per-room photo selection (Apartment and Home)

Marketing views: 25 photos. Excluded photos are listed with the reason, from the assets research.

| Room (chip) | Lead photo and crop | Others, in order | Excluded from marketing |
|---|---|---|---|
| Living | `living_8`, crop top 8 % (blown lamp, AC unit) | `living_6` (crop bottom 15 %), `living_2` (crop the orange table corner, bottom-left), `living_7`, `living_1` (entrance), `living_4`, `living_5` | `living_3`: branded packaging. `living_1_booking`: duplicate |
| Kitchen | `kitchen_2` | `kitchen_6`, `kitchen_3`, `kitchen_4`, `kitchen_5`, `kitchen_1` | none |
| Bedroom 1 | `bedroom_1`, crop left 20 % (lace curtain) | `bedroom_2`, `bedroom_3` | `bedroom_4`: near-duplicate of `_3`, and 4:3 |
| Bedroom 2 | `bedroom_2_5` | `bedroom_2_6`, `bedroom_2_3`, `bedroom_2_1` | `bedroom_2_2` (duplicate of `_1`), `bedroom_2_4` (duplicate of `_3`) |
| Bathroom | `bathroom_6` | `bathroom_7`, `bathroom_3` (washing machine), `bathroom_4` | `bathroom_5` (duplicate), `bathroom_1` (soft). `bathroom_8` (medicines) and `bathroom_2` (toilet signs) are **stay hub / house rules only** |
| Balcony | `balcony_1` | none | none |

- **Home room cards:** the lead photo of each room at 4:5 below 1024 px and 4:3 at 1024 px and above, by `object-position`. The balcony card uses `object-position: 70% 60%` (table and chairs), so it does not repeat the hero framing.
- **Guide cards:** use the museum `*-hero` photos at 16:10. The square drawn emblems are not used, to avoid a second visual style.
  - `viktoria-karelia-hero.jpg` is almost black (L = .018), so it uses the **art tile** instead.
  - The **art tile** is `band-bg` with a `band-accent` 56 px category icon and the category name. It is a deliberate illustrated tile used for any entry without a licensed photo, never beige or striped placeholders.
- **Phones:** photos become 64 px rounded thumbnails, not banners. The SOS illustration is not used.

### 7.4 Missing photos: art direction for the owner

| Need | Unlocks | Brief |
|---|---|---|
| Gulf from the balcony, golden hour | "Sea view" copy; the shader's water shimmer pass (the depth-mask pipeline supports it) | Same standpoint as `balcony_1`; 3:2 and 4:5; horizon level; 30–45 min before sunset |
| Balcony at blue hour, lanterns on | An honest Night-mode hero photo (swapped by theme instead of the tint) | Same framing as the day shot |
| Building exterior, entrance, street, the parking spot | Proof for "free parking" and "50 m from the Town Hall" | Daylight; no licence plates or faces |
| Host portrait | The host letter | Natural light on the balcony, 4:5, relaxed |
| Bedroom 2 reshoot; the shower or bath | A sharp Bedroom 2 set; resolves the "bathtub" vs "rainfall shower" contradiction (assets research §6) | Wide angle, level verticals, lights on + daylight |
| General | n/a | ≥ 2400 px long edge; no people except the host; no brands or packaging; no private documents |

Until then:

- Use the illustrated relief map and typographic sections.
- Do not use `phones/taxi-hero.webp` (the only seafront picture) as a view image. Its source is unrecorded and it is not the view from the apartment.

---

## 8. Components and states

Primitives live in `src/components/ui/` and extend the existing `Button`, `Surface`, `Badge` and `EmptyPanel` with `class-variance-authority` and `clsx`, which are already dependencies. Every interactive element has these states:

- **Default.**
- **Hover** (fine pointers only, `@media (hover: hover) and (pointer: fine)`).
- **Active.**
- **`:focus-visible`:** a 3 px `focus` ring with 3 px offset; `band-focus` on bands and photos.
- **Disabled** (`aria-disabled` for items that must stay focusable).

Colour always comes from tokens.

| Component | Variants / parts | States and rules |
|---|---|---|
| **Button** | `primary` (primary / primary-fg, glow shadow) · `secondary` (surface, accent text, `border-strong`) · `ghost` (transparent, fg, underline on hover) · `glass` (on photo: bg `rgb(255 248 238 / .12)`, text `#FFF8EE`, border `rgb(255 248 238 / .5)`, blur 10 px) · `on-band` (band-accent / band-accent-fg) · `outline-on-band` (transparent, band-fg, border `rgb(246 239 228 / .45)`) · `link-arrow` (text link and an arrow that nudges 4 px on hover). Sizes: `sm` 40 px (16 px padding, 15 px text), `md` 48 px (22 px, 16 px), `lg` 56 px (28 px, 17 px); `block` | Hover: primary → primary-hover plus glint (M18). Active: `scale(.98)`. Disabled: opacity .55, no hover. Loading: `aria-busy`, a spinner replaces the leading icon, the label is kept, the width is fixed. External (Airbnb): `arrow-up-right` icon, `rel="noopener"`, visually hidden "(opens Airbnb)". Weight 600, **never uppercase**. `asChild` for links (existing API) |
| **IconButton** | 44 px circle, 1 px `border`; `on-photo` variant (glass) | Hover: bg `surface-sunken`. A localized `aria-label` is required |
| **Chip** | Filter / toggle chip, 40 px, pill, 1 px `border-strong`, 15 px 500; optional count (`tabular-nums`, `fg-muted`) | Pressed (`aria-pressed="true"`): bg `fg`, text `bg`, count at 80 % opacity. Hover: `surface-sunken`. A chip row scrolls sideways with `scroll-padding-inline: var(--gutter)`. **Chips without content are not rendered** (plan V8) |
| **Segmented** | Container `surface-sunken`, 3 px padding, pill; items ≥ 36 px | Selected: bg `surface`, text `fg`, `shadow-rest`. Used by LanguageSwitch, the theme setting in the menu, and SeasonSwitch |
| **LanguageSwitch** | Segmented with **links**: `EN` / `ΕΛ` | Each is an `<a hreflang lang>` to the same path in the other locale; query and hash are preserved (reuse `LocaleSwitcher.tsx` logic). The current one has `aria-current="true"`. Keeps the existing locale cookie behaviour |
| **ThemeSwitch** | Header IconButton (sun/moon) + a menu Segmented "Auto · Day · Night" | Toggle: stores `theme`, sets `data-theme`, runs the circular View Transition (§5.7). "Auto" removes the key and the attribute. Label: "Switch to night" / "Αλλαγή σε νυχτερινό" (and the reverse) |
| **MotionSwitch** | Toggle button in the footer and the menu: "Reduce motion" / "Λιγότερη κίνηση"; pressed shows "Allow motion" / "Επαναφορά κίνησης" | `aria-pressed`. When the OS already reduces motion: disabled, with the note "Reduced by your device settings" / "Μειωμένη από τις ρυθμίσεις της συσκευής σας" |
| **Card** | `surface`, 1 px `border`, `radius-card`, `shadow-rest` | Clickable card: one stretched primary link; nested buttons (Save) sit above it. Hover (fine): `translateY(-4px)`, `shadow-raised`, image `scale(1.05)` over 900 ms |
| **Tile** (stay hub) | Card, min-height 150; `portal` variant on `band-bg`; `sos` variant | `portal`: display title 28 px (40 px at ≥ 1024), CTA `on-band`. `sos`: "112" 700 in `primary-text` as a `tel:112` link. `locked` variant (Wi-Fi, check-out before sign-in): `lock` icon plus "Sign in to see" |
| **Section** | `default` (bg) · `sunken` · `band` · `warm`; head = Eyebrow + Title (`d2`) + Lead | Eyebrow: 13 px, 600, `primary-text`, a 28 px leading rule; EN uppercase with tracking .16em, EL sentence case with tracking .04em and 14 px |
| **Callout** | `info` · `success` · `warning` · `danger` (the `*-bg` / `*` tokens), icon, `radius-tile`, padding 12/14 | `role="status"` for live notes; `role="alert"` only for blocking errors |
| **Field** | Label (15 px 600) above; input 48 px, `radius-field`, `surface` bg, 1 px `border-control`; hint 13 px `fg-muted` | Focus: ring. Error: `danger` 2 px border, message with icon, `aria-invalid`, `aria-describedby`. Phone: `inputmode="tel" autocomplete="tel"` |
| **SiteHeader** | Glass pill, sticky `top: 10px`, 56 px, margin `10px var(--gutter)`, overlaps the hero via a negative bottom margin. Brand (mark + wordmark) on the left; nav at ≥ lg; tools (LanguageSwitch, ThemeSwitch, CTA, menu button below lg). **Variants:** `marketing` (nav: Apartment · Availability · Kalamata guide · Contact (`/{l}#contact`); CTA "Check dates" at ≥ sm) · `guide` (same nav, **no CTA**) · `stay` (brand links to `/{l}/stay`; items: Your stay · Kalamata guide; no marketing nav, no CTA) | Current page: `aria-current="page"` plus a 1.5 px `primary` underline. After 24 px of scroll: `shadow-raised`. Brand label min 12 px |
| **MobileMenu** | `<dialog>` opened with `showModal()`, sheet from the right, `min(88vw, 380px)`, `surface-raised`, `shadow-overlay`. Contents: nav links (display 22 px), LanguageSwitch, theme Segmented (Auto/Day/Night), MotionSwitch; in the marketing variant also Call and WhatsApp (text plus icon) | Focus trapped natively; Esc and backdrop click close it; `html:has(dialog[open]) { overflow: hidden }`; focus returns to the menu button. Entry via `@starting-style` (M23) |
| **SiteFooter** | Waves rule (1.4 px `border-strong`). **Marketing:** brand; nav; contact (phone, e-mail, Instagram, WhatsApp); address and legal identity (after R3-L1); Privacy; "Staying with us now? Your stay →"; MotionSwitch; LanguageSwitch. **Stay:** Privacy, MotionSwitch, LanguageSwitch | Bottom padding `calc(96px + env(safe-area-inset-bottom))` when a bottom bar exists |
| **BookBar** (mobile, < lg; Home and Apartment only) | Glass pill, fixed 12 px from the edges plus `safe-area-inset-bottom`: "from €X / night · Free tonight" (or "Next free night: Tue 20 Oct") + `sm` primary "Check dates" | Hidden until the hero leaves the view, and while any in-page booking CTA is visible (IntersectionObserver). Hidden entirely when there is no price data. `visibility` is toggled for accessibility |
| **FactStrip** | Six facts: `90 m²` · `2` bedrooms · `1` bathroom · `4` guests · `2nd` floor · `P` free parking. Last cell is a `link-arrow` "See free dates" (**no price**; fixes the duplicate price) | Card `shadow-raised`, overlaps the hero by 26 px (mobile) / 72 px (≥ lg). 2 columns on mobile, one row at ≥ lg. Motion M6 |
| **KineticBand** | Two rows, `aria-hidden="true"`, `lang` per row, SVG star separators, `overflow: clip` | M7. Pure decoration; the information exists elsewhere |
| **SeasonSwitch + Highlights** | Segmented "Summer (Apr–Oct)" / "Winter (Nov–Mar)" + 4 highlight cards per season (icon disc, `h3`, 15 px text, link "See summer dates" / "See winter dates" to `/{l}/availability` with the first month of that season in the F09 fragment scheme, e.g. `m=YYYY-MM`) | The default season is computed server-side from `propertyToday(PROPERTY_TIME_ZONE, now)` against `CLIMATE_FEE_SCHEDULE.highSeasonMonths`. The switch has `aria-controls`, and the list has `aria-live="polite"`. Card content comes from R3-C1 strings; no invented claims. M8 and M9 |
| **BalconyWindow** | Frame (10 px, 14 px at ≥ 700), aspect 4:5 on mobile / 16:10 at ≥ 700, `perspective: 1500px`; two CSS-gradient louvred shutters (only under motion), flare layer, italic quote below | M10. The shutters are `aria-hidden` |
| **RoomsShowcase** | Chips (6 rooms, synced to the centred or active card) + track. Below lg: coverflow, card width `min(68vw, 300px)`, 4:5, snap centre. At ≥ lg: deck fan, 330×420 cards. Captions (room number 13 px + name display 28 px + one line) **on the active or centred card only** | Chips and arrow keys move the active card; Enter opens `/{l}/apartment#<room>`; "See all photos". M11 and M12 |
| **NightsTeaser** | The next 14 nights: 7 columns on mobile (two rows, no sideways scroll), 14 at ≥ lg. Each cell: weekday (12 px, EL not uppercased), date (display 22 px), price 12 px 600. Booked: hatch + strike + "Booked" in the accessible name. Lowest price: `cal-best` **pill**. Legend + "First night at this price: Sun 18 Oct" + CTA "See availability & prices" | Rendered only with fresh or stale data (stale adds the note "Updated 14 h ago"). M13 |
| **LocationRelief + DistanceList** | Band section: DistanceList (source of truth: numbered rows with name, "how", and value in display 22 px) + the relief map (`role="img"` with a text alternative, "Illustrative map, not to scale. Positions from the guide's map data.") | Pins come from `src/data/mapLocations.ts` coordinates. Below 700 px, non-home pins show number only. The home label reads "You're staying here" / "Εδώ μένετε". The overlapping "50 m" label is fixed by offset. M14 and M15 |
| **HostLetter** | Paper card (`radius-object`, rotated −.8°, `shadow-object`, grain), italic title, drop cap in `primary-text`, signature, meta (languages, reply time) | Fields render only when owner data exists (§1.4). Motion: fade only |
| **FAQAccordion** | `<details name="faq">` (exclusive accordion; Chrome 120, Safari 17.2, Firefox 130), summary 48 px min, 17 px 600, "+" rotating 45° in `primary-text`, answer `fg-muted` 60ch; first item open | Keyboard: native. M24 |
| **ContactBand** | Warm band: title (d1), actions: "Book on Airbnb" (`on-band`, only when the listing URL is configured), WhatsApp and Call (`outline-on-band`, text + icon, never icon-only), e-mail and Instagram links | `id="contact"`. WhatsApp uses `wa.me/<host phone>` with dates only (R3-F09 rule) |
| **Calendar** (react-day-picker 9, already a dependency, skinned; logic from `src/lib/availability/stayQuote.ts`) | Months: `surface`, `radius-card`, `shadow-rest`. Caption: display 26 px, nominative. Weekday row 12 px 600 `fg-muted` (EN uppercase, EL sentence case, full day names in `abbr title`). Cells ≥ 44 px (mobile min-height 58): date 16 px 600 + price 12 px. **Mobile (< md): stacked months**, 3 at first plus "Show 3 more months" up to the `AVAILABILITY_HORIZON_DAYS` horizon. **≥ md: 2 months side by side** with previous/next IconButtons and a page turn (M19) | **Day states:** free · best (pill) · booked (hatch, strike, `aria-disabled`, name "…, booked") · check-out-only (the first booked night after the chosen check-in, clickable, labelled "out") · past (opacity .45, disabled) · beyond horizon (disabled) · check-in and check-out (`cal-selected`, 12 px outer radius) · in range (`cal-range`) · today (underline, 3 px offset) · focus (inset ring) · hover (`surface-sunken`). **Keyboard:** WAI-ARIA APG grid (arrows, Home/End, PageUp/PageDown, Enter/Space; react-day-picker default) + `aria-selected`. **Live region** (polite) messages: "Choose your check-in night" → "Now pick your check-out, latest Fri 6 Nov" (`maxCheckOut`) → "Minimum 2 nights from this date" (`minimumNightsFor`) → **crossing rule:** "Sat 24 Oct is booked, so Tue 27 Oct is your new check-in" (graft 8). Messages also show **inside** the calendar as a `warning` Callout |
| **SummaryCard** (quote) | `surface`, `radius-dialog`, `shadow-raised`; sticky `top: 90px` at ≥ lg. Parts: eyebrow "Your stay"; dates in display 32 px ("18–23 Oct", **en dash, never →**); sub line (full dates, nights, "up to 4 guests"); lines **grouped by price** ("5 nights × €85"); climate fee **grouped by season** ("4 × €8 Apr–Oct", "1 × €2 Nov–Mar"; `stayPolicy.ts`); dashed rule; total (display 44 px, `primary-text`, tabular); fine print; CTAs; trust line "You pay nothing on this site: booking and payment happen on Airbnb." | **States:** empty ("Pick your dates to see the total") · check-in chosen · complete · rejected (the `StayRejection` reason as a `warning` Callout) · stale data (warning note) · unavailable / not configured (the calendar is hidden; the card shows contact CTAs only; the page still works). CTAs: "Book these dates on Airbnb" (primary, only when the URL is set; Airbnb date parameters stay off until verified, per F09), WhatsApp and Call (secondary, text labels). Motion M20 |
| **QuoteBar** (mobile, < lg) | Glass pill: "€465 · 5 nights · total" + "Book on Airbnb" (or "See details", which scrolls to the card, when there is no URL) | Shown only when a stay is complete **and** the SummaryCard is not in view |
| **GalleryLightbox** | `<dialog>` full screen, bg `viewer-bg`; a horizontal **native scroll-snap** track (`scroll-snap-type: x mandatory`), images `object-fit: contain`; top bar: room name and "7 / 25" (tabular), close (44 px); previous/next at ≥ md (48 px glass IconButtons) | Swipe = native scroll (no gesture library). Keys: ←/→ (`scrollBy`), Home/End, Esc. The counter updates on `scrollend`, with an IntersectionObserver fallback. Only the current ±1 images are eager. Open and close morph (§5.7); reduced motion is instant. Replaces the `framer-motion` ±1000 px spring slides in `ApartmentGalleryLightbox.tsx:36-54` |
| **GuideCard** | Media 16:10 (photo or art tile); meta: category (`olive`, 13 px 600) · straight-line distance ("1.7 km", `fg-muted`, computed from the apartment coordinates in `mapLocations.ts`); title display 22 px; summary 15 px, 2-line clamp; footer: "Directions" (`link-arrow`, external, the existing Google Directions link) + Save | Save = favourite toggle (`aria-pressed`, `heart` / `heart-filled` in `primary-text`) with a burst (M21). Shared element name `guide-<slug>` |
| **GuideFilters** | Search field (48 px, `search` icon, `type="search"`, clears with Esc) + category chips with counts + List/Map Segmented | Filtering is client-side over the SSR list; the result count is announced in a polite live region; the empty state is an EmptyPanel with "Clear filters" |
| **MapCard** (Leaflet, restyled; tiles per R3-M1) | Pins are `L.divIcon` HTML identical to the relief pins (a paper pill with a number disc; home pin terracotta). Popup = compact GuideCard (title, category, distance, Directions, Details) | Keyboard: the list stays the primary navigation; the map is supplementary. Popup colours use tokens; no per-component dark selectors |
| **Toast** | Bottom centre, above the bars, `surface-raised`, `shadow-overlay`, `radius-tile` | `role="status"`; auto-dismisses after 5 s unless it has an action |
| **EmptyPanel / Skeleton** | EmptyPanel: icon, title, text, one action. Skeleton: `surface-sunken` blocks | Skeleton shimmer only under `motion-ok`; otherwise static |

---

## 9. Page layouts

Shell per route: M = marketing header, G = guide header, S = stay header (§8). Every page keeps the existing skip link (`src/app/[locale]/layout.tsx`) and `<main id="main-content">`.

### 9.1 Home `/{l}` (M, BookBar) — R3-V5

1. **Hero** (living photograph).
   - Content in the bottom third, behind the scrim: H1 "Dolce far niente" (two lines, the second indented `.9em`, `lang="it"`), lede (tagline + "2nd floor · 50 m from Kalamata Town Hall"), price line "from €X / night" (display 32 px number), CTAs "Check dates" (`primary`, links to availability) and "Book on Airbnb" (`glass`, only when the URL is configured).
   - At ≥ 768 px: two-column content (text | actions) and a vertical "Scroll" hint (hint line runs 2×, ends by 4.6 s).
   - M1–M5.
2. **FactStrip** overlapping the hero.
3. **KineticBand.**
4. **Intro + Highlights** with the SeasonSwitch (eyebrow "The apartment", title d2, lead).
5. **BalconyWindow** (eyebrow "The balcony", title, window, italic quote).
6. **RoomsShowcase** ("A slow walk through the rooms"; its headline sits outside any transformed element, which fixes the cut-off line).
7. **NightsTeaser** (eyebrow "Availability", "from €X" with the "First night at this price: …" explanation, CTA).
8. **Location** (band): title "Between Taygetos *and the gulf*", lead, DistanceList, LocationRelief.
9. **HostLetter** (`id="host"`; `/about` 308-redirects here, per V5).
10. **Optional ReviewsStrip** (only with the owner's real Airbnb data, §1.4).
11. **FAQ**: check-in/out, parking, climate fee, cancellation (texts from R3-L6/L7), children and cot.
12. **ContactBand** (`id="contact"`).
13. **Footer** with "Staying with us now? Your stay →".

The mockup's `home-390-light.png` and `home-1440-light.png` show order and proportions. Where they conflict, the fixes in §0.3 apply.

### 9.2 Apartment `/{l}/apartment` (M, BookBar) — R3-V6

- Page head: eyebrow, H1 "The apartment" (d1), a lead of one paragraph, FactStrip (inline, no overlap).
- Lead photo: `living_8` crop, 3:2 at ≥ md and 4:5 on mobile, `radius-card`, LCP (eager, high priority).
- Sticky room chips below the header (`top: calc(var(--header-offset) + var(--header-h) + 8px)`), anchor-linking to the room sections. The active chip follows scroll via IntersectionObserver.
- Per room (`id` = room key): title d3, one line, a masonry gallery using CSS `columns` (2 on mobile, 3 at md, 4 at xl; 8/12 px gap; `break-inside: avoid`). Photos in the §7.3 order, tapping opens GalleryLightbox.
- Amenities: grouped lists with icons (§6); 2 columns at ≥ md; facts only from `apartmentData.ts` after the R3-C1 contradiction fixes.
- CTA section: "See free dates" (primary) + "Book on Airbnb" (secondary, when the URL is set).
- The "Contact" link targets `/{l}#contact` (plan V6).

### 9.3 Availability `/{l}/availability` (M, no BookBar; QuoteBar) — R3-V7 (skins R3-F09)

- Back link "The apartment" (`link-arrow`, reversed).
- H1 "Free dates & prices" (d1) and lead "Choose your check-in night, then your check-out day. Every free night shows its price."
- Below lg: Calendar (stacked months) → legend (free · price per night, best price pill, booked hatch, your stay) → in-calendar note → SummaryCard. At ≥ lg: a grid of `minmax(0, 1fr) 380px`, with the Calendar (2 months) on the left and the sticky SummaryCard on the right.
- Then the sections from F09: How to book, Cancellation, Withdrawal notice, Climate resilience fee, Prices disclaimer, Contact. Each is a plain Section with a `d3` title and `fg-muted` body, 65ch.
- **Data states** (from `availabilityRepository`):
  - fresh: normal;
  - stale (> 12 h): a `warning` Callout "Availability updated 14 h ago; the final check happens on Airbnb";
  - unavailable or not configured: the calendar is replaced by an `info` Callout plus the contact CTAs.
- The page must work without JS as a static list of the next 60 nights with prices, and the CTAs still work (F09 test: "repository failure still shows the CTAs").

### 9.4 Your stay hub `/{l}/stay` (S; calm mode; **no booking CTA, no BookBar, no WebGL, no scroll effects**) — R3-V9

- H1 "Welcome home." / "Καλώς ήρθατε." (d1) with a decorative half-sun (sun rays at .5 opacity, behind the text), and a one-line lead.
- Tiles grid: `repeat(2, minmax(0, 1fr))`, gap 12; at ≥ lg `repeat(4, minmax(0, 1fr))`, with the portal tile spanning 2×2.
  1. **Portal** (band tile, full width on mobile): signed out, "Sign in to your stay" → `/{l}/guest`; signed in, "Open your check-in" → `/{l}/check-in`. Rendered only when the portal feature flag is on (`getFeatureFlagsAsync`).
  2. **Wi-Fi** and 3. **Check-out**: `locked` until sign-in; after sign-in they link to the matching anchors of the check-in page.
  4. **House rules** (links to the rules section).
  5. **Important phones**: an SOS row "112, free from any phone" as a `tel:112` link, plus the next 2 numbers as `tel:` rows.
  6. **Kalamata guide**, with a search field that submits to the guide list.
  7. **Favourites** (count).
- The footer is the slim stay variant.

### 9.5 Kalamata guide — R3-V8

- **List** `/{l}/moments` (G):
  - H1 "Kalamata guide" / "Οδηγός Καλαμάτας", lead.
  - GuideFilters: search, chips with counts (only categories with content), List/Map.
  - Cards sorted by straight-line distance: `repeat(1|2|3, minmax(0, 1fr))` at base/sm/lg.
  - "Map" view: restyled Leaflet, lazy (Leaflet and CSS load only on toggle) with the numbered list below; the URL keeps `?map=1` (existing).
  - Calm-mode motion plus the shared-element morph into detail.
- **Detail** `/{l}/[category]/[slug]` (G):
  - Back link; hero photo 16:10 (`radius-card` below xl, full-bleed band at ≥ xl) with shared element `guide-<slug>`; category and distance meta; H1 d1; summary lead; facts list (address, hours if present, phone buttons as `tel:`); "Directions" (secondary, external); Save.
  - "More nearby": 3 GuideCards.
  - No booking CTA.
- **Favourites** `/{l}/favorites` (G): H1, grid of saved GuideCards, EmptyPanel ("No favourites yet. Tap the heart on any place.").

### 9.6 Important phones `/{l}/phones` (G, calm)

- H1 "Important phones".
- **Emergency block first:** a `band` Tile "112, free from any phone, EU-wide" with a 56 px `on-band` "Call 112" button.
- Then grouped rows (Police, Hospital, Fire, Taxi, …). Each row: 64 px thumbnail (or icon disc), name (17 px 600), description (15 px muted), number (tabular, `fg`), and a 48 px "Call" button (`secondary`, `phone` icon plus text) as a `tel:` link.
- Rows separated by `border` hairlines; no cards.

### 9.7 Guest sign-in `/{l}/guest` (S, calm) — R3-V9

- A centred column, max 480 px.
- H1 "Sign in to your stay" (d2); lead explaining that the host sends a link.
- Card with Fields (phone, password), primary button (block, loading state), `danger` Callout for errors (generic messages, no account enumeration: keep the current server messages), and a privacy link.
- **Claim flow** (grant token present): H1 "Set up your stay", fields phone + new password + confirm, and the terms checkbox with the privacy link outside the hashed span (R3-L3).
- **Password-less account** state and **expired grant** state as `info` / `warning` Callouts with the host contact.
- `UnifiedGuestClient` logic is unchanged; restyle only.

### 9.8 Check-in `/{l}/check-in` (S, calm, authenticated) — R3-V9

- H1 "Your stay" with dates.
- Sections as cards:
  - arrival (address, `StaticLocationMap` restyled with tokens, Directions);
  - Wi-Fi (`WifiAccessCard`, a copy button with a toast);
  - house rules (list with icons);
  - check-out (time and steps);
  - emergency numbers (R3-L10; `tel:112` first);
  - a link to the guide.
- The warm boutique palette scoped in `12-apartment-checkin.css:185-557` is replaced by tokens.
- **Portal refresh** `/{l}/portal/refresh`: a centred calm status, "Signing you in…", with the mark; no spinner loop longer than 5 s (after 5 s show the text "Still working…" and a manual link).

### 9.9 Privacy `/{l}/privacy` (G) — R3-L2, styled per V4 tokens

A single editorial column (65ch), H1 d1, lead, sections with d3 titles, body at 17 px / 1.7, and a table of processing purposes with `border` rules. No motion beyond the header.

### 9.10 404 (`src/app/[locale]/not-found.tsx`, root) and errors (`error.tsx` ×2)

- **404:** the S-style minimal header; a centred brand mark (96 px); H1 "This page is taking a siesta." / "Αυτή η σελίδα κάνει σιέστα."; lead; three links: Home, Kalamata guide, Your stay. No photo.
- **Error:** the same layout, H1 "Something went wrong", a "Try again" button (the `reset()` action) and a Home link. No technical details.

### 9.11 Offline (`/offline`, `/{l}/offline`) — R3-V9

- A calm page: the mark; H1 "You're offline" / "Είστε εκτός σύνδεσης".
- The cached pages list (existing `OfflineActions`) as `link-arrow` rows.
- A `band` Tile "Emergency: 112" (a `tel:` link works offline).
- The fonts and tokens CSS must be in the service-worker precache so the page renders in brand fonts offline: check `public/sw.js` in V9.

### 9.12 Admin `/admin/*` — R3-V10 (tokens only)

- No redesign, no motion, no fonts beyond the global stacks.
- Replace colours in `src/styles/13-compatibility-admin.css` and the admin components with the semantic tokens (`surface`, `fg`, `border-control`, `danger` and so on), remove the per-component dark selectors, and check contrast (G-CONTRAST).
- Admin pages use the `stay`-style minimal header (brand + "Admin"), not the marketing shell.
- `src/app/admin/guests/page.tsx` keeps `framer-motion`, wrapped in `<MotionConfig reducedMotion="user">` (tech research §7).

---

## 10. Dependencies

**Added: none.**

| Need | Choice | Why it beats a new package |
|---|---|---|
| 3D hero | Hand-written WebGL (≤ 6 KB gz) | three.js ≈ 176 KB, R3F ≥ 233 KB, OGL 10–15 KB for no gain; the CSP blocks their WASM loaders and CDN defaults (§5.6) |
| Scroll and 3D motion | CSS scroll-driven animations, CSS 3D, `@starting-style`, IntersectionObserver | 0 KB; runs on the compositor; GSAP and Lenis are rejected |
| Page and element transitions | React `<ViewTransition>` (shipped with Next 16.3.6) + `document.startViewTransition` | 0 KB extra |
| Lightbox gestures | Native scroll-snap inside `<dialog>` | 0 KB; native momentum; replaces the `framer-motion` usage on public routes |
| Calendar | `react-day-picker` ^9.14.0 (**already installed**, planned by R3-F09) | Accessible grid and keyboard support already built in; skinned with tokens |
| Map | `leaflet` ^1.9.4 (already installed) | Existing; restyle only |
| Fonts | Vendored woff2 files + `next/font/local` (part of Next) | Not an npm dependency; `npm pack` is a one-time download (§2.2) |

**Kept but reduced.** `framer-motion` 11.18.2 is no longer used on public routes after V6; its only remaining user is `src/app/admin/guests/page.tsx`. Removing it is a dependency change outside the approved removal list, so it is an **open question** for the owner (§13). The default is to keep it.

---

## 11. Implementation layout

Current layout (2026-10-06):

```
src/app/fonts/            fonts.ts, 6 × .woff2, OFL-NotoSerifDisplay.txt, OFL-Commissioner.txt, SOURCES.txt
src/styles/tokens.css     @theme tokens (colour, font, text, radius, shadow, ease) + dark overrides in @layer base
src/styles/base.css       @layer base: html/body (font-synthesis, grain, bg), focus ring, headings, links, :lang(el) rules, selection
src/styles/motion.css     all motion (gated by §5.2), keyframes, View Transition rules, reduced-motion reset
src/styles/components/    ui, shell, hero, apartment, lightbox, home, guide, legal, calendar, stay, admin (.css, unlayered, imported by
                          globals.css) and map.css (imported by LeafletMap.tsx with leaflet.css)
src/components/ui/        Button, IconButton, Chip, Segmented, Surface, Section, Callout, Badge, MetricCard, EmptyPanel
src/components/icons/     Icon.tsx, BrandMark.tsx, iconNames.ts
src/components/shell/     SiteHeader, MobileMenu, SiteFooter, BookBar, AvailabilityBookBar, LanguageSwitch, ThemeSwitch, MotionSwitch, shellLinks.ts
src/components/motion/    SharedElement.tsx
src/components/home/      hero/* (HeroLivingPhoto, HeroGlIsland, heroGl, heroCover), FactStrip, FactCounters, KineticBand, Highlights,
                          SeasonHighlights, BalconyWindow, RoomsSection, RoomsShowcase, NightsTeaser, LocationSection, ReliefTilt, HostLetter,
                          FaqSection, ContactBand, HomeRevealObserver
src/components/gallery/   ApartmentGallery, GalleryLightbox, photoMorph.ts
src/components/guide/     GuideList, GuideCard, GuideDetail, FavoritesList, PhonesDirectory, SaveButton (map: src/components/InteractiveMap.tsx,
                          LeafletMap.tsx, maps/tileSource.ts)
src/components/stay/      StayHub, StayTile, StaySessionTiles, EmergencyTile, StatusPage
src/lib/motion/           scheduleIdle.ts, heroCapability.ts, motionPreference.ts, pointerEffects.ts, pointerEffectsRuntime.ts
scripts/design/           gen-hero-assets.ts (design:hero), gen-og-images.ts (design:og), gen-app-icons.ts (design:icons)
public/house/balcony/hero/  crops + depth maps;  public/design/grain-*.webp;  public/brand/mark.svg;  public/og/og-{en,el}.jpg
```

**`src/app/globals.css` target order** (after R3-V12):

```css
@layer theme, base, components, utilities;
@import "tailwindcss";
@import "../styles/tokens.css";
@import "../styles/base.css";
@import "../styles/components/…";
@import "../styles/motion.css";
```

**During migration (history).** R3-V2 wraps every legacy import in a cascade layer placed between `base` and `components`: `@layer theme, base, legacy, components, utilities;` and `@import "../styles/01-tokens.css" layer(legacy);` for each of `01…13`. New components and utilities then reliably beat legacy CSS.

- **Risk.** Today legacy CSS is unlayered and beats Tailwind utilities; after the change, utilities win over legacy rules. V2 must therefore run G-VIS on **every existing route** (en/el, light/dark, 390/1440) and fix regressions inside V2.
- **Fallback if the regressions are extensive:** keep legacy unlayered, import new CSS after it unlayered, and use class selectors only (no element selectors) in new CSS until V12.

**After R3-V12b.** The fallback was applied (O38) and R3-V12b deleted the legacy sheets, so `globals.css` is `tailwindcss`, `tokens.css`, `base.css`, `motion.css`, then `components/*.css`. The component sheets stay unlayered, because layering them now would let utilities beat them. With no legacy rule left to compete, the class-selectors-only constraint no longer applies to new CSS. The existing class-only rules (two classes for colour) are kept as they are.

---

## 12. Migration plan (R3-V2 … R3-V13)

*Status: done (R3-V14 added the motion and 3D pass of §5.5). The table is the plan as executed; the legacy files it names no longer exist.*

- **Every task:**
  - The standard gates G-STD; G-VIS (390/1440, light/dark, en/el for changed routes); G-CONTRAST (the design-token test plus measured pairs for new surfaces); G-I18N for new strings.
  - Deletes the legacy CSS and components it replaces (the "each V-task deletes the CSS it replaces" rule).
  - Does a knip-clean removal with a documented reference search before deleting anything.
- **Motion changes** are also verified on a production build with a CSP violation listener (§5.9).
- **Baselines.** Before V2, record the baseline of per-route JS bytes, LCP and TBT (§5.10) in PROGRESS.md.

| Task | Scope | Legacy removed | Extra gates / acceptance |
|---|---|---|---|
| **R3-V2 Foundations** | 1. Fonts: `npm pack` fetch (after O29 issuer check), commit the 6 woff2 files + OFL + SOURCES, `fonts.ts`, classes on `<html>`; **Turbopack spike** (§2.3) with its documented fallback. 2. `tokens.css` (all of §3.2, §4, §5.3), `base.css`, `motion.css` skeleton with the gate, the `motion-ok` variant. 3. New boot script (§5.2) + `motionPreference.ts`. 4. Legacy CSS into `layer(legacy)` (§11) with full-site G-VIS. 5. `Icon.tsx` (§6) replacing `MenuIcons.tsx` and the emoji icons in `categories.ts`, `house.ts`, `about.ts`. 6. Primitives in `src/components/ui/` (§8: Button, IconButton, Chip, Segmented, Card, Tile, Section, Callout, Field). 7. CSP: remove the Google Fonts origins (`security-config.ts:84, 86, 145, 147`) + tests. 8. `tests/unit/design-tokens.test.ts` (dark-block parity + every §3.3 pair) and the NFC check on i18n. 9. `scripts/design/gen-hero-assets.ts` + generated assets | `01-tokens.css` font stacks (replaced); nothing visual yet except fonts | Network log: 1 font preload; EN page without Greek glyphs does not fetch Greek files (or the fallback is applied and documented). CSP tests updated (G-REG). Every existing route unchanged except typography (G-VIS diff reviewed) |
| **R3-V3 Brand** | Name "Dolce Far Niente · Kalamata" in `appTitle`, root `metadata.title`, `appleWebApp.title`, manifest `name`/`short_name`, `theme_color`/`background_color` `#F6F0E6`, `viewport.themeColor` pair (§3.2), JSON-LD logo (B17), app icons and favicon from the mark (§6). `HOST_CONTACT` gains Instagram and WhatsApp | QR-code icons in `public/icons/` | Icons are maskable-safe (80 % zone). Manifest validated |
| **R3-V4 Shell** | SiteHeader (3 variants), MobileMenu, SiteFooter (2 variants), LanguageSwitch, ThemeSwitch (+ circular View Transition), MotionSwitch, BookBar component (wired in V5/V6); `body` switches to `bg` / `fg` / `font-text` + grain site-wide; `TopControls` replaced | `TopControls.tsx`, `ThemeToggle.tsx`, `LocaleSwitcher.tsx` (logic moved), `navigation/menuLinks.ts` if unused, `02-layout.css` header, top-gap and nav parts, `04-theme.css` global dark overrides that fight the tokens | Keyboard: menu focus trap and return, Esc, switches reachable. The stay variant has no booking link (unit test on the link list). Theme reveal is skipped under reduced motion |
| **R3-V5 Home** | §9.1 in full: hero (crops, scrim, M1–M4) + **WebGL island (M5)**, FactStrip, KineticBand, Highlights + SeasonSwitch, BalconyWindow, RoomsShowcase (coverflow/deck), NightsTeaser (needs the F09 repository; if F09 is not merged, the section is omitted behind a data check), LocationRelief + DistanceList, HostLetter, FAQ, ContactBand, BookBar. `/about` → 308 to `/{l}#host` (proxy redirect helper from R3-F10). Fix the Check-In card 404 | `HomeHero.tsx`, `SearchBar.tsx`, `HomeInteractiveBar.tsx`, `DeferredHomeInteractiveBar.tsx`, `DateRangePicker.tsx` (if unused), `home/HomeFeatureGrid.tsx`, `ContactSection.tsx` / `DeferredContactSection.tsx` (replaced), `03-home.css`, `07-search-listing.css` booking-bar parts, `11-contact.css`, old hero webps | Hero contrast re-measured on the real page (≥ §3.3). LCP element = hero img, ≤ 2.5 s on the profile. Canvas absent under reduced motion (puppeteer `emulateMediaFeatures`). No horizontal overflow (element right edges). Kinetic band has `aria-hidden`. GL chunk ≤ 6 KB gz. 0 CSP violations on a production build |
| **R3-V6 Apartment** | §9.2; GalleryLightbox (native snap + morph); `next/image` `sizes`; Contact target fix | `ApartmentCinematic.tsx`, `ApartmentGalleryLightbox.tsx` (framer-motion), `AmenitiesList.tsx` / `DescriptionBox.tsx` if replaced, `12-apartment-checkin.css` apartment parts (`:571` onwards) | Lightbox keyboard (←/→/Esc/Home/End), focus return, `aria-modal`, counter announced. Morph verified in Chrome + Safari 26 or falls back to crossfade |
| **R3-V7 Availability** | §9.3: skin the F09 `AvailabilityPlanner` (react-day-picker `classNames`, custom `DayButton` for price and pill), SummaryCard, QuoteBar, live-region messages and the crossing rule, stacked months on mobile | `08-vendor.css` react-day-picker parts (`:1-169`), `07-search-listing.css` "React Day Picker Custom Styles" (`:341` onwards), `12-apartment-checkin.css:109-184` booking-bar and date-picker parts | Tests: crossing rule, check-out on the first booked night, min-stay message, fee grouped across 1 Nov / 1 Apr (e.g. 29 Oct → 3 Nov = 3 × 8 € + 2 × 2 €), no `<form>`/`fetch` (F09 rule). Keyboard pass. INP ≤ 200 ms on selection |
| **R3-V8 Kalamata guide** | §9.5, §9.6: GuideCard, GuideFilters, favourites burst, Directions, art tiles, detail morph, restyled Leaflet (tiles per R3-M1), phones page | `10-moments.css`, `moments/*` components replaced, `CategoryGridClient.tsx`/`ListingCard.tsx` if replaced, `08-vendor.css` Leaflet parts (`:171` onwards), `maps/leafletPopup.ts` restyle | Only chips with content render (test). Search result count announced. Leaflet loads only on map toggle (network log) |
| **R3-V9 In-stay** | §9.4, §9.7, §9.8, §9.11: `/stay` hub, guest sign-in, check-in, portal refresh, offline pages, `tel:112`; proxy: first visit without a `lang` cookie gets `el` when `Accept-Language` prefers Greek (G-REG in proxy tests); service worker precaches fonts and tokens CSS | `12-apartment-checkin.css` check-in palette (`:185-557`), `StatusCluster` styling moved to tokens | No booking CTA or Airbnb link anywhere in the S-shell pages (test that renders each stay route and asserts no `airbnb.com` link and no availability CTA). Calm mode only (no `animation-timeline` rules apply) |
| **R3-V10 Admin** | §9.12 tokens only; `MotionConfig reducedMotion="user"` in admin/guests | `13-compatibility-admin.css` colours → tokens; per-component dark selectors | G-CONTRAST on admin tables, forms and badges |
| **R3-V11 SEO & sharing** | Metadata per page, canonical + `x-default`, static OG images 1200×630 made with `sharp` from the hero 3:2 crop + wordmark (en/el), sitemap/robots, Organization JSON-LD | none | OG images ≤ 300 KB; text on OG images passes 4.5:1 over the scrim |
| **R3-V12 Legacy CSS sweep** | Delete what remains of `src/styles/01…13`, the `layer(legacy)` imports, `@custom-variant dark`, the `@theme inline` brand-* block; `05-primitives.css:290-298` reset moves into `motion.css` (extended to View Transitions); close R-166, R-187–R-190, R-217, R-223, R-250, R-272, R-274–R-284 with one G-CONTRAST row each | All legacy CSS | `grep -rn "dark:" src` returns only intentional non-colour uses (expected: none). Global CSS ≤ 30 KB gz. Full-site G-VIS |
| **R3-V13 Accessibility & performance** | Advisory `audit:a11y` (axe), `audit:responsive:ux` at 360/390/768/1024/1440, keyboard pass on every route, reduced-motion pass (OS + in-page switch), new advisory `audit:vitals` (puppeteer + CDP throttling, §5.10), decide on the display-italic preload (§2.2), overflow audit by element right edges | none | All §5.10 budgets met or recorded as findings. Owner device checklist (§13) handed over |

**Dependencies on other plan tasks:**

- V5's NightsTeaser and "from €X" need R3-F05–F09 data.
- V7 needs F09.
- V8's map needs R3-M1.
- V9's privacy link needs R3-L2 (the link may point to the route before the text is final).
- Copy strings come from R3-C1 (owner-approved and applied on 2026-10-06; the `// C1 review` draft markers are removed).

---

## 13. Open items

**For the owner (defaults apply until answered):**

1. A balcony photo showing the gulf, a blue-hour balcony photo, exterior/parking shots, a host portrait, and Bedroom 2 and bathroom reshoots (§7.4). Default: the honest copy in §1.4.
2. The host name, languages and reply time, the Airbnb listing URL, and whether to show the Airbnb rating/reviews. Default: fields hidden, Airbnb buttons hidden, no reviews. The listing URL and the legal identity are deferred by the owner to task R3-L1: `AIRBNB_LISTING_URL` is still empty in `src/data/contact.ts`, which has no legal-identity fields yet (the privacy page reads an optional `legalName` and `address` and shows each only when set).
3. Beach distance: settled by R3-C1 (owner, 2026-10-06): the copy says "the nearest beach is 5 minutes by car" with no km figure (`src/i18n/domains/home.ts`, `house.ts` location panel, `checkin.ts` `tip1`).
4. Remove `framer-motion` after V6/V10 (dependency removal outside the approved list)? Default: keep.

**Not verified (SUSPECTED; each has its check):**

- **Turbopack next/font with per-subset calls:** resolved by the V2 spike (§2.3): all checks passed.
- **Visual quality of the Noto Serif Display and Commissioner Greek glyphs:** they were only named in the mockups, which used Baskerville and Seravek. V2 renders a specimen: `Καλωσήρθατε στην Καλαμάτα, θέα στον Ταΰγετο και τον Μεσσηνιακό κόλπο. ΐ ΰ ϊ ϋ Ά Έ Ή Ί Ό Ύ Ώ ς 85 €/νύχτα`, at 16/22/45/88 px, en and el, light and dark.
- **Real devices** (owner checklist):
  - mid-range Android: WebGL init long task and frame time;
  - iPhone on iOS 26: scroll-driven animations and View Transitions;
  - iPhone on iOS 18: static fallback;
  - Firefox: static fallback;
  - iPhone in Low Power Mode.
  - All WebGL numbers so far come from headless Chrome (SwiftShader or hardware GL on this Mac).
- **Other checks:**
  - The View Transition morph into a top-layer `<dialog>`: V6.
  - The react-day-picker calendar bundle size: F09/V7.
  - Whether Airbnb date deep-link parameters work: F09 keeps them off.

---

## 14. Sources

- **Research (this workflow):** references, tech, fonts and assets research texts (§0 of the workflow input). Scratch files are in `.runtime/design/research/`.
- **Winning mockup:** `.runtime/design/messinian-light/`: `DESIGN.md`, `styles.css`, `hero-gl.js`, `boot.js`, `tools/*`, `shots/*`.
- **Graft mockups:** `.runtime/design/aegean-depth/` and `.runtime/design/kalamata-playful/`.
- **Installed Next 16.3.6 docs and source (CONFIRMED by reading):**
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` (`declarations`, `preload`, `adjustFontFallback`, `variable`)
  - `node_modules/next/dist/compiled/@next/font/dist/local/{loader.js,get-fallback-metrics-from-font-file.js}`
  - `node_modules/next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js`
  - `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`
- **Font files and ranges:**
  - https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable/noto-serif-display@5.3.0?structure=flat
  - https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable/commissioner@5.3.0?structure=flat
  - https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-serif-display@5.3.0/unicode.json
  - The three above were fetched 2026-09-28 for sizes and ranges only; runtime serving stays self-hosted.
- **Font sources and licences:** https://github.com/google/fonts/tree/main/ofl/notoserifdisplay, https://github.com/google/fonts/tree/main/ofl/commissioner, https://openfontlicense.org/ofl-faq/
- **Repo facts cited:**
  - `src/lib/security-config.ts:84-86, 145-147, 176-177`
  - `src/app/layout.tsx:26, 40-49`
  - `src/data/stayPolicy.ts:12-48`
  - `src/lib/availability/{stayQuote.ts,money.ts,calendarDate.ts}`
  - `src/components/DeferredRuntimeManagers.tsx:6-40`
  - `src/components/HomeHero.tsx`
  - `src/styles/01-tokens.css:118-121`
  - `src/styles/05-primitives.css:290-298`
  - `scripts/check-image-assets.ts:4`
  - `public/app.webmanifest`
  - `next.config.ts` (Turbopack)
- **Standards:**
  - WCAG 2.2 understanding documents 1.4.3, 1.4.11, 2.2.2, 2.3.3, 2.5.8
  - WAI-ARIA APG date picker grid: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/
  - web.dev LCP: https://web.dev/articles/lcp
