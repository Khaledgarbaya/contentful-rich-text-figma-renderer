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

## License

MIT
