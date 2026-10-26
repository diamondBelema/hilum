import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { assetUrl } from "./api.ts";

type Props = {
  body: string;
  notePath: string;
  onOpenNote: (path: string, anchor?: string) => void;
  onZoomImage?: (src: string, alt: string) => void;
};

const text = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return "";
};

const anchorOf = (children: ReactNode): { label: ReactNode; id?: string } => {
  const flat = text(children);
  const match = /\s*\{#([\w-]+)\}\s*$/.exec(flat);
  if (!match) return { label: children };
  const label = flat.replace(/\s*\{#[\w-]+\}\s*$/, "").trim();
  return { label, id: match[1] };
};

function Heading({
  level,
  children,
}: {
  level: 1 | 2 | 3;
  children: ReactNode;
}) {
  const { label, id } = anchorOf(children);
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const classes =
    level === 1
      ? "mt-8 mb-3 text-xl font-semibold tracking-tight"
      : level === 2
        ? "mt-8 mb-2 text-lg font-semibold"
        : "mt-6 mb-2 text-base font-semibold";

  return (
    <Tag id={id} className={`group flex scroll-mt-20 items-baseline gap-2 ${classes}`}>
      <span>{label}</span>
      {id && (
        <a
          href={`#${id}`}
          aria-label={`Link to section: ${text(label)}`}
          className="text-xs font-normal text-text-muted no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        >
          #
        </a>
      )}
    </Tag>
  );
}

export function Markdown({ body, notePath, onOpenNote, onZoomImage }: Props) {
  return (
    <div className="leading-[inherit]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <Heading level={1}>{children}</Heading>,
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          p: ({ children }) => <p className="my-3 max-w-[68ch]">{children}</p>,
          ul: ({ children }) => <ul className="my-3 ml-5 max-w-[68ch] list-disc space-y-1.5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-3 ml-5 max-w-[68ch] list-decimal space-y-1.5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="my-5 max-w-[68ch] border-l-2 border-border-strong pl-4 text-text-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-8 border-border-subtle" />,
          a: ({ href, children }) => {
            if (href?.startsWith("#") && href.length > 1) {
              const id = href.slice(1);
              return (
                <button
                  type="button"
                  onClick={() => document.getElementById(id)?.scrollIntoView({ block: "start" })}
                  className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                >
                  {children}
                </button>
              );
            }
            if (href && href.split("#")[0]?.endsWith(".md")) {
              const [file, anchor] = href.split("#");
              const target = resolveNote(notePath, file);
              return (
                <button
                  type="button"
                  onClick={() => onOpenNote(target, anchor)}
                  className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                >
                  {children}
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const url = src ? assetUrl(notePath, src) : "";
            return (
              <figure className="my-5 max-w-[68ch]">
                <button
                  type="button"
                  disabled={!onZoomImage}
                  onClick={() => url && onZoomImage?.(url, alt ?? "")}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-panel border border-border-subtle"
                  aria-label={alt ? `Zoom image: ${alt}` : "Zoom image"}
                >
                  <img
                    src={url || undefined}
                    alt={alt ?? ""}
                    loading="lazy"
                    className="max-h-[70vh] w-full object-contain"
                  />
                </button>
                {alt && <figcaption className="mt-2 text-xs text-text-muted">{alt}</figcaption>}
              </figure>
            );
          },
          table: ({ children }) => (
            <div className="my-5 max-w-full overflow-x-auto rounded-panel border border-border-subtle">
              <table className="w-full border-collapse text-xs sm:text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border-subtle bg-surface-2 px-2 py-2 text-left font-semibold sm:px-3">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border-subtle/70 px-2 py-2 align-top sm:px-3">{children}</td>
          ),
          code: ({ className, children }) => {
            const block = className?.startsWith("language-");
            if (block) return <code className={className}>{children}</code>;
            return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-4 max-w-full overflow-x-auto rounded-panel border border-border-subtle bg-surface-2 p-4 font-mono text-sm leading-6">
              {children}
            </pre>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function resolveNote(current: string, href: string): string {
  const clean = href.split("#")[0] ?? href;
  const base = current.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "..") base.pop();
    else if (part !== ".") base.push(part);
  }
  return base.join("/");
}
