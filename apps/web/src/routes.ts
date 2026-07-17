/**
 * Every internal URL is derived from the Vite base so the same build serves
 * local development at "/" and GitHub Pages under a repository subpath.
 */
export function normalizeBase(base: string | undefined): string {
  const value = (base ?? "").trim();
  if (!value || value === "./") return "/";
  const prefixed = value.startsWith("/") ? value : `/${value}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

export function resolveFromBase(path: string, base: string | undefined = import.meta.env.BASE_URL): string {
  return `${normalizeBase(base)}${path.replace(/^\/+/, "")}`;
}

export const landingPath = (base?: string): string => resolveFromBase("", base);
export const dashboardPath = (base?: string): string => resolveFromBase("dashboard/", base);
export const assetPath = (path: string, base?: string): string => resolveFromBase(path, base);
