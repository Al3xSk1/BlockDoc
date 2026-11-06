---
description: Write locally with Obsidian or a Markdown editor and publish a connected Minecraft wiki.
---

# Writing guide

Write Markdown in `docs/`, keep related pages in folders, and give every folder an `index.md` overview.

## Local workflow

1. Open `docs/` as an Obsidian vault, or open the repository in your Markdown editor.
2. Run `uv run --group docs mkdocs serve` from the repository root.
3. Edit a page and check the preview at `http://127.0.0.1:8000`.
4. Add new pages to `nav` in `mkdocs.yml`.
5. Run `uv run --group docs mkdocs build --strict` before committing.

Use lowercase, hyphenated filenames such as `signal-strength.md`. Store attachments in `docs/assets/images/`; relative Markdown image links work in both the editor and MkDocs.

## Link pages like a wiki

The wiki-link plugin resolves filenames, paths, aliases, and heading links. Prefer paths from `docs/` when filenames repeat, especially `index.md`.

```markdown title="Wiki links"
[[stone]]
[[blocks/natural/stone|Stone]]
[[mechanics/redstone/signal-strength#how-power-fades|How power fades]]
```

For example, [[blocks/natural/stone|Stone]] connects to a block entry, and [[mechanics/redstone/signal-strength#how-power-fades|How power fades]] links to a specific heading.

Standard relative Markdown links work too:

```markdown
[Stone](../blocks/natural/stone.md)
![A labeled circuit](../assets/images/circuit.png)
```

Use standard Markdown links inside tables so a wiki alias's `|` does not split a cell. Heading fragments use lowercase words separated by hyphens.

!!! warning "Broken links block publishing"
    CI runs a strict build. Missing pages, unresolved wiki links, invalid heading anchors, and pages omitted from the navigation must be fixed before deployment.

## Page template

````markdown title="A useful reference entry"
---
description: One sentence explaining what this page answers.
---

# Page title

A brief definition and the most useful fact first.

| Property | Value |
| :--- | :--- |
| Identifier | `minecraft:example` |
| Tested version | Java 1.21 |

## Obtaining

Explain the shortest reliable method.

## Uses

Link to related entries.

!!! note "Edition details"
    Record behavior that differs between Java and Bedrock.
````

## Callouts, tabs, and tasks

Material callouts support titles and collapsible details:

```markdown
!!! tip "Useful shortcut"
    Keep the key point short.

??? note "More detail"
    Expand for background information.
```

Obsidian's callout syntax is also enabled:

```markdown
> [!note] Tested behavior
> Record the edition and version here.
```

For edition-specific content and progress checklists:

```markdown
=== "Java Edition"

    Describe the Java behavior.

=== "Bedrock Edition"

    Describe the Bedrock behavior.

- [x] Gather materials
- [ ] Test the circuit
```

## Import from Notion

Export **Markdown & CSV**, extract the archive, and move the relevant Markdown and attachments under `docs/`. Rename exported files to readable slugs and adjust their links before adding them to `nav`. Convert exported CSV databases into Markdown tables if you want them displayed as page content.

## Editor and publishing boundaries

Basic Markdown, tables, links, and supported callouts travel well. Material tabs, attribute lists, and icons render in the MkDocs preview. Obsidian plugins, Dataview queries, block references, and note transclusion require conversion to ordinary Markdown for this template.

Keep private notes outside `docs/`. Every document and asset in that folder is part of the public site unless explicitly excluded in the configuration.
