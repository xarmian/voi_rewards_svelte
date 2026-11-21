import { get } from 'svelte/store';
import { requireAccountInfo } from '$lib/stores/accounts';
import { voiPrice, fetchVoiPrice } from '$lib/stores/price';
import { boundedRead } from './read';

export async function loadCalculatorBalance(address: string, force = false): Promise<number> {
	const account = await boundedRead(requireAccountInfo(address, { force }));
	const amount = Number(account.amount);
	if (
		account.amount == null ||
		(typeof account.amount === 'string' && !String(account.amount).trim()) ||
		!Number.isFinite(amount) ||
		amount < 0
	)
		throw new Error('Wallet balance unavailable');
	return amount / 1e6;
}
export async function loadCalculatorPrice(_address = '', force = false): Promise<number> {
	void _address;
	await boundedRead(fetchVoiPrice(force));
	const quote = get(voiPrice);
	if (quote.error || !Number.isFinite(quote.price) || quote.price <= 0)
		throw new Error('Market price unavailable');
	return quote.price;
}
