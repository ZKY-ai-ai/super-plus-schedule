import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../components/ai/MarkdownMessage";

function render(content: string): string {
  return renderToStaticMarkup(createElement(MarkdownMessage, { content }));
}

describe("MarkdownMessage", () => {
  it("renders GFM tables, headings and lists", () => {
    const html = render(
      [
        "## 本次导入",
        "",
        "| 课程 | 周次 |",
        "| --- | ---: |",
        "| **微积分II（上）** | 2-16 |",
        "",
        "- 周一 1-2 节",
        "- 周三 1-2 节",
      ].join("\n"),
    );
    expect(html).toContain("<h2>本次导入</h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<strong>微积分II（上）</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>周一 1-2 节</li>");
  });

  it("renders fenced code, inline code and safe links", () => {
    const html = render(
      [
        "运行 `pnpm test`：",
        "",
        "```ts",
        "const week = 8;",
        "```",
        "",
        "[文档](https://example.com/docs)",
      ].join("\n"),
    );
    expect(html).toContain("<pre>");
    expect(html).toContain("const week = 8;");
    expect(html).toContain("<code>pnpm test</code>");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("drops unsafe links and raw HTML", () => {
    const html = render("[点我](javascript:alert(1))\n\n<script>alert(1)</script>");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).not.toContain("<script>");
  });

  it("keeps single line breaks readable", () => {
    const html = render("第一行\n第二行");
    expect(html).toContain("<br/>");
    expect(html).toContain("第二行");
  });
});