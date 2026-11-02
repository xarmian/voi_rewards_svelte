import { describe, expect, it, vi } from 'vitest';
import { awaitWithdrawalConfirmation } from './withdrawConfirmation';

describe('awaitWithdrawalConfirmation', () => {
	it('confirms a positive round immediately without pausing', async () => {
		const pendingInfo = vi.fn(async () => ({ 'confirmed-round': 12 }));
		const pause = vi.fn(async () => {});

		expect(await awaitWithdrawalConfirmation('TX', { pendingInfo, pause })).toEqual({
			status: 'confirmed',
			confirmedRound: 12
		});
		expect(pendingInfo).toHaveBeenCalledExactlyOnceWith('TX');
		expect(pause).not.toHaveBeenCalled();
	});

	it('polls empty responses until a confirmed round arrives', async () => {
		const pendingInfo = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({ 'confirmed-round': 7 });
		const pause = vi.fn(async () => {});

		expect(
			await awaitWithdrawalConfirmation('TX', { pendingInfo, pause }, { intervalMs: 25 })
		).toEqual({ status: 'confirmed', confirmedRound: 7 });
		expect(pendingInfo.mock.calls).toEqual([['TX'], ['TX'], ['TX']]);
		expect(pause.mock.calls).toEqual([[25], [25]]);
	});

	it.each([0, -1, NaN, '12', undefined])('does not confirm an invalid round %s', async (round) => {
		const pendingInfo = vi.fn().mockResolvedValue({ 'confirmed-round': round });
		const pause = vi.fn(async () => {});

		expect(
			await awaitWithdrawalConfirmation('TX', { pendingInfo, pause }, { attempts: 1 })
		).toStrictEqual({ status: 'pending' });
	});

	it('keeps a round with a pool error pending through exhaustion', async () => {
		const pendingInfo = vi.fn(async () => ({ 'confirmed-round': 12, 'pool-error': 'overspend' }));
		const pause = vi.fn(async () => {});

		expect(
			await awaitWithdrawalConfirmation('TX', { pendingInfo, pause }, { attempts: 3 })
		).toEqual({ status: 'pending', poolError: 'overspend' });
		expect(pendingInfo).toHaveBeenCalledTimes(3);
		expect(pause).toHaveBeenCalledTimes(2);
	});

	it('keeps polling after a pool error and can confirm later', async () => {
		const pendingInfo = vi
			.fn()
			.mockResolvedValueOnce({ 'pool-error': 'x' })
			.mockResolvedValueOnce({ 'confirmed-round': 5 });
		const pause = vi.fn(async () => {});

		expect(await awaitWithdrawalConfirmation('TX', { pendingInfo, pause })).toEqual({
			status: 'confirmed',
			confirmedRound: 5
		});
		expect(pendingInfo).toHaveBeenCalledTimes(2);
	});

	it('treats an empty pool error as no pool error', async () => {
		const pendingInfo = vi.fn(async () => ({ 'confirmed-round': 8, 'pool-error': '' }));
		const pause = vi.fn(async () => {});

		expect(await awaitWithdrawalConfirmation('TX', { pendingInfo, pause })).toEqual({
			status: 'confirmed',
			confirmedRound: 8
		});
	});

	it('remembers the latest non-empty pool error across empty responses and lookup failures', async () => {
		const pendingInfo = vi
			.fn()
			.mockResolvedValueOnce({ 'pool-error': 'first' })
			.mockResolvedValueOnce({ 'pool-error': 'latest' })
			.mockResolvedValueOnce({ 'pool-error': '' })
			.mockRejectedValueOnce(new Error('node unavailable'))
			.mockResolvedValueOnce({});
		const pause = vi.fn(async () => {});

		expect(
			await awaitWithdrawalConfirmation('TX', { pendingInfo, pause }, { attempts: 5 })
		).toEqual({ status: 'pending', poolError: 'latest' });
	});

	it('retries two failed lookups and then confirms', async () => {
		const pendingInfo = vi
			.fn()
			.mockRejectedValueOnce(new Error('node unavailable'))
			.mockRejectedValueOnce(new Error('not propagated'))
			.mockResolvedValueOnce({ 'confirmed-round': 3 });
		const pause = vi.fn(async () => {});

		expect(await awaitWithdrawalConfirmation('TX', { pendingInfo, pause })).toEqual({
			status: 'confirmed',
			confirmedRound: 3
		});
		expect(pendingInfo).toHaveBeenCalledTimes(3);
		expect(pause).toHaveBeenCalledTimes(2);
	});

	it('resolves as pending without a poolError key when all lookups throw', async () => {
		const pendingInfo = vi.fn().mockRejectedValue(new Error('node unavailable'));
		const pause = vi.fn(async () => {});

		await expect(
			awaitWithdrawalConfirmation('TX', { pendingInfo, pause }, { attempts: 3 })
		).resolves.toStrictEqual({ status: 'pending' });
		expect(pendingInfo).toHaveBeenCalledTimes(3);
	});

	it('exhausts exactly three lookups with two pauses at the requested interval', async () => {
		const pendingInfo = vi.fn(async () => ({}));
		const pause = vi.fn(async () => {});

		expect(
			await awaitWithdrawalConfirmation(
				'TX',
				{ pendingInfo, pause },
				{ attempts: 3, intervalMs: 50 }
			)
		).toStrictEqual({ status: 'pending' });
		expect(pendingInfo).toHaveBeenCalledTimes(3);
		expect(pause.mock.calls).toEqual([[50], [50]]);
	});

	it('defaults to fifteen lookups spaced four seconds apart', async () => {
		const pendingInfo = vi.fn(async () => ({}));
		const pause = vi.fn(async () => {});

		expect(await awaitWithdrawalConfirmation('TX', { pendingInfo, pause })).toStrictEqual({
			status: 'pending'
		});
		expect(pendingInfo).toHaveBeenCalledTimes(15);
		expect(pause.mock.calls).toEqual(Array.from({ length: 14 }, () => [4000]));
	});
});
