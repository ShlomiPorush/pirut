# Pirut icon assets

`pirut-icon.svg` is the editable vector source of truth for the selected C direction.

## Web defaults

```html
<link rel="icon" href="/icons/favicon.ico" sizes="any" />
<link rel="icon" href="/icons/pirut-icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

## Included files

- `favicon.ico`: 16, 32, and 48 pixel frames.
- `favicon-16x16.png` and `favicon-32x32.png`: explicit browser fallbacks.
- `apple-touch-icon.png`: 180 by 180 pixels.
- `android-chrome-192x192.png` and `android-chrome-512x512.png`: common PWA sizes.
- `png/pirut-icon-{16,32,48,64,128,180,192,256,512,1024}x{size}.png`: complete raster size set.

All raster files are rendered from the SVG on a transparent canvas.
