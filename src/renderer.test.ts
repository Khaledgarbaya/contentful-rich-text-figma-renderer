import { describe, it, expect } from "vitest";
import { documentToRenderPlan, richTextToPlainString } from "./renderer.js";
import type { RichTextDocument } from "./types.js";

function makeDoc(content: RichTextDocument["content"]): RichTextDocument {
  return { nodeType: "document", data: {}, content };
}

function textNode(value: string, marks: { type: string }[] = []) {
  return { nodeType: "text" as const, value, marks, data: {} };
}

function paragraph(...texts: ReturnType<typeof textNode>[]) {
  return { nodeType: "paragraph", data: {}, content: texts };
}

describe("documentToRenderPlan", () => {
  it("converts a simple paragraph", () => {
    const doc = makeDoc([paragraph(textNode("Hello world"))]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]).toEqual({
      type: "text",
      segments: [
        {
          text: "Hello world",
          bold: false,
          italic: false,
          underline: false,
          code: false,
          headingLevel: 0,
          listType: null,
          listIndent: 0,
          hyperlink: null,
        },
      ],
    });
  });

  it("preserves bold and italic marks", () => {
    const doc = makeDoc([
      paragraph(
        textNode("normal "),
        textNode("bold", [{ type: "bold" }]),
        textNode(" "),
        textNode("italic", [{ type: "italic" }]),
        textNode(" "),
        textNode("both", [{ type: "bold" }, { type: "italic" }]),
      ),
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    expect(segments).toHaveLength(6);
    expect(segments[0]).toMatchObject({
      text: "normal ",
      bold: false,
      italic: false,
    });
    expect(segments[1]).toMatchObject({
      text: "bold",
      bold: true,
      italic: false,
    });
    expect(segments[2]).toMatchObject({
      text: " ",
      bold: false,
      italic: false,
    });
    expect(segments[3]).toMatchObject({
      text: "italic",
      bold: false,
      italic: true,
    });
    expect(segments[4]).toMatchObject({
      text: " ",
      bold: false,
      italic: false,
    });
    expect(segments[5]).toMatchObject({
      text: "both",
      bold: true,
      italic: true,
    });
  });

  it("handles headings with correct level", () => {
    const doc = makeDoc([
      { nodeType: "heading-1", data: {}, content: [textNode("Title")] },
      { nodeType: "heading-3", data: {}, content: [textNode("Subtitle")] },
    ]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks).toHaveLength(2);
    expect(
      (plan.blocks[0] as { type: "text"; segments: any[] }).segments[0],
    ).toMatchObject({ text: "Title", headingLevel: 1 });
    expect(
      (plan.blocks[1] as { type: "text"; segments: any[] }).segments[0],
    ).toMatchObject({ text: "Subtitle", headingLevel: 3 });
  });

  it("handles horizontal rules", () => {
    const doc = makeDoc([
      paragraph(textNode("Before")),
      { nodeType: "hr", data: {}, content: [] },
      paragraph(textNode("After")),
    ]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks).toHaveLength(3);
    expect(plan.blocks[1]).toEqual({ type: "hr" });
  });

  it("handles unordered lists", () => {
    const doc = makeDoc([
      {
        nodeType: "unordered-list",
        data: {},
        content: [
          {
            nodeType: "list-item",
            data: {},
            content: [paragraph(textNode("Item 1"))],
          },
          {
            nodeType: "list-item",
            data: {},
            content: [paragraph(textNode("Item 2"))],
          },
        ],
      },
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    // Items with identical formatting get merged by mergeAdjacentSegments
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      text: "Item 1Item 2",
      listType: "unordered",
      listIndent: 1,
    });
  });

  it("handles ordered lists", () => {
    const doc = makeDoc([
      {
        nodeType: "ordered-list",
        data: {},
        content: [
          {
            nodeType: "list-item",
            data: {},
            content: [paragraph(textNode("First"))],
          },
          {
            nodeType: "list-item",
            data: {},
            content: [paragraph(textNode("Second"))],
          },
        ],
      },
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    // Items with identical formatting get merged
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      text: "FirstSecond",
      listType: "ordered",
      listIndent: 1,
    });
  });

  it("handles hyperlinks", () => {
    const doc = makeDoc([
      {
        nodeType: "paragraph",
        data: {},
        content: [
          textNode("Visit "),
          {
            nodeType: "hyperlink",
            data: { uri: "https://example.com" },
            content: [textNode("this link")],
          },
        ],
      },
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    expect(segments[0]).toMatchObject({ text: "Visit ", hyperlink: null });
    expect(segments[1]).toMatchObject({
      text: "this link",
      hyperlink: "https://example.com",
      underline: true,
    });
  });

  it("handles embedded asset blocks", () => {
    const doc = makeDoc([
      {
        nodeType: "embedded-asset-block",
        data: {
          target: {
            fields: {
              file: { url: "//images.ctfassets.net/photo.jpg" },
              title: "My Photo",
            },
          },
        },
        content: [],
      },
    ]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks[0]).toEqual({
      type: "image",
      url: "https://images.ctfassets.net/photo.jpg",
      title: "My Photo",
    });
  });

  it("handles embedded entry blocks as placeholder text", () => {
    const doc = makeDoc([
      {
        nodeType: "embedded-entry-block",
        data: {
          target: {
            fields: { title: "My Entry" },
            sys: { id: "entry-123" },
          },
        },
        content: [],
      },
    ]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks[0]).toMatchObject({
      type: "text",
      segments: [{ text: "[Embedded: My Entry]", italic: true }],
    });
  });

  it("handles tables", () => {
    const doc = makeDoc([
      {
        nodeType: "table",
        data: {},
        content: [
          {
            nodeType: "table-row",
            data: {},
            content: [
              {
                nodeType: "table-header-cell",
                data: {},
                content: [paragraph(textNode("Name"))],
              },
              {
                nodeType: "table-header-cell",
                data: {},
                content: [paragraph(textNode("Age"))],
              },
            ],
          },
          {
            nodeType: "table-row",
            data: {},
            content: [
              {
                nodeType: "table-cell",
                data: {},
                content: [paragraph(textNode("Alice"))],
              },
              {
                nodeType: "table-cell",
                data: {},
                content: [paragraph(textNode("30"))],
              },
            ],
          },
        ],
      },
    ]);
    const plan = documentToRenderPlan(doc);

    expect(plan.blocks[0]).toMatchObject({ type: "table" });
    const table = plan.blocks[0] as { type: "table"; rows: any[] };
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].isHeader).toBe(true);
    expect(table.rows[0].cells[0][0]).toMatchObject({ text: "Name" });
    expect(table.rows[1].isHeader).toBe(false);
    expect(table.rows[1].cells[0][0]).toMatchObject({ text: "Alice" });
  });

  it("merges adjacent segments with same formatting", () => {
    const doc = makeDoc([
      paragraph(textNode("hello"), textNode(" "), textNode("world")),
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    // All three text nodes have identical formatting, so they merge
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("hello world");
  });

  it("returns empty blocks for empty document", () => {
    const doc = makeDoc([]);
    const plan = documentToRenderPlan(doc);
    expect(plan.blocks).toHaveLength(0);
  });

  it("handles blockquotes", () => {
    const doc = makeDoc([
      {
        nodeType: "blockquote",
        data: {},
        content: [paragraph(textNode("Quoted text"))],
      },
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;
    expect(segments[0]).toMatchObject({ text: "Quoted text" });
  });

  it("handles code marks", () => {
    const doc = makeDoc([
      paragraph(
        textNode("Use "),
        textNode("console.log()", [{ type: "code" }]),
      ),
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    expect(segments[0]).toMatchObject({ text: "Use ", code: false });
    expect(segments[1]).toMatchObject({ text: "console.log()", code: true });
  });

  it("handles underline marks", () => {
    const doc = makeDoc([
      paragraph(textNode("underlined", [{ type: "underline" }])),
    ]);
    const plan = documentToRenderPlan(doc);
    const segments = (plan.blocks[0] as { type: "text"; segments: any[] })
      .segments;

    expect(segments[0]).toMatchObject({ text: "underlined", underline: true });
  });
});

describe("richTextToPlainString", () => {
  it("converts paragraphs to plain text", () => {
    const doc = makeDoc([
      paragraph(textNode("Hello")),
      paragraph(textNode("World")),
    ]);
    expect(richTextToPlainString(doc)).toBe("Hello\nWorld");
  });

  it("converts HRs to dashes", () => {
    const doc = makeDoc([
      paragraph(textNode("Before")),
      { nodeType: "hr", data: {}, content: [] },
      paragraph(textNode("After")),
    ]);
    expect(richTextToPlainString(doc)).toBe("Before\n---\nAfter");
  });

  it("handles embedded assets", () => {
    const doc = makeDoc([
      {
        nodeType: "embedded-asset-block",
        data: {
          target: { fields: { title: "Photo" } },
        },
        content: [],
      },
    ]);
    expect(richTextToPlainString(doc)).toBe("[Photo]");
  });

  it("handles embedded entries", () => {
    const doc = makeDoc([
      {
        nodeType: "embedded-entry-block",
        data: {
          target: {
            fields: { title: "Article" },
            sys: { id: "abc" },
          },
        },
        content: [],
      },
    ]);
    expect(richTextToPlainString(doc)).toBe("[Embedded: Article]");
  });

  it("returns empty string for null/undefined doc", () => {
    expect(richTextToPlainString(null as unknown as RichTextDocument)).toBe("");
    expect(
      richTextToPlainString(undefined as unknown as RichTextDocument),
    ).toBe("");
  });

  it("returns empty string for empty document", () => {
    const doc = makeDoc([]);
    expect(richTextToPlainString(doc)).toBe("");
  });

  it("strips formatting from rich text", () => {
    const doc = makeDoc([
      paragraph(
        textNode("normal "),
        textNode("bold", [{ type: "bold" }]),
        textNode(" text"),
      ),
    ]);
    expect(richTextToPlainString(doc)).toBe("normal bold text");
  });
});
