export function getBrowserAppUrl(pathname = "/"): string {
  const browserOrigin =
    typeof window !== "undefined"
      && /^https?:\/\//.test(window.location.origin)
      ? window.location.origin
      : undefined;

  let baseUrl =
    browserOrigin ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "http://localhost:3000";

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}
