// ── Contentful Rich Text AST types (mirrors Contentful's structure without npm dep) ──

export interface RichTextDocument {
  nodeType: "document";
  data: Record<string, unknown>;
  content: RichTextBlock[];
}

export interface RichTextBlock {
  nodeType: string;
  data: Record<string, unknown>;
  content: (RichTextBlock | RichTextInline | RichTextText)[];
}

export interface RichTextInline {
  nodeType: string;
  data: Record<string, unknown>;
  content: RichTextText[];
}

export interface RichTextText {
  nodeType: "text";
  value: string;
  marks: { type: string }[];
  data: Record<string, unknown>;
}

// ── Flat representation for Figma rendering ──

export interface RichTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  headingLevel: number; // 0 = not a heading, 1-6
  listType: "unordered" | "ordered" | null;
  listIndent: number; // nesting depth
  hyperlink: string | null;
}

export interface RichTextTableRow {
  cells: RichTextSegment[][];
  isHeader: boolean;
}

export type RichTextRenderBlock =
  | { type: "text"; segments: RichTextSegment[] }
  | { type: "image"; url: string; title: string }
  | { type: "hr" }
  | { type: "table"; rows: RichTextTableRow[] };

export interface RichTextRenderPlan {
  blocks: RichTextRenderBlock[];
}
