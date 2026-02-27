/**
 * Gmail body format helpers.
 *
 * sanitizeEmailHtml — strips dangerous HTML from email bodies while preserving
 * visual structure (layout, inline styles, tables, images) needed for correct
 * rendering. Used for --format=sane-html.
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize an HTML email body for safe rendering/storage.
 *
 * What is stripped:
 *   - <script>, <iframe>, <object>, <embed>, <form>, <input>, <button>
 *   - All event handler attributes (onclick, onload, onerror, …)
 *   - javascript: and data: URIs in href/src
 *   - <meta> and <link> tags (no external resource loading)
 *
 * What is kept:
 *   - All structural and formatting tags (div, p, table, span, …)
 *   - style attributes (needed for email layout — not executable)
 *   - class, id, align, width, height, bgcolor (common email layout attrs)
 *   - <a href> with http/https/mailto schemes only
 *   - <img src> with http/https/cid schemes (cid: for inline attachments)
 *   - Tables with colspan/rowspan/border/cellpadding
 *   - Legacy <font> and <center> tags (common in older email templates)
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      // Document skeleton (sanitize-html strips html/head/body content but keeps children)
      'html', 'head', 'body',
      // Sectioning
      'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Text blocks
      'p', 'pre', 'blockquote', 'code', 'kbd', 'samp',
      // Inline text
      'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
      'abbr', 'cite', 'q', 'time', 'var',
      // Line / separator
      'br', 'hr', 'wbr',
      // Links & media
      'a', 'img',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Tables (essential for most HTML email layouts)
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
      // Figures
      'figure', 'figcaption',
      // Legacy email tags
      'center', 'font',
      // Title (harmless, sometimes in email <head>)
      'title',
    ],

    allowedAttributes: {
      // Layout and style attributes accepted on any tag
      '*': ['style', 'class', 'id', 'dir', 'lang',
            'align', 'valign', 'width', 'height',
            'bgcolor', 'color', 'border'],

      // Links: only safe schemes; open in new tab is fine, rel=noopener is added below
      'a': ['href', 'title', 'target', 'rel', 'name'],

      // Images: src controlled via allowedSchemesByTag
      'img': ['src', 'alt', 'title', 'width', 'height', 'border'],

      // Table layout attributes
      'table': ['cellpadding', 'cellspacing', 'summary', 'rules', 'frame'],
      'td': ['colspan', 'rowspan', 'headers', 'abbr', 'scope'],
      'th': ['colspan', 'rowspan', 'headers', 'abbr', 'scope'],
      'col': ['span'],
      'colgroup': ['span'],

      // Legacy font tag
      'font': ['face', 'size', 'color'],
    },

    // Allow http/https/mailto everywhere; data:/javascript: are implicitly denied
    allowedSchemes: ['http', 'https', 'mailto'],

    allowedSchemesByTag: {
      // cid: is used for inline (embedded) email attachments — safe, no network request
      img: ['http', 'https', 'cid'],
    },

    // Safely rewrite <a target="_blank"> to also include rel="noopener noreferrer"
    transformTags: {
      a: (tagName, attribs) => {
        const rel = attribs.target === '_blank'
          ? 'noopener noreferrer'
          : (attribs.rel ?? '');
        return { tagName, attribs: { ...attribs, ...(rel ? { rel } : {}) } };
      },
    },
  });
}
