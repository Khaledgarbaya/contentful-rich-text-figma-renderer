import type { RichTextRenderBlock, RichTextSegment } from "./types.js";

/** Scale factors for heading levels relative to the base font size. */
export const HEADING_SCALE: Record<number, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.25,
  4: 1.1,
  5: 1.0,
  6: 0.9,
};

/** Resolved font variants for bold, italic, and bold-italic. */
export interface FontVariants {
  base: FontName;
  bold: FontName;
  italic: FontName;
  boldItalic: FontName;
}

async function loadFontVariant(
  figmaApi: PluginAPI,
  family: string,
  style: string,
): Promise<FontName | null> {
  const fontName: FontName = { family, style };
  try {
    await figmaApi.loadFontAsync(fontName);
    return fontName;
  } catch {
    return null;
  }
}

/**
 * Loads bold, italic, and bold-italic variants for the given base font.
 * Falls back to the base font if a variant is unavailable.
 */
export async function resolveFontVariants(
  figmaApi: PluginAPI,
  baseFont: FontName,
): Promise<FontVariants> {
  const family = baseFont.family;
  const results = await Promise.allSettled([
    loadFontVariant(figmaApi, family, "Bold"),
    loadFontVariant(figmaApi, family, "Italic"),
    loadFontVariant(figmaApi, family, "Bold Italic"),
  ]);

  return {
    base: baseFont,
    bold: (results[0].status === "fulfilled" && results[0].value) || baseFont,
    italic: (results[1].status === "fulfilled" && results[1].value) || baseFont,
    boldItalic:
      (results[2].status === "fulfilled" && results[2].value) || baseFont,
  };
}

/** Returns the appropriate font variant for a given text segment. */
export function getFontForSegment(
  seg: RichTextSegment,
  variants: FontVariants,
): FontName {
  if (seg.bold && seg.italic) return variants.boldItalic;
  if (seg.bold) return variants.bold;
  if (seg.italic) return variants.italic;
  return variants.base;
}

/**
 * Applies rich text formatting to a single Figma TextNode.
 * Handles bold, italic, underline, code, headings, lists, and hyperlinks.
 */
export async function applyTextBlocksToNode(
  figmaApi: PluginAPI,
  node: TextNode,
  textBlocks: RichTextRenderBlock[],
): Promise<void> {
  // Get base font from existing node
  let baseFont: FontName;
  if (typeof node.fontName === "symbol") {
    baseFont = node.getRangeFontName(0, 1) as FontName;
  } else {
    baseFont = node.fontName as FontName;
  }

  const baseFontSize =
    typeof node.fontSize === "symbol"
      ? (node.getRangeFontSize(0, 1) as number)
      : (node.fontSize as number);

  // Collect all text segments across blocks
  const allSegments: RichTextSegment[] = [];
  for (const block of textBlocks) {
    if (block.type === "text") {
      allSegments.push(...block.segments);
      allSegments.push({
        text: "\n",
        bold: false,
        italic: false,
        underline: false,
        code: false,
        headingLevel: 0,
        listType: null,
        listIndent: 0,
        hyperlink: null,
      });
    } else if (block.type === "hr") {
      allSegments.push({
        text: "───────────────\n",
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

  // Remove trailing newline
  if (
    allSegments.length > 0 &&
    allSegments[allSegments.length - 1].text === "\n"
  ) {
    allSegments.pop();
  }

  if (allSegments.length === 0) return;

  // Build full text string with list prefixes
  let fullText = "";
  let orderedCounter = 0;
  for (const seg of allSegments) {
    if (seg.listType && seg.text !== "\n") {
      const indent = "  ".repeat(Math.max(0, seg.listIndent - 1));
      if (seg.listType === "unordered") {
        fullText += `${indent}\u2022 `;
        orderedCounter = 0;
      } else {
        orderedCounter++;
        fullText += `${indent}${orderedCounter}. `;
      }
    } else if (!seg.listType) {
      orderedCounter = 0;
    }
    fullText += seg.text;
  }

  // Load font variants
  const variants = await resolveFontVariants(figmaApi, baseFont);

  // Load monospace font for code
  let monoFont: FontName | null = null;
  const hasCode = allSegments.some((s) => s.code);
  if (hasCode) {
    monoFont = await loadFontVariant(figmaApi, "Roboto Mono", "Regular");
    if (!monoFont)
      monoFont = await loadFontVariant(figmaApi, "Courier New", "Regular");
  }

  // Set the full text
  const { name } = node;
  node.characters = fullText;
  if (node.name === node.characters) {
    node.name = name;
  }

  // Apply range-based formatting
  let offset = 0;
  orderedCounter = 0;
  for (const seg of allSegments) {
    let prefixLen = 0;
    if (seg.listType && seg.text !== "\n") {
      const indent = "  ".repeat(Math.max(0, seg.listIndent - 1));
      if (seg.listType === "unordered") {
        prefixLen = indent.length + 2; // "• "
        orderedCounter = 0;
      } else {
        orderedCounter++;
        prefixLen = indent.length + `${orderedCounter}. `.length;
      }
    } else if (!seg.listType) {
      orderedCounter = 0;
    }

    const segStart = offset + prefixLen;
    const segEnd = segStart + seg.text.length;

    if (seg.text.length > 0 && segEnd <= fullText.length) {
      try {
        const font =
          seg.code && monoFont ? monoFont : getFontForSegment(seg, variants);
        node.setRangeFontName(segStart, segEnd, font);
      } catch (e) {
        console.warn("Failed to set font for range:", e);
      }

      if (seg.headingLevel > 0) {
        const scale = HEADING_SCALE[seg.headingLevel] || 1.0;
        try {
          node.setRangeFontSize(
            segStart,
            segEnd,
            Math.round(baseFontSize * scale),
          );
        } catch (e) {
          console.warn("Failed to set heading size:", e);
        }
      }

      if (seg.underline) {
        try {
          node.setRangeTextDecoration(segStart, segEnd, "UNDERLINE");
        } catch (e) {
          console.warn("Failed to set underline:", e);
        }
      }

      if (seg.hyperlink) {
        try {
          node.setRangeHyperlink(segStart, segEnd, {
            type: "URL",
            value: seg.hyperlink,
          });
          node.setRangeFills(segStart, segEnd, [
            { type: "SOLID", color: { r: 0.1, g: 0.4, b: 0.9 } },
          ]);
        } catch (e) {
          console.warn("Failed to set hyperlink:", e);
        }
      }
    }

    offset = segEnd;
  }
}

/**
 * Replaces a TextNode with a rich-text layout frame containing
 * formatted text, images, and tables.
 */
export async function applyMixedContentPlan(
  figmaApi: PluginAPI,
  node: TextNode,
  blocks: RichTextRenderBlock[],
  parent: BaseNode & ChildrenMixin,
): Promise<void> {
  const frame = figmaApi.createFrame();
  frame.name = node.name + " [Rich Text]";
  frame.x = node.x;
  frame.y = node.y;
  frame.resize(node.width, node.height);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 8;
  frame.fills = [];

  let baseFont: FontName;
  if (typeof node.fontName === "symbol") {
    baseFont = node.getRangeFontName(0, 1) as FontName;
  } else {
    baseFont = node.fontName as FontName;
  }
  const baseFontSize =
    typeof node.fontSize === "symbol"
      ? (node.getRangeFontSize(0, 1) as number)
      : (node.fontSize as number);

  for (const block of blocks) {
    if (block.type === "text" || block.type === "hr") {
      const textNode = figmaApi.createText();
      await figmaApi.loadFontAsync(baseFont);
      textNode.fontName = baseFont;
      textNode.fontSize = baseFontSize;
      textNode.layoutAlign = "STRETCH";
      textNode.textAutoResize = "HEIGHT";

      await applyTextBlocksToNode(figmaApi, textNode, [block]);
      frame.appendChild(textNode);
    } else if (block.type === "image") {
      const rect = figmaApi.createRectangle();
      rect.name = block.title || "Embedded Image";
      rect.resize(node.width, Math.round(node.width * 0.6));
      rect.layoutAlign = "STRETCH";

      try {
        const image = await (
          figmaApi as PluginAPI & {
            createImageAsync(url: string): Promise<Image>;
          }
        ).createImageAsync(block.url);
        rect.fills = [
          {
            type: "IMAGE",
            imageHash: image.hash,
            scaleMode: "FIT",
          },
        ];
      } catch (e) {
        console.warn("Failed to load embedded image:", e);
        rect.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
      }
      frame.appendChild(rect);
    } else if (block.type === "table") {
      const tableFrame = figmaApi.createFrame();
      tableFrame.name = "Table";
      tableFrame.layoutMode = "VERTICAL";
      tableFrame.primaryAxisSizingMode = "AUTO";
      tableFrame.counterAxisSizingMode = "FIXED";
      tableFrame.layoutAlign = "STRETCH";
      tableFrame.itemSpacing = 0;
      tableFrame.fills = [];

      for (const row of block.rows) {
        const rowFrame = figmaApi.createFrame();
        rowFrame.name = row.isHeader ? "Header Row" : "Row";
        rowFrame.layoutMode = "HORIZONTAL";
        rowFrame.primaryAxisSizingMode = "FIXED";
        rowFrame.counterAxisSizingMode = "AUTO";
        rowFrame.layoutAlign = "STRETCH";
        rowFrame.itemSpacing = 0;
        rowFrame.paddingTop = 4;
        rowFrame.paddingBottom = 4;
        rowFrame.fills = row.isHeader
          ? [{ type: "SOLID", color: { r: 0.93, g: 0.93, b: 0.93 } }]
          : [];
        rowFrame.strokes = [
          { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } },
        ];
        rowFrame.strokeWeight = 1;
        rowFrame.strokeAlign = "INSIDE";

        for (const cellSegments of row.cells) {
          const cellText = figmaApi.createText();
          await figmaApi.loadFontAsync(baseFont);
          cellText.fontName = baseFont;
          cellText.fontSize = row.isHeader ? baseFontSize : baseFontSize * 0.9;
          cellText.layoutAlign = "STRETCH";
          cellText.layoutGrow = 1;
          cellText.textAutoResize = "HEIGHT";
          (cellText as TextNode & { paddingLeft: number }).paddingLeft = 4;
          (cellText as TextNode & { paddingRight: number }).paddingRight = 4;

          const plainText = cellSegments.map((s) => s.text).join("");
          cellText.characters = plainText || " ";

          if (row.isHeader) {
            await figmaApi
              .loadFontAsync({ family: baseFont.family, style: "Bold" })
              .catch(() => {});
            try {
              cellText.setRangeFontName(0, cellText.characters.length, {
                family: baseFont.family,
                style: "Bold",
              });
            } catch {
              // Bold variant may not be available
            }
          }

          rowFrame.appendChild(cellText);
        }
        tableFrame.appendChild(rowFrame);
      }
      frame.appendChild(tableFrame);
    }
  }

  parent.appendChild(frame);
  const nodeIndex = parent.children.indexOf(node);
  if (nodeIndex >= 0) {
    parent.insertChild(nodeIndex, frame);
  }
  node.remove();
}
