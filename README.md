# BlockDoc

A Minecraft documentation starter with a working Book & Quill flipbook, built with Python, MkDocs, and Material for MkDocs. Includes draggable page turns, parchment pages, pixel headings, daylight/moonlight themes, instant search, nested navigation, Obsidian wiki links, and a GitHub Pages pipeline.

## Run locally

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root:

```bash
uv sync --locked --only-group docs
uv run --no-sync mkdocs serve
```

Open <http://127.0.0.1:8000>. Python 3.12 is selected by `.python-version`; uv can install it automatically.

Before publishing:

```bash
uv run --group docs mkdocs build --strict
```

The generated site is written to `site/` and is ignored by Git. Dependencies are locked in `uv.lock`; commit that file when updating packages.

## Deploy for free on GitHub Pages

1. Push this repository to GitHub with a `main` branch.
2. In **Settings > Pages > Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main`, or run **Deploy documentation** from the Actions tab.

The workflow builds with the lockfile, validates links, uploads the static artifact, and publishes it using GitHub's official Pages actions. Pull requests run the same build checks. The build obtains `site_url` from GitHub Pages, so project paths such as `/BlockDoc/` work automatically. No branch containing built HTML is needed.

The live URL appears in the deployment and repository Pages settings. For GitHub Free, use a public repository. Set up a custom domain through Pages settings if needed; the build uses the URL returned by Pages.

For an equivalent local production build:

```bash
SITE_URL=https://YOUR-USERNAME.github.io/BlockDoc/ uv run --group docs mkdocs build --strict
```

Optionally uncomment `repo_url` and `edit_uri` in `mkdocs.yml` to show GitHub source links.

## Folder blueprint

```text
.
├── .github/workflows/deploy.yml
├── .python-version
├── mkdocs.yml
├── pyproject.toml
├── uv.lock
└── docs/
    ├── index.md                      # Open-book introduction and chapter index
    ├── assets/
    │   ├── logo.svg
    │   ├── book-and-quill.svg         # Original pixel illustration
    │   ├── paper-grain.svg
    │   ├── fonts/
    │   │   ├── pixelify-sans.woff2
    │   │   └── OFL.txt
    │   ├── javascripts/
    │   │   ├── reader.js             # Pagination, controls, and MkDocs lifecycle
    │   │   └── vendor/               # Local StPageFlip bundle and MIT license
    │   └── stylesheets/
    │       ├── extra.css             # Book surfaces and both reading themes
    │       ├── reader.css            # Bounded pages and reader controls
    │       └── vendor/page-flip-2.0.7.css
    ├── blocks/
    │   ├── index.md
    │   ├── natural/
    │   │   ├── index.md
    │   │   └── stone.md
    │   └── building/index.md
    ├── items/
    │   ├── index.md
    │   ├── tools/
    │   │   ├── index.md
    │   │   └── pickaxes.md
    │   └── materials/index.md
    ├── mechanics/
    │   ├── index.md
    │   ├── redstone/
    │   │   ├── index.md
    │   │   ├── signal-strength.md
    │   │   └── components/
    │   │       ├── index.md
    │   │       └── repeater.md
    │   └── enchanting/index.md
    ├── guides/
    │   ├── index.md
    │   └── getting-started.md
    ├── recipes/index.md
    └── reference/
        ├── index.md
        └── writing.md
```

## Write locally

Open `docs/` as an Obsidian vault or use any Markdown editor. Add a page, then register it under `nav` in `mkdocs.yml`. Folder `index.md` pages become clickable section overviews; deeper branches stay collapsible. Use a path for ambiguous wiki links:

```markdown
[[blocks/natural/stone|Stone]]
[[mechanics/redstone/signal-strength#how-power-fades|Signal strength]]
```

Standard relative Markdown links work alongside wiki links. Callouts, task lists, tables, syntax-highlighted code, and edition tabs are enabled; Obsidian `> [!note]` callouts are supported too. See [the writing guide](docs/reference/writing.md) for examples and Notion import steps. Material-specific syntax can be checked in the local site preview.

Use `docs/assets/images/` for new screenshots and diagrams. Keep private notes outside `docs/`; navigation only controls menus, not which files are published. `.obsidian/` and `.trash/` are excluded from Git.

## Customize

- **Brand and navigation:** `mkdocs.yml`, `docs/assets/logo.svg`.
- **Colors, layout, and typography:** `docs/assets/stylesheets/extra.css`.
- **Homepage:** `docs/index.md`.
- **Game scope:** samples are explicitly based on vanilla Minecraft 1.21. Record the tested edition and version as you expand them.

The site opens as a working flipbook: two pages on wider screens and one on phones. Drag a corner, swipe, click the page controls, or use the arrow keys to turn actual paginated HTML pages. Home/End jump to the beginning/end of a chapter; the page field jumps to a number. Chapter links navigate the wiki. A `?page=3` URL restores a reading position; heading links and search results open the page containing that heading.

Articles paginate automatically after local fonts and images load. Paragraphs preserve inline formatting when split, lists continue their numbering, and tables repeat their headers. Large indivisible widgets (for example a long code block or an expanded edition tab) get a local scroll area so their content stays available. A **Read as article** toggle restores the complete original document, and printing uses that article view. Without JavaScript, the static Markdown output remains readable. Reduced-motion mode changes pages immediately.

Page turns use self-hosted [StPageFlip 2.0.7](https://github.com/Nodlik/StPageFlip), under the included MIT license. The local integration changes are documented in `docs/assets/javascripts/vendor/README.txt`. They keep the engine's styles available across instant navigation and prevent abandoned render loops and resize handlers after changing chapters or resizing. No Node build step is required.

Articles share the paper texture, leather binding, and ruled tables. Longer passages use a native book typeface; headings and chapter tabs use the self-hosted [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) font under the SIL Open Font License (included in `docs/assets/fonts/OFL.txt`). The SVG illustrations are original, with no extracted game textures.

Search runs in the browser with Material's worker and generated index. Fonts and icons are served locally. The site uses static HTML, CSS, and JavaScript with no application server or paid services.

## Browser checks

```bash
uv sync --locked --group docs --group test
uv run --no-sync python -m playwright install chromium --only-shell
uv run --no-sync python -m unittest discover -s tests -v
```

The checks build an isolated site with a project URL and verify corner dragging, page turns, shareable page positions, long paragraphs, table continuations, heading links, tabs, code copying, touch swipes, reduced motion, printing, native article fallback, and cleanup during instant chapter navigation. The Pages workflow runs these checks before publishing. On Linux, add `--with-deps` to the browser installation command if system libraries are missing.

Upstream maintenance: Material 9.8 announces an end-of-support date of May 5, 2027. See the [maintainer's support timeline](https://zensical.org/upcoming-changes/#material-for-mkdocs) when planning long-term maintenance of this MkDocs-based site.

## License

BlockDoc is licensed under the [MIT License](LICENSE), copyright 2026 Alex.
Bundled third-party assets retain their included notices: [StPageFlip (MIT)](docs/assets/javascripts/vendor/LICENSE.txt) and [Pixelify Sans (SIL Open Font License)](docs/assets/fonts/OFL.txt).
