import { invoke } from "@tauri-apps/api/core";

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickVaultDirectory(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return invoke<string | null>("pick_vault_directory");
}

export async function openVaultFolder(path: string): Promise<void> {
  if (!isDesktopApp()) return;
  await invoke("open_vault_folder", { path });
}
