/** Lowercase hostname without a leading "www.": how a site is shown and stored in the blocklist. */
export function siteOf(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

/** Turns input like "https://www.example.com/a", "*.example.com" or "Example.com" into a site, or null if invalid. */
export function normalizeSite(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//.test(text)) text = `http://${text.replace(/^\*\./, '')}`;
  let hostname: string;
  try {
    hostname = new URL(text).hostname;
  } catch {
    return null;
  }
  const site = siteOf(hostname);
  return /^(localhost|[a-z\d-]+(\.[a-z\d-]+)+|\[[\da-f:.]+\])$/.test(site) ? site : null;
}

/** Whether `hostname` is `site` itself or one of its subdomains. */
export function matchesSite(hostname: string, site: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === site || host.endsWith(`.${site}`);
}

export function isSiteBlocked(hostname: string, blockedSites: readonly string[]): boolean {
  return !!hostname && blockedSites.some((site) => matchesSite(hostname, site));
}
