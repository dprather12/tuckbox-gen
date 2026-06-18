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

The workflow in `.github/workflows/deploy-pages.yml` runs only when manually started from the repository's **Actions** tab:

1. Install the exact dependencies from `package-lock.json`.
2. Run the test suite.
3. Build the production site into `dist/`.
4. Upload only `dist/` as the GitHub Pages artifact.
5. Deploy that artifact as the public website.

Before the first successful deployment:

1. Open **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Actions**, select **Deploy to GitHub Pages**, choose **Run workflow**, and run it from `main`.

GitHub must create the repository's Pages site before the deployment API will accept an artifact. A `Get Pages site failed: Not Found` message means the source has not yet been set to **GitHub Actions**.

## Search indexing

The production site includes:

- A canonical URL and descriptive search/social metadata.
- `WebApplication` structured data.
- A sitemap at `https://dprather12.github.io/tuckbox-gen/sitemap.xml`.
- A favicon and web app manifest.

After the first deployment, add `https://dprather12.github.io/tuckbox-gen/` to Google Search Console and submit the sitemap URL. Indexing is controlled by search engines and is not guaranteed or immediate.

Because this is a project site below `/tuckbox-gen/`, it cannot publish the host-level file at `https://dprather12.github.io/robots.txt`. A custom domain or an account-level `dprather12.github.io` Pages repository would allow that later.

## Traffic analytics

The site uses its dedicated Google Analytics 4 measurement ID `G-9HPJBBQ46P`. It records page views plus these application events:

- `artwork_upload`
- `artwork_remove`
- `template_download` with PDF/SVG format and sheet details

Google Analytics measurement IDs are public identifiers and do not need to be stored as repository secrets.
