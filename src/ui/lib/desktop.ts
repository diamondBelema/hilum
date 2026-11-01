import { invoke } from "@tauri-apps/api/core";

export const desktopServerOrigin = "http://127.0.0.1:4747";

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function apiUrl(path: string): string {
  return isDesktopApp() ? `${desktopServerOrigin}${path}` : path;
}

export async function pickVaultDirectory(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return invoke<string | null>("pick_vault_directory");
}

export async function openVaultFolder(path: string): Promise<void> {
  if (!isDesktopApp()) return;
  await invoke("open_vault_folder", { path });
}
