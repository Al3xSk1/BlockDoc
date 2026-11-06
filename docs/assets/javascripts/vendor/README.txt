StPageFlip / page-flip 2.0.7
Source: https://registry.npmjs.org/page-flip/-/page-flip-2.0.7.tgz
Project: https://github.com/Nodlik/StPageFlip
License: MIT, reproduced in LICENSE.txt.

The upstream bundle is self-hosted to avoid CDN requests at runtime.
Local change: Render.start() stores its requestAnimationFrame handle, and
Render.stop() cancels that loop. reader.js calls stop() before destroy().
Without this change, upstream retains a render loop for every disposed book,
including after MkDocs instant navigation and responsive repagination.

UI.destroy() also calls removeHandlers() unconditionally, since the upstream
UI installs a window resize listener even when useMouseEvents is disabled.
This makes teardown complete in reduced-motion mode as well.

The upstream style injection is extracted into the linked stylesheet at
assets/stylesheets/vendor/page-flip-2.0.7.css. Material's instant navigation
replaces inline head styles, so the engine's layout rules must be loaded
through MkDocs extra_css to remain available after changing chapters.
