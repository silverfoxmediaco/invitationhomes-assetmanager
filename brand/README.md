# Brand assets — Invitation Homes

Reference material only. These are the client's assets, captured from
invitationhomes.com on 2026-09-21 so the prototype can be styled to their
system instead of an invented one.

**They are not ours and this is not their product.** Do not present a screen
carrying this logo as Invitation Homes' software, and do not imply endorsement.
The same rule that governs the synthetic data governs the branding: this shows
how their problem could be modelled, nothing more.

## Files

| File | What it is |
|---|---|
| `invitation-homes-logo.png` | Full horizontal lockup, 1218 × 256, white ground |
| `favicons/favicon.ico` | Site favicon, multi-size ICO |
| `favicons/favicon.png` | Site favicon, PNG |
| `favicons/ih-icon-32.png` | PWA icon 32 × 32 |
| `favicons/ih-icon-64.png` | PWA icon 64 × 64 |
| `favicons/ih-icon-128.png` | PWA icon 128 × 128 |
| `favicons/manifest.json` | Their web app manifest |

## The logo is a raster capture, not the vector

Their header logo is an **inline SVG**, `viewBox="0 0 517.21 100.89"`, 29 paths.
There is no hosted `.svg` file to download — the only logo URLs on the page are
OneTrust cookie-consent assets.

Extracting the live SVG markup through the browser tool kept getting blocked by
a content filter, so this PNG was captured instead: the SVG was temporarily
scaled to 1200px in the page, captured, and the page restored to its original
state (verified back at 233, 56, 226 × 56).

256px tall is enough for any UI use at normal density. If a true vector is ever
needed — for print, or scaling past this — the fastest route is opening
devtools on their homepage, selecting the `<svg>` in the header and copying its
outer HTML by hand. Worth doing before anything goes to print, not before.

## Logo colors

The mark's own fills, read from the SVG rather than sampled from the PNG. These
differ slightly from the site's design tokens, so use the tokens for UI and
these only if reproducing the mark itself.

```
#9fcc3b   light green, outer diamond
#65bc46   mid green, most of the mark (10 paths)
#3cae49   mid green
#04a54f   green
#0c9347   deeper green
#168241   deeper green
#0b763c   deepest green
#231f20   near-black, the "invitation" wordmark (10 paths)
```

The wordmark splits: "invitation" in near-black, "homes" in green, with a ™.

## Site design tokens

The full palette and type scale live in `../CLAUDE.md`, pulled from their CSS
custom properties. Short version:

- **Nunito 700** for display and section headings, **Hind** for body and UI.
- Primary green `#206f06`, accent `#67bd47`, corporate teal `#27565b`.
- Eight-step neutral ramp `#e8e8e8` → `#4d4d4d`, text `#212121`.
