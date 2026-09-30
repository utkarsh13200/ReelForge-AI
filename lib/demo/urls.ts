export function appOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
}

export function absolutizeAppUrl(url: string) {
  if (!url) return url;
  if (/^(https?:|data:|file:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${appOrigin()}${url}`;
  return url;
}
