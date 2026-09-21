/**
 * Minimal Jira "wiki markup" → safe HTML.
 *
 * Jira Cloud/DC descriptions use a small wiki dialect (h1.–h6., *bold*,
 * //italic//, {{code}}, {{code-block}}, ----, # bullets, 1. numbered,
 * {color:..}text, {code}.., [text|url], and {panel}..). This converts the
 * common subset to HTML and escapes everything else so no raw user text is
 * emitted as markup. It is intentionally dependency-free.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline conversions applied to an already-escaped text chunk.
function inline(s: string): string {
  return s
    // [text|url] and [url] links
    .replace(
      /\[([^\]\[]+)\|([^\]\[]+)\]/g,
      (_m, text, url) =>
        /^https?:\/\//i.test(url)
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : text
    )
    .replace(
      /\[((?:https?:\/\/)[^\]\[]+)\]/g,
      (_m, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    )
    // {color:#hex}text{color}
    .replace(
      /\{color:([^}]+)\}([\s\S]*?)\{color\}/g,
      (_m, color, inner) =>
        `<span style="color:${/^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#333"}">${inner}</span>`
    )
    // *bold* (word-ish)
    .replace(/(^|[^*])\*([^\*\n]+?)\*(?!\*)/g, "$1<strong>$2</strong>")
    // //italic//
    .replace(/(^|[^\/\n])\/\/([^\/\n]+?)\/\/(?![\/])/g, "$1<em>$2</em>")
    // {{code}} inline
    .replace(/\{\{([^{}]+?)\}\}/g, "<code>$1</code>")
    // {code}inline{code}
    .replace(/\{code\}([^{}]+?)\{code\}/g, "<code>$1</code>")
    // strikethrough ~~text~~
    .replace(/~~([^~]+?)~~/g, "<del>$1</del>");
}

export function wikiToHtml(input: string): string {
  if (!input || !input.trim()) return "";
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCodeBlock = false;
  let code: string[] = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    // Code block toggle: a line that is just {{ opens, }} closes.
    if (/^\{\{\s*$/.test(rawLine.trim())) {
      closeList();
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = [];
      }
      continue;
    }
    if (inCodeBlock) {
      code.push(rawLine);
      continue;
    }

    const line = rawLine;
    const t = line.trim();

    if (!t) {
      closeList();
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(t)) {
      closeList();
      out.push("<hr/>");
      continue;
    }

    // Headings h1.–h6.
    const h = t.match(/^(h[1-6])\.\s*(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1][1];
      out.push(`<h${lvl}>${inline(esc(h[2]))}</h${lvl}>`);
      continue;
    }

    // Bullet list:  * item   (Jira also uses # and ** for nested levels)
    const bullet = line.match(/^\s*[*#]{1,2}\s+(.*)$/);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(esc(bullet[1]))}</li>`);
      continue;
    }

    // Numbered list:  1. item
    const num = line.match(/^\s*\d+\.\s+(.*)$/);
    if (num) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(esc(num[1]))}</li>`);
      continue;
    }

    // Plain paragraph
    closeList();
    out.push(`<p>${inline(esc(line))}</p>`);
  }

  if (inCodeBlock && code.length) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  closeList();

  return out.join("\n");
}
