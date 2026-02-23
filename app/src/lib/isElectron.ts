/** Returns true when running inside the Electron renderer process. */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}
