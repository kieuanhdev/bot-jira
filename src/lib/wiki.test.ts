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
    expect(html).not.toContain("<script>");
  });
});
