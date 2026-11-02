const DANGEROUS_ELEMENTS = new Set([
  "script",
  "object",
  "embed",
  "iframe",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "applet",
  "audio",
  "video",
  "canvas",
  "math",
]);

const DANGEROUS_ATTRIBUTES = new Set([
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onmouseout",
  "onmousedown",
  "onmouseup",
  "onmousemove",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onfocus",
  "onblur",
  "onsubmit",
  "onreset",
  "onabort",
  "onchange",
  "oncontextmenu",
  "ondblclick",
  "onfocusin",
  "onfocusout",
  "onpointerover",
  "onpointerout",
  "onpointerdown",
  "onpointerup",
  "onpointermove",
  "onpointerenter",
  "onpointerleave",
  "onwheel",
  "onscroll",
  "onresize",
]);

const DANGEROUS_URL_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];

/**
 * Sanitize SVG markup to prevent XSS. Removes dangerous elements and attributes,
 * and strips dangerous URL schemes from href/src attributes.
 * Returns a safe SVG string suitable for inline rendering.
 */
export function sanitizeSvg(svg: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) return "";

    const root = doc.documentElement;
    if (!root || root.tagName !== "svg") return "";

    // Remove dangerous elements
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (node instanceof Element && DANGEROUS_ELEMENTS.has(node.tagName.toLowerCase())) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const toRemove: Element[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node instanceof Element) toRemove.push(node);
    }
    for (const el of toRemove) el.remove();

    // Remove dangerous attributes
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      const attrs = el.attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        const attr = attrs[i];
        const name = attr.name.toLowerCase();
        if (DANGEROUS_ATTRIBUTES.has(name)) {
          el.removeAttribute(attr.name);
        }
        // Strip dangerous URL schemes from href, src, xlink:href
        if ((name === "href" || name === "src" || name === "xlink:href")) {
          const value = attr.value;
          if (DANGEROUS_URL_SCHEMES.some((scheme) => value.toLowerCase().startsWith(scheme))) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }

    return root.outerHTML;
  } catch {
    return "";
  }
}
