# Dolce Far Niente · Kalamata: visual identity and design system

Design system and visual implementation reference for all public routes (`en`/`el`), the guest portal, and admin token theming.

---

## 1. Concept and brand voice

### 1.1 Concept: "Messinian light"

The site is built around the sunlit second-floor balcony looking over Kalamata rooftops to Mount Taygetos:

- **Day mode** uses warm sand paper with terracotta (`primary`), olive (`olive`), and deep gulf blue (`accent`).
- **Night mode ("gulf night")** uses deep sea blue rather than grey.
- **Motion follows light and real physical elements:** living-photograph depth on the hero, a warm light pass across the display headline, opening shutters on scroll, and layered relief map lines.

### 1.2 Name and taglines

- **Brand:** "Dolce Far Niente · Kalamata"
- **Wordmark:** "Dolce Far Niente" in Noto Serif Display italic 400. Beneath it, "Kalamata" / "Καλαμάτα" in Commissioner 600 (Latin uppercase with tracking `.18em`; Greek sentence case with tracking `.04em`).
- **H1 on Home:** "Dolce far niente" in both locales (`lang="it"`).

| Use | EN | EL |
|---|---|---|
| Primary tagline (OG description, marketing footer) | Slow days on a sunlit balcony in Kalamata. | Αργές μέρες σε ένα ηλιόλουστο μπαλκόνι στην Καλαμάτα. |
| Secondary (location band, share cards) | Taygetos at breakfast, the gulf a short drive away. | Ο Ταΰγετος στο πρωινό σας, ο κόλπος λίγα λεπτά με το αυτοκίνητο. |
| Stay hub greeting | Welcome home. | Καλώς ήρθατε. |

### 1.3 Voice rules (both languages)

- **Warm, unhurried, precise.** Short sentences; concrete measurements beat vague adjectives ("90 m²", "50 m from the Town Hall", "2nd floor").
- **Person.** The host letter uses "we"; all other copy addresses the guest as "you" (formal Greek plural "σας").
- **No hype or direct-booking discount claims.** Avoid "luxury", "paradise", "hidden gem", "best price", or "cheaper if you book direct".
- **Natural Greek phrasing and calendar forms.** Month headings use the nominative ("Οκτώβριος 2026") and dates use the genitive ("18 Οκτωβρίου"), matching `Intl.DateTimeFormat('el-GR')`.

### 1.4 Honesty rules (binding)

1. **No synthetic night.** Night mode tints the hero cooler as a theme treatment without presenting a fake dusk photograph.
2. **No placeholder ever ships.** When optional owner data (`HOST_PROFILE` signature, portrait, languages, reply time, reviews) is empty, components omit the field or section rather than showing placeholder text or `#` links.
3. **Truthful availability and no public pricing.** Availability comes only from `availabilityRepository` (`BOOKING_ICAL_URL`). The public site displays no nightly prices, fee lines, totals, or cancellation policy; public reads never select rate-period prices. Without a fresh calendar, Home omits `NightsTeaser` and `BookBar`, and Availability falls back to contact options (`summary.trust` makes no pricing/cancellation claims).

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

Committed woff2 font subsets live in `src/app/fonts/` alongside `OFL-NotoSerifDisplay.txt`, `OFL-Commissioner.txt`, and `SOURCES.txt` (SHA-256 checksums and `@fontsource-variable/*@5.3.0` origins; `latin-ext` is omitted intentionally).

| File (committed to `src/app/fonts/`) | Bytes | Preload | Needed by |
|---|---|---|---|
| `commissioner-latin-wght-normal.woff2` | 36,700 | **yes** (the only preloaded font) | All text, both locales (digits, €, punctuation) |
| `commissioner-greek-wght-normal.woff2` | 15,380 | no | EL text; "ΕΛ" in the language switch on EN pages |
| `noto-serif-display-latin-wght-normal.woff2` | 41,232 | no | Latin headings |
| `noto-serif-display-latin-wght-italic.woff2` | 49,264 | no | H1 "Dolce far niente", wordmark, italic accents |
| `noto-serif-display-greek-wght-normal.woff2` | 30,004 | no | EL headings |
| `noto-serif-display-greek-wght-italic.woff2` | 33,808 | no | EL italic accents |
| **Total** | **206,388** | 36,700 critical | |

- **Budget:** Preloaded critical path ≤ 40 KB (Commissioner Latin only); total font weight ≤ 210 KB. Display italic is intentionally not preloaded so the home hero `<img>` keeps priority for LCP.
- **Unicode ranges:** Non-overlapping `unicode-range` declarations prevent fetching Greek subsets on EN routes without Greek glyphs; files are served as content-hashed immutable assets.

### 2.3 `next/font/local` usage

Each font subset uses its own module-scope `localFont()` call in `src/app/fonts/fonts.ts` (because Next's loader applies `declarations` uniformly per call and calculates `adjustFontFallback` metrics from Latin glyphs):

- `textLatin` (`--font-text-latin`, `preload: true`, `adjustFontFallback: 'Arial'`)
- `textGreek` (`--font-text-greek`, `preload: false`, `adjustFontFallback: false`)
- `displayLatin` (`--font-display-latin`, `preload: false`, `adjustFontFallback: 'Times New Roman'`)
- `displayGreek` (`--font-display-greek`, `preload: false`, `adjustFontFallback: false`)

`src/app/layout.tsx` sets `[textLatin, textGreek, displayLatin, displayGreek].map(f => f.variable).join(' ')` on `<html>`, matching `--font-text` and `--font-display` in `src/styles/tokens.css`. Avoid raw `→` (U+2192) or `✦` (U+2726) in UI prose because they fall outside the shipped Latin woff2 range; use `<Icon>` SVGs (§6).

### 2.4 Weights and features

| Face | Weights used | Notes |
|---|---|---|
| Commissioner | 400 body · 500 nav, labels, chips · 600 buttons, `strong` · 700 tile titles and the SOS number | No italic file is shipped. Emphasis in running text uses weight 600, never italic |
| Noto Serif Display | 400 upright (all display sizes) · 400 italic (H1, wordmark, `em` accents in headings, quotes, host letter title) | Italic accent colour: `primary-text` (light) / `primary-text` dark value |

- `font-synthesis: none` on `body` (`.site-body`), so no fake bold or italic in Greek.
- `font-variant-numeric: tabular-nums lining-nums` on dates, distances and the fact strip.
- `text-wrap: balance` on headings; `text-wrap: pretty` on paragraphs.
- `hyphens: manual`.
- All Greek strings in `src/i18n` must remain NFC-normalized (precomposed tonos), because the Greek font subset excludes combining U+0301 (`scripts/validate-content.ts` validates content).

### 2.5 Type scale (fluid)

Sizes at 390 px and 1440 px are computed from the clamp formulas. They are Tailwind `@theme` tokens (`--text-*`, with `--text-*--line-height`).

| Token | CSS value | ≈390 | ≈1440 | Face / weight | Line height | Tracking | Use |
|---|---|---|---|---|---|---|---|
| `--text-hero` | `clamp(4rem, 1.9rem + 9.6vw, 8.75rem)` | 68 | 140 | display italic 400 | .86 | −.025em | Home H1 only |
| `--text-d1` | `clamp(2.75rem, 1.7rem + 4.6vw, 5.5rem)` | 45 | 88 | display 400 | 1.02 (el 1.08) | −.015em | Page H1 |
| `--text-d2` | `clamp(2.25rem, 1.55rem + 3vw, 4rem)` | 36 | 64 | display 400 | 1.02 (el 1.08) | −.015em | Section titles |
| `--text-d3` | `clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem)` | 29 | 40 | display 400 / italic | 1.12 (el 1.15) | −.01em | Quotes, letter title, FAQ title, month caption on desktop |
| `--text-h3` | `1.375rem` | 22 | 22 | display 400 | 1.15 | 0 | Card and tile titles |
| `--text-lead` | `clamp(1.125rem, 1.04rem + .45vw, 1.375rem)` | 18 | 22 | text 400 | 1.55 | 0 | Intros |
| `--text-body` | `clamp(1rem, .96rem + .2vw, 1.0625rem)` | 16 | 17 | text 400 | 1.6 | 0 | Body |
| `--text-caption` | `.9375rem` | 15 | 15 | text 400/500 | 1.45 | 0 | Captions, chips, secondary text |
| `--text-label` | `.8125rem` | 13 | 13 | text 600 | 1.3 | .16em (en uppercase) / .04em (el) | Eyebrows, legends |
| `--text-micro` | `.75rem` | 12 | 12 | text 600 | 1.2 | 0 | Calendar notes, fine print. **The minimum size anywhere** |
| `--text-fact` | `clamp(2.25rem, 1.8rem + 1.2vw, 3rem)` | 36 | 46 | display 400, tabular | 1 | −.02em | Fact numerals |

Measure: running text ≤ 65ch; lead ≤ 38em.

### 2.6 Greek rules (binding)

- **No `text-transform: uppercase` under `:lang(el)`.** Safari and iOS keep the tonos (caniuse, fonts research §4.4); for example the short weekday "Τρί" would render as "ΤΡΊ". Eyebrows, weekday headers, the wordmark place label, chips and legends use sentence case with tracking `.04em` in Greek.
- Greek display line-heights use the `(el …)` values in the table above.
- The language switch label is written "ΕΛ" by hand, not produced by transforming "ελ".
- Mixed-language fragments carry `lang`: the H1 `lang="it"` and each LanguageSwitch link (`lang` and `hreflang` of its locale).

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

- Both dark-mode blocks in `src/styles/tokens.css` (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`) must stay identical and override every semantic colour token.
- Do not use Tailwind `dark:` utilities or per-component dark selectors (`src/app/globals.css` has no legacy dark variant; `dark:` would ignore explicit `data-theme` choices).
- Avoid `light-dark()` (unsupported before iOS Safari 17.5).

### 3.2 Tokens

| Token (`--color-…`) | Light | Dark | Role |
|---|---|---|---|
| `bg` | `#F6F0E6` | `#0A1A21` | Page (sand paper / gulf night) |
| `surface` | `#FFFBF5` | `#10252E` | Cards, calendar months |
| `surface-sunken` | `#EDE4D5` | `#0D2129` | Quiet bands, notes, booked cells, hover |
| `surface-raised` | `#FFFFFF` | `#163340` | Dialogs, menu sheet, popovers, toasts |
| `glass` | `rgb(255 255 255 / .12)` | `rgb(255 255 255 / .25)` | Header pill (transparent, O43; the text halo in `shell.css` keeps text legible over photos) and the apartment chip strip. Backdrop blur 8 px (header) and 12 px (chips) |
| `fg` | `#1C2528` | `#F2EBDF` | Body text, headings |
| `fg-muted` | `#57524C` | `#A9B6BA` | Secondary text, placeholders |
| `fg-on-photo` | `#FFF8EE` | `#FFF8EE` | Text on photo scrims (hero, captions) |
| `fg-on-photo-accent` | `#FFE2C0` | `#FFE2C0` | Eyebrow on the hero |
| `primary` | `#A0452A` | `#E8946F` | Primary action fill (terracotta) |
| `primary-hover` | `#8A3A22` | `#F0A585` | Primary hover |
| `primary-fg` | `#FFFFFF` | `#1B100B` | Text and icons on primary |
| `primary-text` | `#8F3D24` | `#F2A585` | Terracotta used as text: eyebrows, italic accents |
| `primary-tint` | `rgb(160 69 42 / .12)` | `rgb(232 148 111 / .16)` | Tints: calendar range, icon discs |
| `accent` | `#0D5568` | `#80CCDA` | Links, secondary button text, info (deep sea) |
| `accent-hover` | `#0A4454` | `#A5DDE7` | Link hover |
| `accent-fg` | `#FFFFFF` | `#0A1A21` | Text on an accent fill (rare: active step, map number disc) |
| `olive` | `#4F5E33` | `#BCCA8B` | Guide categories |
| `sun` | `#F0A95B` | `#F4B878` | **Decorative only** (logo sun, glow, shutter light). Never text on `bg` in light mode (1.76:1) |
| `border` | `rgb(28 37 40 / .13)` | `rgb(242 235 223 / .12)` | Decorative hairlines, card edges |
| `border-strong` | `rgb(28 37 40 / .28)` | `rgb(242 235 223 / .26)` | Outlined buttons and chips (their text identifies them; not a 1.4.11 boundary) |
| `border-control` | `#8A8178` | `#6E8389` | Input, checkbox and select boundaries (≥ 3:1) |
| `focus` | `#0D5568` | `#F4B878` | Focus ring: 3 px solid, offset 3 px |
| `success` / `success-bg` | `#2F6230` / `#E1EBD6` | `#9ED49A` / `#15301F` | Confirmations |
| `warning` / `warning-bg` | `#7A4B00` / `#F7E4C2` | `#F2C27A` / `#33270F` | Minimum-stay notes, blocked-range notes |
| `danger` / `danger-bg` | `#A1232B` / `#F8DEDB` | `#F4A3A0` / `#3A1719` | Errors (a crimson, distinct from the terracotta primary) |
| `info-bg` | `#DCEBEE` | `#0E3440` | Info callouts (text is `accent`) |
| `band-bg` | `#0C3440` | `#0F303B` | Deep-gulf bands: location, portal tile. Dark in both themes |
| `band-fg` | `#F6EFE4` | `#F2EBDF` | Text on bands |
| `band-muted` | `#B9CBCF` | `#A9C0C6` | Secondary text on bands |
| `band-accent` | `#F2B27A` | `#F4B878` | Accent text and CTA fill on bands |
| `band-accent-fg` | `#231510` | `#231510` | Text on a `band-accent` fill |
| `band-line` | `rgb(246 239 228 / .20)` | `rgb(242 235 223 / .20)` | Rules on bands |
| `band-focus` | `#F2B27A` | `#F4B878` | Focus ring on bands and photos |
| `cal-free-bg` | = `surface` | = `surface` | Free night cell |
| `cal-booked-bg` | = `surface-sunken` | = `surface-sunken` | Booked cell base |
| `cal-booked-hatch` | `rgb(28 37 40 / .12)` | `rgb(242 235 223 / .10)` | 135° stripes: 1.5 px stripe, 7 px period |
| `cal-booked-fg` | = `fg-muted` | = `fg-muted` | Struck-through date on booked cells |
| `cal-selected-bg` / `cal-selected-fg` | = `primary` / `primary-fg` | = `primary` / `primary-fg` | Check-in and check-out cells |
| `cal-range-bg` | = `primary-tint` (over `surface`: `#F4E5DD`) | = `primary-tint` (over `surface`: `#333738`) | Nights between check-in and check-out |
| `viewer-bg` | `#0E1418` | `#0E1418` | Lightbox backdrop (fixed dark in both themes) |
| `map-sea` | `#0A4A5C` | `#07303B` | Relief map sea |
| `map-land` | `#EFE6D6` | `#1E3E48` | Relief map land |
| `map-c1` … `map-c4` | `#DDCDB2`, `#CCB793`, `#B99E76`, `#A2865F` | `#28505C`, `#33616E`, `#427483`, `#5A8C9A` | Contour layers |
| `map-coast` / `map-wave` / `map-road` / `map-street` | `#F2B27A` / `rgb(170 222 232 / .38)` / `#FFFFFF` / `rgb(28 37 40 / .13)` | `#F4B878` / `rgb(128 204 218 / .30)` / `rgb(242 235 223 / .35)` / `rgb(242 235 223 / .07)` | Relief map details |
| `pin-bg` / `pin-fg` | `#FFFBF5` / `#1C2528` | same | Map pins are paper objects, the same in both themes |
| `pin-home-bg` / `pin-home-fg` | `#A0452A` / `#FFFFFF` | same | "You're staying here" pin |
| `shutter` / `shutter-hi` / `shutter-lo` / `shutter-frame` / `frame` | `#3C6258` / `#52806F` / `#294740` / `#31554C` / `#E4D8C4` | `#2B4B44` / `#3B6459` / `#1C332E` / `#233F39` / `#1A343D` | Greek shutter green and window frame (decorative) |
| `glow` | `rgb(240 169 91 / .20)` | `rgb(128 204 218 / .08)` | **Dropped, not implemented (as of 2026-10-09):** no `glow` token in `tokens.css`. Was: sun path (day) and moonlight (night) |

**Non-colour atmosphere tokens:**

- `--scrim: 8 22 28` (an RGB triple used as `rgb(var(--scrim) / α)`).
- `--hero-tint`: `transparent` (light) / `linear-gradient(180deg, rgb(20 50 72 / .55), rgb(10 26 33 / .35))` (dark), applied as a multiply layer over the hero.
- `--grain`: `url(/design/grain-light.webp)` (light) / `url(/design/grain-dark.webp)` (dark).

**Theme colour.**

- Next `viewport.themeColor`: `[{ media: '(prefers-color-scheme: light)', color: '#F6F0E6' }, { media: '(prefers-color-scheme: dark)', color: '#0A1A21' }]`.
- Manifest (`public/app.webmanifest`): `theme_color` `#F6F0E6`, `background_color` `#F6F0E6`.

### 3.3 Computed contrast (WCAG 2.x relative luminance)

**Method:** WCAG relative luminance with alpha tokens composited over the stated background. Minimums: `4.5` for normal text, `3.0` for large text (`≥ 24 px`, or `≥ 18.66 px` bold), UI boundaries, and focus indicators. (Over the stay hub's half-sun decoration, the `sun` disk is capped so the lead sits cleanly below it and only the large `d1` heading overlaps.)

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
| light | fg on header glass (transparent, O43) over bg | `#1C2528` | `#F7F2EA` | **13.99** | 4.5 |
| light | cal: date on free cell | `#1C2528` | `#FFFBF5` | **15.15** | 4.5 |
| light | cal: selected text | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| light | cal: date on range | `#1C2528` | `#F4E5DD` | **12.72** | 4.5 |
| light | cal: booked text on darkest hatch stripe | `#57524C` | `#D4CDC0` | **4.90** | 4.5 |
| light | cal: booked text on sunken | `#57524C` | `#EDE4D5` | **6.13** | 4.5 |
| light | cal: "out" label on booked hatch (R3-V7) | `#57524C` | `#D4CDC0` | **4.90** | 4.5 |
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
| dark | fg on header glass (transparent, O43) over bg | `#F2EBDF` | `#48535A` | **6.67** | 4.5 |
| dark | cal: date on free cell | `#F2EBDF` | `#10252E` | **13.37** | 4.5 |
| dark | cal: selected text | `#1B100B` | `#E8946F` | **7.90** | 4.5 |
| dark | cal: date on range | `#F2EBDF` | `#333738` | **10.20** | 4.5 |
| dark | cal: booked text on lightest hatch stripe | `#A9B6BA` | `#24353B` | **6.11** | 4.5 |
| dark | cal: booked text on sunken | `#A9B6BA` | `#0D2129` | **7.96** | 4.5 |
| dark | cal: "out" label on booked hatch (R3-V7) | `#A9B6BA` | `#24353B` | **6.11** | 4.5 |
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
| both | hero CTA on scrim .80 over pure white | `#FFF8EE` | `#394549` | **9.42** | 4.5 |
| both | hero eyebrow on scrim .80 over pure white | `#FFE2C0` | `#394549` | **7.99** | 4.5 |
| both | room and gallery caption on scrim .62 over pure white | `#FFF8EE` | `#666F72` | **4.90** | 4.5 |
| both | map pin text on pin paper | `#1C2528` | `#FFFBF5` | **15.15** | 4.5 |
| both | map home pin | `#FFFFFF` | `#A0452A` | **6.21** | 4.5 |
| both | lightbox room name and counter on viewer-bg | `#FFF8EE` | `#0E1418` | **17.59** | 4.5 |
| both | UI: lightbox glass button border (`#FFF8EE` at 50 %) on viewer-bg | `#878683` | `#0E1418` | **5.09** | 3 |

**Hero contrast measured on the real photo pixels.**

- **Measurement:** hero contrast keeps the scrim, hides text, and checks `#FFF8EE` against every pixel behind each text block.
- **H1** (large text, ≥ 3:1): ≥ 4.27 in light mode across viewports, ≥ 8.01 in dark mode; the one-pass H1 shimmer highlight (`#FFD6A0`) stays ≥ 3.45.
- **Glass CTA:** ≥ 13.4.
- **Open Graph share cards (`scripts/design/gen-og-images.ts`):** `npm run design:og` checks every text line against the lightest pixel inside its box and fails below 4.5:1 (measured: wordmark `band-fg` 6.84, place label `band-accent` 6.85, tagline `band-fg` 11.52).

**Usage rules:**

- `sun`, `olive-soft`, raw terracotta `#B26646`, and shutter greens are decorative and never used for text.
- Text over photography appears only behind a scrim (`--scrim`).
- Paper grain (`§4.5`) is capped at 8 % alpha so worst-case contrast remains above minimum thresholds.

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
| `--radius-dialog` | 32px | Summary card, bottom sheet, lightbox corners (desktop) |
| `--radius-control` | 999px | Buttons, chips, segmented controls, header pill, bottom bars |

### 4.3 Elevation (`--shadow-*`, redefined in dark)

| Level | Token | Light | Dark | Use |
|---|---|---|---|---|
| 0 | none | none | none | Page, bands |
| 1 | `--shadow-rest` | `0 1px 2px rgb(60 40 25 / .06), 0 4px 14px -6px rgb(60 40 25 / .12)` | `0 1px 2px rgb(0 0 0 / .4), inset 0 1px 0 rgb(255 255 255 / .03)` | Resting cards, header |
| 2 | `--shadow-raised` | `0 18px 40px -18px rgb(60 40 25 / .32), 0 2px 6px rgb(60 40 25 / .06)` | `0 18px 40px -18px rgb(0 0 0 / .7), inset 0 1px 0 rgb(255 255 255 / .04)` | Fact strip, summary card, bars, hovered cards |
| 3 | `--shadow-object` | `0 50px 90px -40px rgb(40 25 15 / .5), 0 14px 28px -16px rgb(40 25 15 / .25)` | `0 50px 90px -40px rgb(0 0 0 / .8), 0 14px 28px -16px rgb(0 0 0 / .5)` | Window, letter, room cards, deck |
| 4 | `--shadow-overlay` | `0 24px 64px -12px rgb(28 20 14 / .45)` | `0 24px 64px -12px rgb(0 0 0 / .85)` | Dialogs, menu sheet |

Primary button glow: `0 14px 26px -14px rgb(160 69 42 / .55)` (light) / `0 14px 26px -14px rgb(0 0 0 / .6)` (dark).

### 4.4 Breakpoints and grid

**Breakpoints** are Tailwind's defaults and are not customised; a few component queries use their own widths (for example the header nav at 1320 px, below): `sm` 640, `md` 768, `lg` 1024, `xl` 1280. The mockup's breakpoints map as follows:

| Feature | Breakpoint |
|---|---|
| Header nav visible | `1320 px`, a custom query (shell.css): the five Greek links need that room; `xl` (1280) before the fifth link, "Your stay", and `lg` before O41 |
| Header CTA visible | `sm` |
| Fact strip in one row | `lg` |
| Calendar: two months side by side | `md` |
| Availability: two-column layout | `lg` |
| Guide list | 2 columns at `sm`, 3 at `lg` |
| Highlights | 2 columns at `sm`, 4 at `lg` |
| Deck fan instead of coverflow | `lg` |
| Bottom bars hidden | `lg` |

**Grid rule:** Layouts use `repeat(n, minmax(0, 1fr))`, never `1fr 1fr`, to avoid grid item overflow. `overflow-x: clip` may apply only to `html`/`body`.

**z-index:** content 1 (`z-index: 2` on `.facts`), sticky header 50, PWA banner 50, BookBar 60, toasts 60 (rendered after the page in DOM order inside `Toast.tsx`), skip link 100. Dialogs use the browser top layer.

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

**Boot script.** The existing nonce'd inline script in `src/app/layout.tsx` (the `<head>` script) is replaced with:

```js
(function(){var d=document.documentElement,r=null;
try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}
try{r=localStorage.getItem('motion')}catch(e){}
if(r==='reduce')d.setAttribute('data-motion','reduce');
else if(window.matchMedia&&matchMedia('(prefers-reduced-motion: no-preference)').matches){d.setAttribute('data-motion','full');
setTimeout(function(){if(d.getAttribute('data-motion')==='full'&&!d.hasAttribute('data-reveal-ready')&&document.querySelector('[data-reveal]'))d.removeAttribute('data-motion')},4000);
try{if(!sessionStorage.getItem('brand-intro')){sessionStorage.setItem('brand-intro','1');d.setAttribute('data-intro','')}}catch(e){}}})()
```

The 4 s failsafe removes `data-motion` when a `[data-reveal]` block exists and `HomeRevealObserver` has not set `data-reveal-ready` on `<html>`, preventing hidden sections if the client bundle fails or stalls. `data-intro` marks the first full-motion load of the session (`sessionStorage` key `brand-intro`).

**How the flags work.**

- `data-motion="full"` is the only flag that arms motion and is set only on `<html>` (never by React components, so hydration never touches it).
- `data-theme` is set only when the visitor explicitly selects Light or Dark; otherwise OS `prefers-color-scheme` controls the palette (`ThemeSwitch` computes effective theme as `data-theme ?? (matchMedia dark ? 'dark' : 'light')`).

**Tailwind variant:**

```css
@custom-variant motion-ok {
  @media (prefers-reduced-motion: no-preference) {
    &:where(:root[data-motion="full"] *) { @slot; }
  }
}
```

**Plain-CSS gate.** Motion CSS outside utilities sits inside `@media (prefers-reduced-motion: no-preference) { :root[data-motion="full"] … }`. Scroll-driven rules are additionally inside `@supports (animation-timeline: view())`, and `src/styles/motion.css` keeps the reduced-motion duration/View-Transition reset safeguard.

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
| **T1 CSS** | `data-motion="full"` | IntersectionObserver reveals (all browsers); a block already on screen at load, or above the viewport after a restored scroll position, is revealed two animation frames after mount, so the hidden state has been painted first (HomeRevealObserver, FactCounters). CSS 3D: shutters, louvres, deck, relief. Scroll-driven effects where `animation-timeline` is supported (Chrome/Edge 115+, Safari/iOS 26+; not Firefox stable). View Transitions where supported |
| **T2 WebGL** | T1, plus the capability gate (§5.6), plus after `load` and idle | The living-photograph canvas fades in over the identical `<img>` on Home only |

### 5.5 Pattern catalogue

| # | Element | Motion | Trigger | Engine | Reduced / unsupported |
|---|---|---|---|---|---|
| M1 | Hero H1 | One warm light pass through the letters (gradient `#FFF8EE → #FFD6A0 → #FFF8EE`, `background-clip: text`, 3.4 s, 0.5 s delay). Line 2 slides from `.35em`. **Never opacity 0** | Load, once | CSS keyframes | Plain `#FFF8EE` text |
| M2 | Hero CTAs | Rise 18 px with opacity (.4 s delay, .9 s). These are not LCP candidates; the image is the LCP | Load, once | CSS | Visible at once |
| M3 | Hero stage **recede** (graft 1) | `.hero__stage` goes to `perspective(1400px) translateY(6%) rotateX(16deg) scale(.86)`, `border-radius` 0 → `var(--radius-card)`. A dark overlay (`rgb(var(--scrim) / 0 → .55)`) and hero content opacity 1 → 0 plus `translateY(-80px)` over the first 70 % of the exit | Scroll: `view()` on `section.hero`, `animation-range: exit 0% exit 100%` | CSS scroll-driven | Static |
| M4 | Hero dolly (T1) | `.hero__img` scale 1 → 1.14, `translateY(3%)`. Disabled when `[data-gl="on"]`, because the shader does the dolly | Scroll, same timeline | CSS scroll-driven | Static |
| M5 | Living photograph (T2) | §5.6 | Pointer, sideways touch-drag, scroll; ambient drift ≤ 4.8 s | WebGL | Never mounted |
| M6 | Fact strip | Six tiles open like louvres from `rotateX(-86deg)` (transform-origin top), 75 ms stagger, `--ease-shutter` | Top passes 65 % of viewport height (IO `rootMargin` −35 %), or 2 rAF if already on/above viewport | CSS + IO | Visible |
| M8 | Highlights | Rise 40 px and untilt from `rotateX(18deg)`, 90 ms stagger. Afterwards they tilt toward the pointer (max 6°) on fine pointers | In view / pointer | CSS + IO; JS writes `--tx`/`--ty` (rAF-throttled) | Flat |
| M9 | Season switch | Cards flip `rotateY` 0 → 90° → 0 (640 ms, `--ease-sweep`, 70 ms stagger); content swaps at 50 % | Click | CSS class + JS | Instant swap |
| M10 | Balcony window **shutters** | Two louvred shutters swing to ±104° (`--dur-shutter`, spring); a warm flare fades; the photo settles 1.14 → 1 | Top passes 55 % of viewport height (`rootMargin` −45 %) | CSS 3D + IO | Shutters not rendered; the photo stays |
| M11 | Rooms coverflow (< 1024) | Each card `perspective(900px)`: `translateZ(-40px) rotateY(34deg) scale(.9)` → flat at the centre → mirrored; opacity .7 → 1 → .7 | The row's own horizontal scroll: `view(inline)` | CSS scroll-driven (0 JS) | Flat snap row |
| M12 | Rooms deck fan (≥ 1024) | Six cards pile, then fan out; chip or click lifts the active card (`translateZ(140px)`, `translateY(-34px)`, `shadow-object`) while others desaturate (`saturate(.75) brightness(.8)`). Stage tilts toward pointer (max 6°) | In view, once / chip / pointer | CSS transitions + JS classes/vars | Fanned static, no tilt |
| M13 | 14-night strip | Cells flip in `rotateY(-90deg)`, 45 ms stagger | In view, once | CSS + IO | Visible |
| M14 | Relief map | Contour layers rise (`translateZ` 0 → 18/36/54 px), pins stand up, stage tilt `rotateX(40deg) rotateZ(-6deg)` (≥ 1024: 50°/−14°). Home pin pulses 2× (ends by 4.4 s) | In view / pointer (fine) | CSS 3D + IO + JS custom properties | Flat 2D plan |
| M15 | Relief waves | Wave pattern `translateX(-60px → 0)` | Scroll: `view()` | CSS scroll-driven | Static |
| M18 | Buttons | Hover (fine pointers): lift −2 px plus a warm glint sweep on primary (700 ms). Active: `scale(.98)` for 160 ms | Pointer | CSS | Colour change only |
| M19 | Calendar month turn | Desktop previous/next: `rotateY(±58deg) translateZ(-40px)` → flat, 560 ms, origin at the spine | Click / PageUp / PageDown | CSS class | Instant |
| M20 | Calendar range light | One pass of light across the chosen nights (55 ms per cell) | Selection complete | CSS | None |
| M21 | Favourite heart burst | 6 dots scale out and fade (400 ms); the heart scales 1 → 1.25 → 1 | Toggle on | CSS | Icon fill change only |
| M22 | Bottom bars | Slide up from `translateY(160%)` (`--dur-ui`) | IO state | CSS | Appear instantly |
| M23 | Menu sheet | Slides from the right via `@starting-style` | Open | CSS | Appears instantly |
| M24 | FAQ | Height animates via `interpolate-size: allow-keywords` and `::details-content` where supported | Toggle | CSS | Instant (`<details>`) |
| M25 | Calm mode (stay hub, portal, phones, guide) | Tiles and cards fade up 10 px, 60 ms stagger (`--i` inline style, allowed by `style-src 'unsafe-inline'`) | Load, once | CSS | Visible |
| M26 | Header brand mark | Sun rises 6 px with fade while waves draw (`pathLength="1"`, ends by 1.45 s; not in stay header) | First full-motion load of session (`data-intro`) | CSS | Static mark |
| M27 | Room deck cards (≥ 1024), guide cards, host letter | Fine-pointer 3D tilt (max 6°) and soft glare (`src/lib/motion/pointerEffectsRuntime.ts`) | Fine pointer | CSS + JS custom properties | Flat |
| M28 | Section headings (`.ui-section__title`: home, apartment, availability) | Rise out of a 3D plane (`perspective(600px) translateY(.5em) rotateX(-58deg)`) | Scroll: `view()`, `entry 0%..100%` | CSS scroll-driven | Static |
| M29 | Header across navigations | Anchored `site-header` view-transition group above morphing elements | Navigation View Transitions | CSS | Instant |
| M30 | Primary buttons | Magnetic pull toward fine pointer (max 6 px via `translate`) | Fine pointer | CSS + JS custom properties | Colour change only |
| M31 | Marketing header | 2 px `primary` scroll progress hairline along pill bottom edge (`aria-hidden`) | Scroll: `scroll(root)` | CSS scroll-driven | Hidden |
| M32 | Marketing footer waves | Drift `translateX(-160px → 0)` | Scroll: footer `view()`, entry | CSS scroll-driven | Static |
| M33 | Apartment lead photo | Parallax drift inside frame and gentle frame recede on exit | Scroll: `view()` | CSS scroll-driven | Static |
| M34 | Fact strip numbers | Plain numbers count up from 0 (850 ms) matching rendered text; ordinals stay static (`FactCounters.tsx`) | On louvre reveal | JS (`rAF`) | Final numbers |
| M35 | Guide map pins | Drop 40 px with spring stagger (760 ms, `--i` set by `LeafletMap`) | Map opens | CSS | Pins appear |

### 5.6 The 3D hero: "living photograph"

**Decision: a hand-written WebGL fragment shader.** No library.

| Option | Added JS (gz) | CSP fit | Verdict |
|---|---|---|---|
| **Hand-written WebGL: one triangle, one fragment shader** | **~3.4–4.1 KB** (Budget ≤ 6 KB) | No `eval`, no WASM, no workers | **Adopted** |
| three.js / @react-three/fiber | ≥ 175–233 KB | Draco/default presets require WASM or CDN hosts | Rejected |
| OGL / GSAP / Lenis | Extra bundle cost | CSS scroll-driven + single shader suffice | Rejected |

**Rendering:**

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

1. SSR renders only the `<picture>` (§7.2), the scrim and the content. `section.hero` has `touch-action: pan-y pinch-zoom` (`src/styles/components/hero.css:12-13`; the `pan-y` line above it is the fallback for engines without `pinch-zoom`), so vertical scroll and pinch-zoom stay native and a sideways drag moves the view. While the page is zoomed in, a one-finger sideways drag that starts on the hero does not pan the page, because `pan-y` allows only vertical one-finger panning (with the WebGL view running, the drag moves the view instead): pan with two fingers, which `pinch-zoom` allows, or start the drag below the hero. This limit is accepted.
2. `HeroGlIsland` uses `scheduleIdle` (`src/lib/motion/scheduleIdle.ts`): after `load`, `requestIdleCallback({ timeout: 2500 })`, falling back to `setTimeout(1200)` when unsupported.
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
   - the watchdog: after 6 frames, more than 18 slow frames (longer than 80 ms and shorter than 900 ms); only a frame that the previous frame scheduled counts, so a frame started by input, scroll, resize or a visibility change, which measures the pause before it, does not;
   - a texture, asset or link error;
   - `data-motion` leaving `full`.
   - On teardown the canvas fades out, then `WEBGL_lose_context` is called and the canvas removed. The reason is recorded as `data-gl="off:<reason>"`.
9. Device orientation is not used. Permissions-Policy blocks the accelerometer and gyroscope (`productionConfig.headers.permissionsPolicy` in `src/lib/security-config.ts`); do not relax it.

**Assets:** depth maps (`public/house/balcony/hero/depth-*.webp`, ≤ 2 KB each; blurred sky/mountains/rooftops/balcony/plants planes).

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

`src/components/motion/SharedElement.tsx` wraps Next's React `<ViewTransition>` for guide cards → detail (`name="guide-<slug>"`), `ApartmentGallery` triggers `document.startViewTransition` (`name="gallery-photo"`, `photoMorph.ts`) with a 200 ms fade fallback (`lightbox.css`), `.site-header` stays anchored (`M29`), and `ThemeSwitch` reveals root theme switches circularly (`html[data-vt="theme"]`, `--vt-x`/`--vt-y`) when `data-motion="full"`.

Always keep `::view-transition { pointer-events: none; }` and `:root:not([data-motion="full"])::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }` (mirrored inside `@media (prefers-reduced-motion: reduce)`).

### 5.8 Reduced motion (summary)

Reduced motion (`prefers-reduced-motion: reduce` or `data-motion="reduce"`) disables the WebGL hero, balcony shutters, deck tilt, 3D relief depth, scroll-driven reveals, and View Transitions (`@media print` in `motion.css` forces reveals visible and hides shutters).

### 5.9 CSP rules

- **Scripts:** `'self' 'nonce-…'` in production (`src/lib/security-config.ts`). Inline code is limited to the nonce'd boot script; WebGL uses no `eval`, WASM, or workers.
- **Styles:** Keep `style-src 'self' 'unsafe-inline'` without a style nonce so inline CSS variables (`--i`, hero depth custom properties) remain valid.
- **Fonts:** Self-hosted woff2 subsets only (no external font origins).

### 5.10 Performance budget

- LCP ≤ 2.5 s; CLS ≤ 0.05; INP ≤ 200 ms; WebGL frame ≤ 8 ms (≤ 0.65 MP render target).
- Critical preloaded fonts ≤ 40 KB (all subsets ≤ 210 KB); global CSS ≤ 30 KB gz; lazy `pointerEffectsRuntime` chunk only on non-stay fine-pointer devices; lazy `heroGl` only on capable home devices.

---

## 6. Iconography and brand mark

**Icon set** (`src/components/icons/Icon.tsx`): Inline SVG icons (`24×24` viewBox, `fill="none"`, `stroke="currentColor"`, `strokeWidth=1.75`, round caps/joins, `aria-hidden="true"`). Icon-only controls require a localized `aria-label`. Sizes: 20 px in buttons, 24 px standalone, 30 px tiles, 44 px highlight discs.

**Defined `IconName` keys (49):**

- **Navigation:** `arrow-right`, `arrow-left`, `arrow-up-right`, `chevron-left`, `chevron-right`, `close`, `menu`.
- **Theme and motion:** `sun`, `moon`, `motion`.
- **Contact:** `phone`, `message` (WhatsApp), `mail`, `camera` (Instagram), `map-pin`, `directions`.
- **Stay facts:** `bath`, `parking`, `mountain`, `walk`, `car`, `bus`, `plane`.
- **Amenities:** `home`, `wifi`, `snowflake`, `flame`, `kitchen`, `basket`, `baby`, `key`, `lock`, `rules`.
- **Guide:** `heart`, `heart-filled`, `search`, `grid`, `map`, `compass`, `museum`, `beach`, `fork`, `star`.
- **Status & menu:** `info`, `check`, `copy`, `alert`, `clock`, `user`.

**Brand mark** (`src/components/icons/BrandMark.tsx`, `public/brand/mark.svg`): Half sun (`--color-sun`) over two wave lines (`--color-accent`), reused to generate `public/icons/*.png` (`npm run design:icons`) and `public/og/og-{en,el}.jpg` (`npm run design:og`).

---

## 7. Imagery

### 7.1 Rules

- Real apartment photographs only (no stock stand-ins for rooms).
- **Treatment:** No synthetic colour filters (night mode uses `--hero-tint` on the hero only). In `living_11`, snack/bottle brand labels are softly blurred while preserving the rest of the frame.
- **Loading & optimization:** Hero `<picture>` (AVIF + WebP crops) uses `loading="eager"` / `fetchPriority="high"`; secondary photos use lazy `next/image` with accurate `sizes` and localized `alt` text (`alt=""` for decorative duplicates).
- **Validation:** `npm run check:image-assets` enforces format, decodable dimensions, `≤ 512 KB` per raster asset, zero EXIF/XMP/IPTC metadata, and no ICC profile under `public/house/`. *(Note: `public/moments/archaeological-museum-hero.jpg` (293 KB), `railway-museum-hero.jpg` (278 KB), and `public/phones/taxi-hero.webp` (362 KB) are within the 512 KB cap and remain candidates for future compression to ≤ 120 KB.)*

### 7.2 Hero crops and depth maps

Generated by `scripts/design/gen-hero-assets.ts` from `public/house/balcony/balcony_1.jpeg` (1920×1281) into `public/house/balcony/hero/` plus paper-grain tiles in `public/design/grain-{light,dark}.webp` (`160×160`). Hero height is `height: min(760px, 88svh); min-height: 600px` (`min(900px, 88svh)` / `min-height: 640px` at ≥ 768 px) so the hero stays `< 100svh` for LCP.

### 7.3 Gallery selection (42 photos in `src/data/apartmentPhotos.ts`)

| Room / Section | Lead photo | Order & layout notes |
|---|---|---|
| Living (`living`) | `living_8` | `living_6`, `living_11`, `living_7`, `living_9`, `living_10`, `living_4`, `living_5` |
| Kitchen (`kitchen`) | `kitchen_2` | `kitchen_6`, `kitchen_3`, `kitchen_4`, `kitchen_5`, `kitchen_1` |
| Bedroom 1 (`bedroom1`) | `bedroom_1` | `bedroom_2`, `bedroom_3`, `bedroom_5` |
| Bedroom 2 (`bedroom2`) | `bedroom_2_5` | Row-major grid (`apt-masonry--grid`); `bedroom_2_6`, `bedroom_2_3`, `bedroom_2_1` |
| Bathroom (`bathroom`) | `bathroom_6` | `bathroom_7`, `bathroom_3`, `bathroom_4` |
| Balcony (`balcony`) | `balcony_2` | `balcony_3`, `balcony_1`, `balcony_4`, `balcony_5`. Home card uses `balcony_2` (`50% 100%`) so `balcony_1` is not repeated immediately below the hero |
| Parking (`parking`) | `parking_1` | Single-photo section (`apt-masonry--single`, max 820 px); no home room card |
| Up close (`details`) | `details_1` | Row-major grid (`apt-masonry--grid`), `details_1`–`details_10`; no home room card |

Guide cards use `16:10` category photos when present or an illustrated **art tile** (`band-bg` with `band-accent` 56 px icon, e.g., `viktoria-karelia-museum`). Phone rows render 64 px rounded thumbnails.

### 7.4 Owner photo opportunities

Owner additions that would unlock future improvements: golden-hour balcony view toward the gulf, true blue-hour balcony frame for dark mode, host portrait for `HostLetter`, and Bedroom 2 / shower reshoots. Never use `phones/taxi-hero.webp` as an apartment view photo.

---

## 8. Components and states

Primitives live in `src/components/ui/` (and `src/components/Toast.tsx`), styled with semantic tokens and visible `:focus-visible` outlines:

| Component | Variants / structure | Key behaviour |
|---|---|---|
| **Button** | `primary`, `secondary`, `ghost`, `glass`, `on-band`, `link-arrow`; `sm`/`md`/`lg`/`block`, `asChild` | Fine-pointer hover lift + warm glint, active `scale(.98)`, external links include `opensInNewTab` SR cue; weight 600, never uppercase |
| **IconButton** | 44 px circle; `on-photo` glass variant | Required localized `aria-label` |
| **Chip** | 40 px pill, optional `tabular-nums` count | `aria-pressed`; horizontal scroll with `--gutter` scroll padding; empty filter chips omitted |
| **Segmented** | `surface-sunken` track, active `surface` pill | Used by `LanguageSwitch`, menu theme switch, and `SeasonSwitch` |
| **LanguageSwitch** | `<a hreflang lang>` EN / ΕΛ links | Preserves pathname/query/hash via `localeSwitchHref` (stripping legacy claim params) and marks `aria-current="true"` |
| **ThemeSwitch** | Header button + menu/footer `Auto · Day · Night` segmented control | Updates `localStorage.theme` + `data-theme`, runs §5.7 circular View Transition under `data-motion="full"` |
| **MotionSwitch** | Toggle button (`Reduce motion` / `Allow motion`) | `aria-pressed`; disabled with note when OS already requests reduced motion |
| **Card / Tile** | `surface` card (`--radius-card`); `portal` band tile & SOS `tel:112` row | Full-card overlay link with elevated nested `SaveButton`; `locked` tiles link to sign-in |
| **Section** | `default`, `band`, `plain` (`src/components/ui/Section.tsx`) | Head = eyebrow + display title + optional lead |
| **Callout** | `info`, `warning` (`Callout.tsx`); error banners use `.ui-callout--danger` | `role="status"` for live notes; `role="alert"` for blocking errors |
| **SiteHeader** | Sticky floating glass pill (`marketing`, `guide`, `stay` variants) | Nav inline at ≥ 1320 px, `MobileMenu` below; `scroll` > 24 px adds `shadow-raised` |
| **MobileMenu** | `<dialog>` sheet (`showModal()`) | Native focus trap, Esc/backdrop close, restores focus to trigger |
| **SiteFooter** | `marketing` and `stay` variants | Marketing includes tagline, `#contact` block (phone, email, WhatsApp, Instagram), host identity (`HostIdentity`), privacy, `stay` link, switches; no booking CTA |
| **BookBar** | Fixed mobile bottom bar (`Home` / `Apartment` when calendar fresh & free) | Visible only `< lg`; hidden while hero or another booking CTA is visible (`IntersectionObserver`) |
| **Calendar & SummaryCard** | Skinned `react-day-picker` + `src/lib/availability/stayQuote.ts` | 3 stacked months + "Show 3 more" below `md`, 2 side-by-side at ≥ `md`; crossing-booked reset, check-out-only `"out"` label, live announcements; SummaryCard omits prices and falls back cleanly when calendar stale/unconfigured |
| **GalleryLightbox** | Full-screen `<dialog>` with CSS horizontal scroll-snap | Keyboard `←`/`→`/`Home`/`End`/`Esc`, `1 / 42` counter (`scrollend` + `IntersectionObserver`), focus trap & restoration |
| **GuideFilters & MapCard** | Search (Esc clears) + non-empty category chips + List/Map toggle | Lazy loads `LeafletMap` on Map view; numbered `L.divIcon` pins matching relief map + token-styled popups |
| **Toast** | Floating status banner in `src/components/Toast.tsx` | `role="status"`, auto-dismisses after 5 s unless an action is present |
| **EmptyPanel** | Icon, title, description, optional action | Used for empty search results and empty favourites |

---

## 9. Page layouts

Shell per route: **M** = marketing header (`BookBar` on Home/Apartment), **G** = guide header, **S** = stay header (all share skip link + `<main id="main-content">`).

- **9.1 Home `/{l}` (M, BookBar):** Living-photo Hero (with valid Booking.com secondary CTA) → `FactStrip` → Highlights (`SeasonSwitch`) → `BalconyWindow` → `RoomsShowcase` → `NightsTeaser` (only with fresh 14-night calendar) → Location (`DistanceList` + `LocationRelief`) → `HostLetter` → `FaqSection` → Footer (`#contact`).
- **9.2 Apartment `/{l}/apartment` (M, BookBar):** Page head + inline `FactStrip` + text-only `HostIdentity` → `living_8` LCP photo → sticky room chips (`IntersectionObserver` `aria-current`) → room masonry/grids (`42` photos, opening `GalleryLightbox`) + amenities + CTA row.
- **9.3 Availability `/{l}/availability` (M):** Back link → heading + `HostIdentity` → responsive Calendar + sticky `SummaryCard` (or `info` `Callout` + contact CTAs when calendar stale/unconfigured) + no-JS 60-night `<noscript>` fallback + plain Info/Contact sections (no prices/cancellation).
- **9.4 Your stay hub `/{l}/stay` (S, calm, zero booking CTA):** Greeting + 4-column/2-column tile grid (Portal tile gated by `portalEnabled`, locked Wi-Fi/check-out until sign-in, House rules, Important phones with `tel:112`, Guide search, Favourites count).
- **9.5 Kalamata guide `/{l}/moments`, `/{l}/[category]/[slug]`, `/{l}/favorites` (G, calm):** Filterable straight-line-distance grid + lazy `?map=1` Leaflet view; detail hero/facts/`More nearby`; saved grid with `EmptyPanel`.
- **9.6 Important phones `/{l}/phones` (G, calm):** `112` `band` tile followed by hairline rows with 64 px thumbnails and `tel:` call links.
- **9.7 Guest sign-in & claim `/{l}/guest` (S, calm):** Centered 480 px column supporting sign-in, two-step claim exchange, password-reset onboarding, and localized callouts.
- **9.8 Check-in `/{l}/check-in` & Portal refresh `/{l}/portal/refresh` (S, calm, auth):** Stay dates, lazy map/directions, copyable Wi-Fi credentials, arrival request form, rules, emergency `tel:112`; refresh page shows 5 s "Still working…" fallback.
- **9.9 Privacy `/{l}/privacy` (G):** Editorial 65ch layout with data/cookie inventory table.
- **9.10–9.11 404, Errors, Offline (`/offline`, `/{l}/offline`):** Minimal stay shell with brand mark, localized headings, safe home/retry/offline links, and `tel:112` offline card.
- **9.12 Admin `/admin/*`:** Minimal stay-style admin header + token-styled tables/forms (`.admin-rise` CSS reveal in `admin.css`, zero third-party animation library).

---

## 10. Key front-end dependencies

| Need | Choice | Notes |
|---|---|---|
| 3D Hero | Custom WebGL fragment shader (`heroGl.ts`) | Lazy-loaded; falls back cleanly to SSR `<picture>` |
| Motion & reveal | CSS scroll-driven timelines, `@starting-style`, `IntersectionObserver` | Zero runtime animation dependency |
| Transitions | React `<ViewTransition>` + `document.startViewTransition` | Isolated in `SharedElement.tsx`, `ThemeSwitch.tsx`, `ApartmentGallery.tsx` |
| Calendar | `react-day-picker` | Skinned with tokens; business logic in `src/lib/availability/stayQuote.ts` |
| Map | `leaflet` | Lazy-loaded on toggle / check-in address card |
| Fonts | Self-hosted `woff2` + `next/font/local` | Per-subset `unicode-range` loading |

---

## 11. Implementation layout

`src/app/globals.css` imports styles in strict cascade order (unlayered component sheets beat `@import "tailwindcss"` utilities cleanly without `dark:` variants):

```css
@import "tailwindcss";
@source not "../../**/*.md";
@import "../styles/tokens.css";
@import "../styles/base.css";
@import "../styles/motion.css";
@import "../styles/components/*.css";
```

Key visual directories:

```text
src/app/fonts/            fonts.ts, 6 × .woff2, OFL-*.txt, SOURCES.txt
src/styles/               tokens.css, base.css, motion.css, components/{admin,apartment,calendar,guide,hero,home,legal,lightbox,map,shell,stay,ui}.css
src/components/ui/        Badge, Button, Callout, Chip, EmptyPanel, IconButton, MetricCard, Section, Segmented, Surface (+ src/components/Toast.tsx)
src/components/icons/     BrandMark.tsx, Icon.tsx (`IconName`, 49 keys)
src/components/shell/     AvailabilityBookBar, BookBar, HostIdentity, LanguageSwitch, MobileMenu, MotionSwitch, SiteFooter, SiteHeader, ThemeSwitch, shellLinks.ts
src/components/motion/    SharedElement.tsx
src/components/home/      BalconyWindow, FactCounters, FactStrip, FaqSection, Highlights, HomeRevealObserver, HostLetter, LocationSection, NightsTeaser, ReliefTilt, RoomsSection, RoomsShowcase, SeasonHighlights, hero/*, home{Nights,Relief,Rooms,Season}.ts
src/components/gallery/   ApartmentGallery, GalleryLightbox, photoMorph.ts
src/components/guide/     FavoritesList, GuideCard, GuideDetail, GuideList, PhonesDirectory, SaveButton, guide{Entries,Filters}.ts (map: ApartmentLocationMap, LeafletMap, MapLoadingSkeleton, maps/*)
src/components/stay/      EmergencyTile, StatusPage, StayHub, StaySessionTiles, StayTile
src/lib/motion/           heroCapability.ts, motionPreference.ts, pointerEffects.ts, pointerEffectsRuntime.ts, scheduleIdle.ts
scripts/design/           gen-app-icons.ts, gen-hero-assets.ts, gen-og-images.ts, mark.ts
public/                   house/balcony/hero/*, design/grain-{light,dark}.webp, brand/mark.svg, og/og-{en,el}.jpg
```

---

## 13. Open owner visual items

1. Owner confirmation of the published `BOOKING_COM_LISTING_URL` Share link in `src/data/contact.ts`.
2. Future optional photography upgrades (§7.4): sunset gulf view from balcony, blue-hour balcony frame, host portrait, Bedroom 2 / bathroom reshoots.
