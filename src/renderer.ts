import type {
  RichTextDocument,
  RichTextBlock,
  RichTextInline,
  RichTextText,
  RichTextSegment,
  RichTextRenderBlock,
  RichTextRenderPlan,
  RichTextTableRow,
} from "./types.js";

interface BlockContext {
  headingLevel: number;
  listType: "unordered" | "ordered" | null;
  listIndent: number;
  isBlockquote: boolean;
}

const DEFAULT_CONTEXT: BlockContext = {
  headingLevel: 0,
  listType: null,
  listIndent: 0,
  isBlockquote: false,
};

function hasMarks(node: RichTextText, markType: string): boolean {
  return node.marks?.some((m) => m.type === markType) ?? false;
}

function textNodeToSegment(
  node: RichTextText,
  ctx: BlockContext,
): RichTextSegment {
  return {
    text: node.value,
    bold: hasMarks(node, "bold"),
    italic: hasMarks(node, "italic"),
    underline: hasMarks(node, "underline"),
    code: hasMarks(node, "code"),
    headingLevel: ctx.headingLevel,
    listType: ctx.listType,
    listIndent: ctx.listIndent,
    hyperlink: null,
  };
}

function collectSegmentsFromInline(
  inline: RichTextInline,
  ctx: BlockContext,
): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  const isHyperlink =
    inline.nodeType === "hyperlink" ||
    inline.nodeType === "entry-hyperlink" ||
    inline.nodeType === "asset-hyperlink";

  let href: string | null = null;
  if (isHyperlink) {
    href =
      (inline.data?.uri as string) ||
      (
        inline.data?.target as {
          fields?: { file?: { url?: string } };
        }
      )?.fields?.file?.url ||
      null;
  }

  for (const child of inline.content) {
    if (child.nodeType === "text") {
      const seg = textNodeToSegment(child, ctx);
      if (href) {
        seg.hyperlink = href;
        seg.underline = true;
      }
      segments.push(seg);
    }
  }

  // Embedded inline entries: show placeholder
  if (inline.nodeType === "embedded-entry-inline") {
    const target = inline.data?.target as {
      fields?: { title?: Record<string, string> | string };
      sys?: { id?: string };
    };
    const title =
      (typeof target?.fields?.title === "object"
        ? target?.fields?.title?.["en-US"]
        : target?.fields?.title) ||
      target?.sys?.id ||
      "entry";
    segments.push({
      text: `[${title}]`,
      bold: false,
      italic: true,
      underline: false,
      code: false,
      headingLevel: ctx.headingLevel,
      listType: ctx.listType,
      listIndent: ctx.listIndent,
      hyperlink: null,
    });
  }

  return segments;
}

function collectSegmentsFromBlock(
  block: RichTextBlock,
  ctx: BlockContext,
): RichTextSegment[] {
  const segments: RichTextSegment[] = [];

  for (const child of block.content) {
    if (child.nodeType === "text") {
      segments.push(textNodeToSegment(child as RichTextText, ctx));
    } else if (
      (child as RichTextInline).content &&
      !isBlockNode(child.nodeType)
    ) {
      segments.push(...collectSegmentsFromInline(child as RichTextInline, ctx));
    } else if (isBlockNode(child.nodeType)) {
      segments.push(...processBlock(child as RichTextBlock, ctx));
    }
  }

  return segments;
}

function isBlockNode(nodeType: string): boolean {
  return [
    "paragraph",
    "heading-1",
    "heading-2",
    "heading-3",
    "heading-4",
    "heading-5",
    "heading-6",
    "blockquote",
    "unordered-list",
    "ordered-list",
    "list-item",
    "table",
    "table-row",
    "table-cell",
    "table-header-cell",
    "hr",
    "embedded-asset-block",
    "embedded-entry-block",
  ].includes(nodeType);
}

function headingLevelFromNodeType(nodeType: string): number {
  const match = nodeType.match(/^heading-(\d)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function processBlock(
  block: RichTextBlock,
  parentCtx: BlockContext,
): RichTextSegment[] {
  const nodeType = block.nodeType;
  const segments: RichTextSegment[] = [];

  if (nodeType.startsWith("heading-")) {
    const ctx: BlockContext = {
      ...parentCtx,
      headingLevel: headingLevelFromNodeType(nodeType),
    };
    segments.push(...collectSegmentsFromBlock(block, ctx));
    return segments;
  }

  if (nodeType === "paragraph") {
    segments.push(...collectSegmentsFromBlock(block, parentCtx));
    return segments;
  }

  if (nodeType === "blockquote") {
    const ctx: BlockContext = { ...parentCtx, isBlockquote: true };
    for (const child of block.content) {
      segments.push(...processBlock(child as RichTextBlock, ctx));
    }
    return segments;
  }

  if (nodeType === "unordered-list" || nodeType === "ordered-list") {
    const listType = nodeType === "unordered-list" ? "unordered" : "ordered";
    for (const child of block.content) {
      if (child.nodeType === "list-item") {
        const ctx: BlockContext = {
          ...parentCtx,
          listType,
          listIndent: parentCtx.listIndent + 1,
        };
        for (const listChild of (child as RichTextBlock).content) {
          segments.push(...processBlock(listChild as RichTextBlock, ctx));
        }
      }
    }
    return segments;
  }

  // Tables: flatten to tab-separated text (fallback for plain-text contexts)
  if (nodeType === "table") {
    for (const row of block.content) {
      if (row.nodeType === "table-row") {
        const cellTexts: string[] = [];
        for (const cell of (row as RichTextBlock).content) {
          const cellSegs = processBlock(cell as RichTextBlock, parentCtx);
          cellTexts.push(cellSegs.map((s) => s.text).join(""));
        }
        segments.push({
          text: cellTexts.join("\t"),
          bold: false,
          italic: false,
          underline: false,
          code: false,
          headingLevel: 0,
          listType: null,
          listIndent: 0,
          hyperlink: null,
        });
      }
    }
    return segments;
  }

  if (nodeType === "table-cell" || nodeType === "table-header-cell") {
    for (const child of block.content) {
      segments.push(...processBlock(child as RichTextBlock, parentCtx));
    }
    return segments;
  }

  // Fallback: try to collect text from any unknown block
  segments.push(...collectSegmentsFromBlock(block, parentCtx));
  return segments;
}

function mergeAdjacentSegments(segments: RichTextSegment[]): RichTextSegment[] {
  if (segments.length === 0) return segments;
  const merged: RichTextSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];
    if (
      prev.bold === curr.bold &&
      prev.italic === curr.italic &&
      prev.underline === curr.underline &&
      prev.code === curr.code &&
      prev.headingLevel === curr.headingLevel &&
      prev.listType === curr.listType &&
      prev.listIndent === curr.listIndent &&
      prev.hyperlink === curr.hyperlink
    ) {
      prev.text += curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

function processTableToRows(tableBlock: RichTextBlock): RichTextTableRow[] {
  const rows: RichTextTableRow[] = [];
  for (const row of tableBlock.content) {
    if (row.nodeType !== "table-row") continue;
    const cells: RichTextSegment[][] = [];
    let isHeader = false;
    for (const cell of (row as RichTextBlock).content) {
      if (cell.nodeType === "table-header-cell") isHeader = true;
      const cellSegments: RichTextSegment[] = [];
      for (const child of (cell as RichTextBlock).content) {
        cellSegments.push(
          ...processBlock(child as RichTextBlock, DEFAULT_CONTEXT),
        );
      }
      cells.push(mergeAdjacentSegments(cellSegments));
    }
    rows.push({ cells, isHeader });
  }
  return rows;
}

/**
 * Converts a Contentful Rich Text Document AST into a flat render plan
 * consisting of text blocks, images, horizontal rules, and tables.
 */
export function documentToRenderPlan(
  doc: RichTextDocument,
): RichTextRenderPlan {
  const blocks: RichTextRenderBlock[] = [];

  for (const topBlock of doc.content) {
    // Tables: structured block
    if (topBlock.nodeType === "table") {
      const rows = processTableToRows(topBlock);
      if (rows.length > 0) {
        blocks.push({ type: "table", rows });
      }
      continue;
    }

    // Embedded asset
    if (topBlock.nodeType === "embedded-asset-block") {
      const target = topBlock.data?.target as {
        fields?: {
          file?: Record<string, { url?: string }> | { url?: string };
          title?: Record<string, string> | string;
        };
      };
      const file =
        (target?.fields?.file as Record<string, { url?: string }>)?.["en-US"] ||
        (target?.fields?.file as { url?: string });
      const url = file?.url ? `https:${file.url}` : null;
      const title =
        (typeof target?.fields?.title === "object"
          ? (target?.fields?.title as Record<string, string>)?.["en-US"]
          : target?.fields?.title) || "image";
      if (url) {
        blocks.push({ type: "image", url, title: String(title) });
      }
      continue;
    }

    // Embedded entry: placeholder text
    if (topBlock.nodeType === "embedded-entry-block") {
      const target = topBlock.data?.target as {
        fields?: { title?: Record<string, string> | string };
        sys?: { id?: string };
      };
      const title =
        (typeof target?.fields?.title === "object"
          ? target?.fields?.title?.["en-US"]
          : target?.fields?.title) ||
        target?.sys?.id ||
        "entry";
      blocks.push({
        type: "text",
        segments: [
          {
            text: `[Embedded: ${title}]`,
            bold: false,
            italic: true,
            underline: false,
            code: false,
            headingLevel: 0,
            listType: null,
            listIndent: 0,
            hyperlink: null,
          },
        ],
      });
      continue;
    }

    // Horizontal rule
    if (topBlock.nodeType === "hr") {
      blocks.push({ type: "hr" });
      continue;
    }

    // Regular text-bearing block
    const segments = processBlock(topBlock, DEFAULT_CONTEXT);
    if (segments.length > 0) {
      blocks.push({
        type: "text",
        segments: mergeAdjacentSegments(segments),
      });
    }
  }

  return { blocks };
}

/**
 * Converts a Contentful Rich Text Document to a plain text string.
 */
export function richTextToPlainString(doc: RichTextDocument): string {
  if (!doc || !doc.content) return "";

  const lines: string[] = [];

  for (const block of doc.content) {
    if (block.nodeType === "hr") {
      lines.push("---");
      continue;
    }
    if (block.nodeType === "embedded-asset-block") {
      const target = block.data?.target as {
        fields?: { title?: Record<string, string> | string };
      };
      const title =
        (typeof target?.fields?.title === "object"
          ? target?.fields?.title?.["en-US"]
          : target?.fields?.title) || "[image]";
      lines.push(`[${title}]`);
      continue;
    }
    if (block.nodeType === "embedded-entry-block") {
      const target = block.data?.target as {
        fields?: { title?: Record<string, string> | string };
        sys?: { id?: string };
      };
      const title =
        (typeof target?.fields?.title === "object"
          ? target?.fields?.title?.["en-US"]
          : target?.fields?.title) ||
        target?.sys?.id ||
        "entry";
      lines.push(`[Embedded: ${title}]`);
      continue;
    }

    const segments = processBlock(block, DEFAULT_CONTEXT);
    const lineText = segments.map((s) => s.text).join("");
    if (lineText) {
      lines.push(lineText);
    }
  }

  return lines.join("\n");
}
