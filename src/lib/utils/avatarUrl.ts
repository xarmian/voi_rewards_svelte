// Avatar URLs come from third-party name records (enVoi, NFD) and are free text the record owner sets, so
// every surface takes them through this check where the data enters the app.
const AVATAR_MAX = 2048;

// The only hosts the name services serve avatars from (enVoi: prod.cdn.highforge.io; NFD:
// images.nf.domains and ipfsgw.nf.domains). The hostname must equal one of them exactly: no suffix or
// subdomain match.
export const AVATAR_HOSTS: readonly string[] = Object.freeze([
	'prod.cdn.highforge.io',
	'images.nf.domains',
	'ipfsgw.nf.domains'
]);

// Returns the PARSED href, never the raw string: a string such as `https:../api/x` is a valid https URL
// to `new URL(s)` with a host of `..`, but the browser resolves an <img src> against the page and would
// load a same-origin path. The raw string must also start with `https://`, so no form relies on that.
export function safeAvatarUrl(raw: unknown): string | null {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > AVATAR_MAX) return null;
	if (!/^https:\/\//i.test(raw)) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
		const host = url.hostname;
		// WHATWG keeps a trailing dot (also from `%2e` or an ideographic full stop), and Chromium treats
		// `localhost.` as loopback. A public image host has a plain dotted name: no empty labels, no
		// trailing dot.
		if (host.split('.').some((label) => label === '')) return null;
		// URL parsing lower-cases the host, so an exact match covers every spelling of an allowed host and
		// nothing else: no IP literal, local name or the site's own host can equal one of them.
		if (!AVATAR_HOSTS.includes(host)) return null;
		return url.href;
	} catch {
		return null;
	}
}
