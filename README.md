# contentful-rich-text-figma-renderer

Convert Contentful Rich Text documents into formatted Figma nodes — headings, bold/italic, lists, tables, images, and hyperlinks.

## Install

```bash
npm install contentful-rich-text-figma-renderer
```

## Usage

### Pure renderer (no Figma dependency)

Convert a Contentful Rich Text `Document` into a flat render plan:

```ts
import {
  documentToRenderPlan,
  richTextToPlainString,
} from "contentful-rich-text-figma-renderer";

// Convert to a structured render plan (text blocks, images, tables, HRs)
const plan = documentToRenderPlan(richTextDocument);

// Or convert to a plain text string
const text = richTextToPlainString(richTextDocument);
```

### Figma rendering

Apply the render plan to Figma nodes inside a Figma plugin:

```ts
import { documentToRenderPlan } from "contentful-rich-text-figma-renderer";
import {
  applyTextBlocksToNode,
  applyMixedContentPlan,
} from "contentful-rich-text-figma-renderer/figma";

const plan = documentToRenderPlan(richTextDocument);

// Simple: apply formatted text to an existing TextNode
await applyTextBlocksToNode(figma, textNode, plan.blocks);

// Mixed content: replaces a TextNode with a frame containing
// text, images, and tables
await applyMixedContentPlan(figma, textNode, plan.blocks, parentFrame);
```

> The Figma functions accept the `figma` Plugin API as the first argument instead of relying on a global — this makes them testable and compatible with any plugin setup.

## API

### Main entry (`contentful-rich-text-figma-renderer`)

| Export                       | Description                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `documentToRenderPlan(doc)`  | Converts a Rich Text Document AST into a `RichTextRenderPlan` with typed blocks |
| `richTextToPlainString(doc)` | Converts a Rich Text Document to a plain text string                            |

### Figma entry (`contentful-rich-text-figma-renderer/figma`)

| Export                                                  | Description                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `applyTextBlocksToNode(figmaApi, node, blocks)`         | Applies rich text formatting (bold, italic, headings, lists, links) to a TextNode |
| `applyMixedContentPlan(figmaApi, node, blocks, parent)` | Replaces a TextNode with a rich-text frame containing text, images, and tables    |
| `resolveFontVariants(figmaApi, baseFont)`               | Loads bold/italic/bold-italic font variants                                       |
| `getFontForSegment(segment, variants)`                  | Returns the correct font variant for a text segment                               |
| `HEADING_SCALE`                                         | Scale factors for heading levels 1-6                                              |

### Types

```ts
import type {
  RichTextDocument,
  RichTextBlock,
  RichTextInline,
  RichTextText,
  RichTextSegment,
  RichTextTableRow,
  RichTextRenderBlock,
  RichTextRenderPlan,
} from "contentful-rich-text-figma-renderer";
```

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repo and clone it locally
2. Install dependencies: `npm install`
3. Create a branch for your change: `git checkout -b my-feature`
4. Make your changes and add tests for new functionality
5. Run the full CI check: `npm run ci`
6. Commit your changes and push to your fork
7. Open a pull request

### Development commands

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `npm run build`      | Compile TypeScript to `dist/`          |
| `npm run dev`        | Watch mode — recompiles on file change |
| `npm run test`       | Run tests once                         |
| `npm run test:watch` | Run tests in watch mode                |
| `npm run format`     | Format code with Prettier              |
| `npm run ci`         | Full check: build + format + tests     |

### Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning. If your PR introduces user-facing changes, add a changeset:

```bash
npx changeset
```

Follow the prompts to describe your change and select a semver bump level.

### Guidelines

- Keep the pure renderer (`renderer.ts`) free of Figma dependencies
- Figma-specific code goes in `figma.ts` and is exported via the `./figma` subpath
- All Figma API functions accept `figmaApi: PluginAPI` as the first parameter — no globals
- Add tests for new renderer logic (Figma functions can't be unit tested without mocks)

## Sponsorship

If this package is useful to you, consider [sponsoring the project](https://github.com/sponsors/Khaledgarbaya). Your support helps keep it maintained and improved.

## License

MIT
