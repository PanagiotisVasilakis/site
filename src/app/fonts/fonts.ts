// Self-hosted fonts (docs/design/identity.md §2.3). One localFont call per subset,
// because next/font applies `declarations` to every file of a call. next/font
// arguments must be literals, so the unicode ranges are inlined.
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
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
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
  declarations: [{ prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' }],
});
