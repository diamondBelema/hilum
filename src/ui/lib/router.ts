import { cn } from "./cn.ts";
import {
  createElement,
  useCallback,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

export type Route =
  | { name: "home" }
  | { name: "session"; id: string }
  | { name: "library"; section: string | null }
  | { name: "settings" }
  | { name: "not-found"; path: string };

const NAVIGATE_EVENT = "hilum:navigate";

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { name: "home" };
  if (path === "/settings") return { name: "settings" };

  const session = /^\/sessions\/([^/]+)$/.exec(path);
  if (session?.[1]) return { name: "session", id: decodeURIComponent(session[1]) };

  if (path === "/library") return { name: "library", section: null };
  const library = /^\/library\/([^/]+)$/.exec(path);
  if (library?.[1]) return { name: "library", section: decodeURIComponent(library[1]) };

  return { name: "not-found", path };
}

export function useRoute(): Route {
  const read = useCallback(() => parseRoute(window.location.pathname), []);
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATE_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATE_EVENT, update);
    };
  }, [read]);

  return route;
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (options.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function hrefFor(to: string): string {
  return to.startsWith("/") ? to : `/${to}`;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  children: ReactNode;
};

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    event.preventDefault();
    navigate(to);
  };

  return createElement(
    "a",
    { ...rest, className: cn("no-underline", rest.className), href: hrefFor(to), onClick: handleClick },
    children,
  );
}
