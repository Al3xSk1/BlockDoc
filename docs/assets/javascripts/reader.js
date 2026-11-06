/* Static HTML remains the source of truth; the book is a progressive enhancement. */
(() => {
  "use strict";
  if (window.__blockdocReaderInstalled || !window.St?.PageFlip) return;
  window.__blockdocReaderInstalled = true;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let active = null;
  let generation = 0;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const savedMode = () => {
    try { return sessionStorage.getItem("blockdoc-reader") || "book"; }
    catch { return "book"; }
  };
  const requestedPage = () => {
    const page = Number(new URL(location.href).searchParams.get("page"));
    return Number.isFinite(page) ? Math.max(0, Math.floor(page || 1) - 1) : 0;
  };
  const hashId = () => {
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch { return ""; }
  };

  // Range preserves links, emphasis, and other inline markup across a page break.
  function textSlice(node, start, end) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    const position = (offset) => {
      for (const text of texts) {
        if (offset <= text.length) return [text, offset];
        offset -= text.length;
      }
      return [texts.at(-1), texts.at(-1).length];
    };
    const range = document.createRange();
    range.setStart(...position(start));
    range.setEnd(...position(end));
    const piece = node.cloneNode(false);
    piece.append(range.cloneContents());
    if (start) piece.removeAttribute("id");
    return piece;
  }

  function splitter(node) {
    const table = node.matches("table") ? node : node.querySelector("table");
    if (table && !node.matches(".tabbed-set, details, .admonition")) {
      const rows = [...table.tBodies].flatMap(body => [...body.rows]);
      if (rows.length) return {
        count: rows.length,
        slice(start, end) {
          const piece = node.cloneNode(true);
          const copy = piece.matches("table") ? piece : piece.querySelector("table");
          [...copy.tBodies].forEach(body => body.remove());
          const body = document.createElement("tbody");
          rows.slice(start, end).forEach(row => body.append(row.cloneNode(true)));
          copy.append(body);
          if (end < rows.length) copy.tFoot?.remove();
          if (start) {
            piece.removeAttribute("id");
            copy.tHead?.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
          }
          return piece;
        }
      };
    }
    const list = node.matches("ol, ul") ? node : node.matches(".chapter-list") ? node.querySelector("ol") : null;
    if (list) {
      const items = [...list.children];
      return {
        count: items.length,
        slice(start, end) {
          const piece = node.cloneNode(true);
          const copy = piece.matches("ol, ul") ? piece : piece.querySelector("ol");
          copy.replaceChildren(...items.slice(start, end).map(item => item.cloneNode(true)));
          if (copy.tagName === "OL") copy.start = (list.start || 1) + start;
          if (piece.matches(".chapter-list")) copy.style.counterReset = `chapter ${start}`;
          if (start) piece.removeAttribute("id");
          return piece;
        }
      };
    }
    if (node.matches("p, blockquote") && !node.querySelector("img, input, button, video, audio")) {
      const ends = [...node.textContent.matchAll(/\S+\s*/g)].map(match => match.index + match[0].length);
      if (ends.length > 1) return {
        count: ends.length,
        slice(start, end) {
          return textSlice(node, start ? ends[start - 1] : 0, ends[end - 1]);
        }
      };
    }
    return null;
  }

  class BookReader {
    constructor(article) {
      this.article = article;
      this.path = location.pathname;
      this.title = article.querySelector("h1")?.textContent.replace(/¶$/, "").trim() || "Field journal";
      this.source = element("div", "reader-article");
      this.source.append(...article.childNodes);
      this.source.querySelectorAll("details, input").forEach((node, index) => { node.dataset.readerState = String(index); });
      this.abort = new AbortController();
      this.pages = [];
      this.engine = null;
      this.disposed = false;
      this.initializing = true;
      this.root = element("div", "reader-root");
      this.root.dataset.readerPath = this.path;
      this.root.setAttribute("role", "region");
      this.root.setAttribute("aria-label", `${this.title} flipbook`);
      this.root.tabIndex = 0;
      this.root.innerHTML = `
        <div class="reader-toolbar"><span class="reader-title"></span><button class="reader-mode" type="button">Read as article</button></div>
        <div class="reader-book"><div class="reader-cover"><div class="reader-stage"></div></div>
          <div class="reader-controls" role="group" aria-label="Turn pages">
            <button type="button" data-turn="previous" aria-label="Previous page">← Previous</button>
            <div class="reader-position"><label>Page <input type="number" min="1" value="1" aria-label="Page number"></label><span class="reader-count" role="status" aria-live="polite"></span></div>
            <button type="button" data-turn="next" aria-label="Next page">Next →</button>
          </div>
          <p class="reader-hint">Drag a corner, swipe, or use ← and → to turn pages.</p>
        </div><nav class="reader-chapters" aria-label="Chapters"></nav>`;
      this.root.querySelector(".reader-title").textContent = this.title;
      this.book = this.root.querySelector(".reader-book");
      this.cover = this.root.querySelector(".reader-cover");
      this.modeButton = this.root.querySelector(".reader-mode");
      this.pageInput = this.root.querySelector("input");
      for (const [rel, label] of [["prev", "← Previous chapter"], ["next", "Next chapter →"]]) {
        // Use the chapter targets from Material's current navigation.
        const href = document.querySelector(`.md-footer__link--${rel}`)?.href || document.querySelector(`head link[rel="${rel}"]`)?.href;
        if (href) {
          const link = element("a", "", label);
          link.href = href;
          link.rel = rel;
          this.root.querySelector(".reader-chapters").append(link);
        }
      }
      article.replaceChildren(this.root);
      article.parentElement.classList.add("reader-content");
      document.body.classList.add("reader-enhanced");
      this.listen(this.root, "click", event => this.click(event), true);
      // Let links, form labels, selection controls, and local overflow work natively.
      for (const type of ["mousedown", "touchstart"]) this.listen(this.root, type, event => {
        if (event.target.closest("a, button, input, label, select, textarea, summary, .reader-scroll-block")) event.stopPropagation();
      }, { capture: true, passive: true });
      this.listen(this.root, "touchstart", event => {
        if (!event.target.closest(".reader-leaf") || event.target.closest("a, button, input, label, select, textarea, summary, .reader-scroll-block")) return;
        // Recognize swipes here; retain the engine's live corner dragging for mice.
        event.stopPropagation();
        this.touch = event.changedTouches[0];
      }, { capture: true, passive: true });
      this.listen(this.root, "touchmove", event => {
        if (!this.touch) return;
        const point = event.changedTouches[0];
        if (Math.abs(point.clientX - this.touch.clientX) > Math.abs(point.clientY - this.touch.clientY) && event.cancelable) event.preventDefault();
        event.stopPropagation();
      }, { capture: true, passive: false });
      this.listen(this.root, "touchend", event => {
        if (!this.touch) return;
        const end = event.changedTouches[0];
        const distance = end.clientX - this.touch.clientX;
        if (Math.abs(distance) > 45 && Math.abs(end.clientY - this.touch.clientY) < 70) {
          if (event.cancelable) event.preventDefault();
          this.turn(distance < 0 ? 1 : -1);
        }
        event.stopPropagation();
        this.touch = null;
      }, { capture: true, passive: false });
      this.listen(this.root, "touchcancel", () => { this.touch = null; });
      this.listen(document, "keydown", event => this.keydown(event));
      this.listen(this.pageInput, "change", () => this.go(Number(this.pageInput.value) - 1));
      this.listen(this.root, "change", event => this.rememberControl(event));
      this.listen(this.root, "toggle", event => this.rememberControl(event), true);
      this.listen(window, "hashchange", () => this.revealHash());
      this.listen(window, "popstate", event => {
        if (location.pathname === this.path && this.engine) {
          event.stopImmediatePropagation();
          if (!this.revealHash()) this.go(requestedPage(), false);
        }
      }, true);
      this.listen(window, "resize", () => this.scheduleLayout());
      this.listen(motion, "change", () => this.scheduleLayout(true));
      this.listen(window, "beforeprint", () => {
        this.printWasBook = !!this.engine;
        if (this.printWasBook) this.showArticle(false);
      });
      this.listen(window, "afterprint", () => { if (this.printWasBook) this.showBook(); });
      this.observer = new ResizeObserver(() => this.scheduleLayout());
      this.observer.observe(article.parentElement);
      if (savedMode() === "article") this.showArticle(false);
      else this.showBook();
    }

    listen(target, type, callback, options = {}) {
      if (typeof options === "boolean") options = { capture: options };
      target.addEventListener(type, callback, { ...options, signal: this.abort.signal });
    }

    size() {
      const available = Math.floor(this.article.clientWidth - 16);
      const portrait = available < 680;
      const header = document.querySelector(".md-header")?.getBoundingClientRect().height || 56;
      const maxHeight = Math.max(300, Math.min(720, innerHeight - header - 174));
      const width = Math.floor(Math.min(available / (portrait ? 1 : 2), maxHeight * .74, 520));
      return { width, height: Math.floor(Math.min(maxHeight, width * 1.4)), portrait };
    }

    stopEngine() {
      if (!this.engine) return;
      this.initializing = true;
      this.engine.getRender().stop();
      this.engine.destroy();
      this.engine = null;
    }

    showArticle(persist = true) {
      this.bookmark = this.bookmarkForCurrentPage();
      this.stopEngine();
      clearTimeout(this.layoutTimer);
      this.book.hidden = true;
      this.root.insertBefore(this.source, this.root.querySelector(".reader-chapters"));
      this.modeButton.textContent = "Open flipbook";
      this.modeButton.setAttribute("aria-pressed", "false");
      document.body.classList.remove("reader-active");
      if (persist) {
        try { sessionStorage.setItem("blockdoc-reader", "article"); } catch { /* Storage is optional. */ }
      }
    }

    showBook() {
      this.source.remove();
      this.book.hidden = false;
      this.modeButton.textContent = "Read as article";
      this.modeButton.setAttribute("aria-pressed", "true");
      document.body.classList.add("reader-active");
      try { sessionStorage.setItem("blockdoc-reader", "book"); } catch { /* Storage is optional. */ }
      this.layout(this.bookmark);
    }

    makePage(size, className = "") {
      const page = element("div", "reader-leaf");
      page.style.width = `${size.width}px`;
      page.style.height = `${size.height}px`;
      page.setAttribute("role", "group");
      const running = element("div", "reader-running");
      running.setAttribute("aria-hidden", "true");
      running.append(element("span", "", "BlockDoc"), element("span", "", this.title));
      const body = element("div", `reader-leaf__body ${className}`);
      page.append(running, body, element("p", "reader-folio"));
      return { page, body };
    }

    paginate(size) {
      const measure = element("div", "reader-measure");
      measure.setAttribute("aria-hidden", "true");
      this.root.append(measure);
      const pages = [];
      let current;
      let blockNumber = 0;
      const addPage = (className) => {
        current = this.makePage(size, className);
        measure.replaceChildren(current.page);
        pages.push(current.page);
      };
      const fits = (node) => {
        current.body.append(node);
        const result = current.body.scrollHeight <= current.body.clientHeight + 1;
        node.remove();
        return result;
      };
      const newPage = (className) => {
        const last = current.body.lastElementChild;
        const heading = last?.matches("h1,h2,h3,h4") && current.body.children.length > 1 ? last : null;
        heading?.remove();
        addPage(className);
        if (heading) current.body.append(heading);
      };
      const home = this.source.querySelector(".journal-home");
      const groups = home ? [...home.querySelectorAll(".book-page")].map(section => ({
        className: [...section.classList].filter(name => name !== "book-page").join(" "),
        nodes: [...section.children].filter(node => !node.matches(".book-running-title, .book-folio"))
      })) : [{ className: "", nodes: [...this.source.children] }];
      try {
        for (const group of groups) {
          addPage(group.className);
          for (const original of group.nodes) {
            const node = original.cloneNode(true);
            node.dataset.readerBlock = String(blockNumber++);
            if (fits(node)) { current.body.append(node); continue; }
            const parts = splitter(node);
            if (parts) {
              let start = 0;
              while (start < parts.count) {
                let low = 1, high = parts.count - start, count = 0;
                while (low <= high) {
                  const middle = Math.floor((low + high) / 2);
                  if (fits(parts.slice(start, start + middle))) { count = middle; low = middle + 1; }
                  else high = middle - 1;
                }
                if (!count) {
                  if (current.body.children.length) { newPage(group.className); continue; }
                  this.addScrollable(current.body, parts.slice(start, parts.count));
                  break;
                }
                const piece = parts.slice(start, start + count);
                piece.dataset.readerBlock = node.dataset.readerBlock;
                piece.dataset.readerOffset = String(start);
                current.body.append(piece);
                start += count;
                if (start < parts.count) newPage(group.className);
              }
            } else {
              if (current.body.children.length) newPage(group.className);
              if (fits(node)) current.body.append(node);
              else this.addScrollable(current.body, node);
            }
          }
        }
        if (!size.portrait && pages.length % 2) {
          addPage("");
          current.body.append(element("h2", "", "End of this chapter"));
          const next = this.root.querySelector('.reader-chapters a[rel="next"]');
          if (next) {
            const link = next.cloneNode(true);
            link.className = "md-button";
            current.body.append(link);
          }
        }
        pages.forEach((page, index) => {
          page.dataset.page = String(index + 1);
          page.setAttribute("aria-label", `Page ${index + 1}`);
          page.querySelector(".reader-folio").textContent = String(index + 1);
        });
        // A repeated table header or split inline ancestor must not duplicate IDs.
        const ids = new Set();
        for (const page of pages) for (const node of page.querySelectorAll("[id]")) {
          if (ids.has(node.id)) node.removeAttribute("id");
          else ids.add(node.id);
        }
        return pages;
      } finally { measure.remove(); }
    }

    addScrollable(body, node) {
      const block = element("div", "reader-scroll-block");
      block.setAttribute("role", "region");
      block.setAttribute("aria-label", "Scrollable reference section");
      block.tabIndex = 0;
      const used = body.lastElementChild ? body.lastElementChild.getBoundingClientRect().bottom - body.getBoundingClientRect().top + 12 : 0;
      block.style.height = `${Math.max(80, body.clientHeight - used)}px`;
      block.append(node);
      body.append(block);
    }

    layout(bookmark) {
      if (this.disposed || this.book.hidden) return;
      const initialPage = requestedPage();
      this.stopEngine();
      const size = this.size();
      this.sizeKey = JSON.stringify(size);
      this.pages = this.paginate(size);
      const stage = element("div", "reader-stage");
      stage.style.width = `${size.width * (size.portrait ? 1 : 2)}px`;
      stage.style.height = `${size.height}px`;
      this.cover.style.width = stage.style.width;
      this.cover.replaceChildren(stage);
      this.engine = new St.PageFlip(stage, {
        width: size.width, height: size.height, size: "fixed", autoSize: false,
        usePortrait: true, showCover: false, drawShadow: !motion.matches,
        flippingTime: 650, maxShadowOpacity: .3, mobileScrollSupport: false,
        clickEventForward: true, disableFlipByClick: true,
        useMouseEvents: !motion.matches, showPageCorners: !motion.matches,
        swipeDistance: 45
      });
      this.engine.on("flip", () => this.sync());
      this.engine.on("changeState", event => { this.root.dataset.readerState = event.data; });
      this.engine.on("init", () => this.sync(false));
      this.engine.loadFromHTML(this.pages);
      let page = initialPage;
      if (bookmark) {
        const matches = this.pages.map((leaf, index) => ({ index, node: leaf.querySelector(`[data-reader-block="${bookmark.block}"]`) }))
          .filter(item => item.node && Number(item.node.dataset.readerOffset || 0) <= bookmark.offset);
        if (matches.length) page = matches.at(-1).index;
      }
      this.initializing = false;
      if (!this.revealHash()) this.go(page, false);
      this.sync(false);
    }

    bookmarkForCurrentPage() {
      const page = this.pages[this.engine?.getCurrentPageIndex() || 0];
      const node = page?.querySelector("[data-reader-block]");
      return node ? { block: node.dataset.readerBlock, offset: Number(node.dataset.readerOffset || 0) } : null;
    }

    scheduleLayout(force = false) {
      if (!this.engine || this.disposed) return;
      clearTimeout(this.layoutTimer);
      this.layoutTimer = setTimeout(() => {
        if (force || JSON.stringify(this.size()) !== this.sizeKey) this.layout(this.bookmarkForCurrentPage());
      }, 180);
    }

    sync(updateUrl = true) {
      if (!this.engine || this.initializing || this.disposed) return;
      const index = this.engine.getCurrentPageIndex();
      const visible = this.engine.getOrientation() === "portrait" ? 1 : 2;
      this.pages.forEach((page, pageIndex) => {
        const shown = pageIndex >= index && pageIndex < index + visible;
        page.inert = !shown;
        page.setAttribute("aria-hidden", String(!shown));
      });
      this.root.dataset.readerPage = String(index + 1);
      this.root.dataset.readerCount = String(this.pages.length);
      this.pageInput.max = String(this.pages.length);
      this.pageInput.value = String(index + 1);
      const end = Math.min(index + visible, this.pages.length);
      this.root.querySelector(".reader-count").textContent = `${visible === 2 ? `–${end} ` : " "}of ${this.pages.length}`;
      this.root.querySelector('[data-turn="previous"]').disabled = index === 0;
      this.root.querySelector('[data-turn="next"]').disabled = index + visible >= this.pages.length;
      if (updateUrl) {
        const url = new URL(location.href);
        if (index) url.searchParams.set("page", String(index + 1));
        else url.searchParams.delete("page");
        if (!this.keepingHash) url.hash = "";
        history.replaceState(history.state, "", url);
      }
    }

    go(index, animate = true) {
      if (!this.engine || !Number.isFinite(index)) return;
      index = Math.max(0, Math.min(this.pages.length - 1, Math.floor(index)));
      if (animate && !motion.matches) this.engine.flip(index, "bottom");
      else this.engine.turnToPage(index);
      this.sync(false);
    }

    turn(direction) {
      if (!this.engine || this.engine.getState() !== "read") return;
      const button = this.root.querySelector(`[data-turn="${direction > 0 ? "next" : "previous"}"]`);
      if (button.disabled) return;
      if (motion.matches) {
        if (direction > 0) this.engine.turnToNextPage();
        else this.engine.turnToPrevPage();
      } else if (direction > 0) this.engine.flipNext("bottom");
      else this.engine.flipPrev("bottom");
    }

    revealHash() {
      if (!this.engine || !hashId()) return false;
      const index = this.pages.findIndex(page => page.querySelector(`#${CSS.escape(hashId())}`));
      if (index < 0) return false;
      this.keepingHash = true;
      this.go(index, false);
      this.keepingHash = false;
      return true;
    }

    async click(event) {
      if (event.target.closest(".reader-mode")) {
        if (this.engine) this.showArticle(); else this.showBook();
        return;
      }
      const turn = event.target.closest("[data-turn]");
      if (turn) { this.turn(turn.dataset.turn === "next" ? 1 : -1); return; }
      const tabLabel = event.target.closest(".reader-leaf .tabbed-labels label");
      if (tabLabel) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const radio = this.root.querySelector(`#${CSS.escape(tabLabel.htmlFor)}`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      const copy = event.target.closest('.reader-leaf .md-clipboard, .reader-leaf [data-md-type="copy"]');
      if (copy) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const code = copy.closest(".highlight")?.querySelector("code");
        if (code) {
          try {
            await navigator.clipboard.writeText(code.textContent);
            copy.setAttribute("aria-label", "Copied!");
          } catch { copy.setAttribute("aria-label", "Select the code to copy"); }
        }
        return;
      }
      const link = event.target.closest("a[href]");
      if (!link || !this.engine || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === this.path && url.hash) {
        event.preventDefault();
        event.stopImmediatePropagation();
        history.pushState(history.state, "", url);
        this.revealHash();
      }
    }

    keydown(event) {
      if (!this.engine || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector("#__search:checked, #__drawer:checked")) return;
      if (event.target.closest("input, textarea, select, [contenteditable], .reader-scroll-block")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") this.turn(1);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") this.turn(-1);
      else if (event.key === "Home") this.go(0);
      else if (event.key === "End") this.go(this.pages.length - 1);
      else return;
      event.preventDefault();
    }

    rememberControl(event) {
      const node = event.target;
      if (!this.engine || !node.matches(".reader-leaf details, .reader-leaf input")) return;
      const source = this.source.querySelector(`[data-reader-state="${node.dataset.readerState}"]`);
      if (!source) return;
      if (node.tagName === "DETAILS") {
        if (source.open === node.open) return;
        source.open = node.open;
      }
      else {
        if (node.type === "radio") this.source.querySelectorAll(`input[name="${CSS.escape(node.name)}"]`).forEach(input => { input.checked = false; });
        source.checked = node.checked;
      }
      this.scheduleLayout(true);
    }

    dispose() {
      this.disposed = true;
      this.abort.abort();
      this.observer.disconnect();
      clearTimeout(this.layoutTimer);
      this.stopEngine();
      this.article.replaceChildren(...this.source.childNodes);
      this.article.parentElement?.classList.remove("reader-content");
      document.body.classList.remove("reader-active", "reader-enhanced");
    }
  }

  async function mount() {
    const article = document.querySelector("article.md-content__inner");
    if (!article || active?.article === article) return;
    const ticket = ++generation;
    active?.dispose();
    active = null;
    await document.fonts.ready;
    await Promise.race([
      Promise.all([...article.querySelectorAll("img")].map(image => image.complete ? null : new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }))),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
    if (ticket !== generation || !article.isConnected) return;
    try { active = new BookReader(article); }
    catch (error) {
      // Preserve readable content even if the optional book engine fails.
      console.error("Book reader could not start", error);
      location.replace(new URL(location.href).pathname + "?reader=article" + location.hash);
    }
  }

  if (new URL(location.href).searchParams.get("reader") === "article") return;
  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
