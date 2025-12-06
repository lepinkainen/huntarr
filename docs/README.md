# Huntarr Documentation

This directory contains the official documentation for Huntarr, published at [https://adamflagg.github.io/huntarr](https://adamflagg.github.io/huntarr).

## Structure

The documentation is built using GitHub Pages with files directly from the `/docs` folder. The main entry point is `index.html`.

## Current Documentation

- **Installation** - `getting-started/installation.html`
- **App Configuration** - `apps/` (Sonarr, Radarr, Lidarr, Readarr, Whisparr v2/v3, Eros)
- **Features** - `features/` (Scheduling, etc.)
- **Settings** - `settings/`
- **FAQ** - `faq.html`
- **Donate** - `donate.html`

## Local Testing

To test documentation locally:

```bash
cd /path/to/huntarr/docs
python -m http.server 8000
```

Then open your browser to `http://localhost:8000`.

## Contributing

1. Make changes to files in the `/docs` directory
2. Submit a pull request to the main branch
3. Changes deploy automatically via GitHub Pages

## Contact

If you have questions, please open an issue on [GitHub](https://github.com/adamflagg/huntarr/issues).
