export function createNameResolver(
	lookup: (addresses: string[]) => Promise<{ address: string; name: string }[]>
) {
	const inFlight = new Set<string>();
	const names = new Map<string, string>();
	return {
		async resolve(addresses: string[]): Promise<Record<string, string>> {
			const pending = [...new Set(addresses)].filter(
				(address) => !names.has(address) && !inFlight.has(address)
			);
			if (!pending.length) return Object.fromEntries(names);
			pending.forEach((address) => inFlight.add(address));
			try {
				const found = await lookup(pending);
				for (const { address, name } of found) {
					if (name) names.set(address, name);
				}
			} catch {
				// Keep cached names; retry failures only when resolve is called again.
			} finally {
				// Missing results must also be eligible for the next epoch load or Refresh.
				pending.forEach((address) => inFlight.delete(address));
			}
			return Object.fromEntries(names);
		}
	};
}
