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
const ROUTE_STATE_KEY = "__hilum";

type RouteState = { __hilum?: { from: string } };

function routePath(value: string): string {
  return value.split(/[?#]/, 1)[0] || "/";
}

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
  const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const state: RouteState = { [ROUTE_STATE_KEY]: { from } };
  if (options.replace) window.history.replaceState(state, "", to);
  else window.history.pushState(state, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function previousRoute(): string | null {
  const state = window.history.state as RouteState | null;
  return state?.[ROUTE_STATE_KEY]?.from ?? null;
}

export function goBack(fallback: string): void {
  if (previousRoute()) window.history.back();
  else navigate(fallback);
}

export function hasContextBack(): boolean {
  return hasContextBackFrom(previousRoute());
}

export function hasContextBackFrom(previous: string | null): boolean {
  if (!previous) return false;
  return routePath(previous) !== "/library" && routePath(previous) !== "/";
}

export function hrefFor(to: string): string {
  return to.startsWith("/") ? to : `/${to}`;
}

export function graphHref(course: string, concept?: string): string {
  const params = new URLSearchParams({ course });
  if (concept) params.set("concept", concept);
  return `/library/graph?${params.toString()}`;
}

export function questionsHref(course: string, question?: string): string {
  const params = new URLSearchParams({ course });
  if (question) params.set("q", question);
  return `/library/questions?${params.toString()}`;
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
