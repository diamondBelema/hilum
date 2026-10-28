import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slug } from "./lib/markdown.ts";

type Props = {
  body: string;
  notePath: string;
  onOpenNote: (path: string, anchor?: string) => void;
  onZoomImage?: (src: string, alt: string) => void;
};


type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        const children = node.children ?? [];
        const text = children
          .filter((child) => child.type === "text")
          .map((child) => child.value ?? "")
          .join("");
        const match = /\s*\{#([\w-]+)\}\s*$/.exec(text);
        if (match) {
          for (let index = children.length - 1; index >= 0; index -= 1) {
            const child = children[index];
            if (child.type !== "text") continue;
            child.value = (child.value ?? "").replace(/\s*\{#([\w-]+)\}\s*$/, "");
            break;
          }
        }
        const id = match?.[1] ?? slug(text.replace(/\s*\{#[\w-]+\}\s*$/, ""));
        if (id) node.properties = { ...node.properties, id };
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}

function encodeDestinations(body: string): string {
  let out = "";
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf("](", cursor);
    if (open === -1) {
      out += body.slice(cursor);
      break;
    }
    let depth = 1;
    let end = open + 2;
    for (; end < body.length; end += 1) {
      const char = body[end];
      if (char === "\\") {
        end += 1;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      } else if (char === "\n") break;
    }
    if (depth !== 0 || end >= body.length) {
      out += body.slice(cursor);
      break;
    }
    const dest = body.slice(open + 2, end);
    const value = dest.trim();
    out += body.slice(cursor, open + 2);
    out += value.startsWith("<") ? dest : value.replaceAll(" ", "%20");
    out += ")";
    cursor = end + 1;
  }
  return out;
}

function resolveImageSrc(src: string, notePath: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("/")) {
    return src;
  }
  let clean = src;
  try {
    clean = decodeURIComponent(src);
  } catch {
    clean = src;
  }
  const parts = notePath.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return `/api/asset?path=${encodeURIComponent(parts.join("/"))}`;
}

export function Markdown({ body, notePath, onZoomImage }: Props) {
  return (
    <div className="markdown leading-[inherit]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHeadingIds]}
        components={{
          img: ({ src, alt }) => {
            if (!src) return null;
            const resolved = resolveImageSrc(src, notePath);
            const label = alt ?? "";
            return (
              <img
                src={resolved}
                alt={label}
                loading="lazy"
                className={onZoomImage ? "cursor-zoom-in rounded-md" : "rounded-md"}
                onClick={onZoomImage ? () => onZoomImage(resolved, label) : undefined}
              />
            );
          },
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;
            if (href.startsWith("#")) return <a href={href}>{children}</a>;
            if (/^https?:/i.test(href)) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            return <a href={href}>{children}</a>;
          },
        }}
      >
        {encodeDestinations(body)}
      </ReactMarkdown>
    </div>
  );
}
