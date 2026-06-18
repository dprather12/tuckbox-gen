# Tuckbox Studio

A browser-only tool for creating print-ready straight-tuck-end card boxes. Artwork and PDF generation remain on the user's device; no backend is required.

## Local development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
```

Vite writes the static production site to `dist/`. That directory contains the HTML, CSS, JavaScript, and other browser assets that a static web server serves.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy-pages.yml` runs whenever `main` is pushed:

1. Install the exact dependencies from `package-lock.json`.
2. Run the test suite.
3. Build the production site into `dist/`.
4. Upload only `dist/` as the GitHub Pages artifact.
5. Deploy that artifact as the public website.

After pushing the repository, open **Settings → Pages** on GitHub and select **GitHub Actions** as the source.

