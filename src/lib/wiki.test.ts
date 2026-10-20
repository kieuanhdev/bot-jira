import { describe, expect, it } from "vitest";
import { wikiToHtml } from "./wiki";

describe("wikiToHtml images", () => {
  it("resolves an attachment image through the proxy", () => {
    const html = wikiToHtml("!image-2026-10-01.png|thumbnail!", { issueKey: "ABC-12" });
    expect(html).toContain(
      'src="/api/jira/attachment?key=ABC-12&amp;name=image-2026-10-01.png"'
    );
    expect(html).toContain('width="200"');
  });

  it("keeps explicit width and encodes special filenames", () => {
    const html = wikiToHtml("see !a & b.jpg|width=640,height=480! here", { issueKey: "ABC-1" });
    expect(html).toContain("name=a%20%26%20b.jpg");
    expect(html).toContain('width="640"');
    expect(html).toMatch(/^<p>see <a /);
    expect(html).toContain("</a> here</p>");
  });

  it("renders external image urls directly", () => {
    const html = wikiToHtml("!https://example.com/x.png!");
    expect(html).toContain('<img src="https://example.com/x.png"');
  });

  it("does not turn exclamation prose into images", () => {
    expect(wikiToHtml("Done! Next step!")).toBe("<p>Done! Next step!</p>");
    expect(wikiToHtml("Wow!great!")).toBe("<p>Wow!great!</p>");
  });

  it("falls back to the filename when no issue key is given", () => {
    expect(wikiToHtml("!shot.png!")).toBe("<p><code>shot.png</code></p>");
  });

  it("escapes markup in the alt text", () => {
    const html = wikiToHtml('!"><script>.png!', { issueKey: "ABC-1" });
    expect(html.replace(/alt="[^"]*"/g, "")).not.toContain("<script");
    expect(html).toContain('alt="&quot;');
  });

  it("handles the markup Jira generates for pasted screenshots", () => {
    const md = '!image-20261009-134921.png|width=1011,height=466,alt="image-20261009-134921.png"!';
    const html = wikiToHtml(`Lỗi như hình:\n${md}`, { issueKey: "ECM-512" });
    expect(html).toContain("name=image-20261009-134921.png");
    expect(html).toContain('width="1011"');
    expect(html).not.toContain("!image");
  });
});

describe("wikiToHtml sanitization and links", () => {
  it("strips javascript: URLs from wiki links", () => {
    const html = wikiToHtml("[x|javascript:alert(1)]");
    expect(html).not.toContain("javascript:");
  });

  it("strips raw script tags", () => {
    const html = wikiToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
  });

  it("strips onerror attributes from raw img tags", () => {
    const html = wikiToHtml("<img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it("preserves target=_blank and rel on external links", () => {
    const html = wikiToHtml("[example|https://example.com]");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com"');
  });
});
