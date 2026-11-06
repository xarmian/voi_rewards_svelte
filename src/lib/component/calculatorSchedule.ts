export type ScheduleRow = {
	epochNumber: number;
	startDate: Date;
	endDate: Date;
	rewardPool: number;
	isCurrent: boolean;
};

function epochDates(epochNumber: number, startDate: Date) {
	const epochStartDate = new Date(startDate);
	epochStartDate.setDate(startDate.getDate() + epochNumber * 7);
	const epochEndDate = new Date(epochStartDate);
	epochEndDate.setDate(epochStartDate.getDate() + 6);
	return { startDate: epochStartDate, endDate: epochEndDate };
}

export function scheduleRows(
	epochRewards: number[],
	currentEpochNumber: number,
	startDate: Date,
	now: Date
): ScheduleRow[] {
	return Array.from({ length: 52 }, (_, i) => {
		const dates = epochDates(currentEpochNumber + i, startDate);
		return {
			epochNumber: currentEpochNumber + i,
			...dates,
			rewardPool: epochRewards[i] || 0,
			isCurrent: now >= dates.startDate && now <= dates.endDate
		};
	});
}

export function buildScheduleCsv(amounts: number[], startDate: Date): string {
	return [
		'startDate,endDate,nodeAamount,relayAmount',
		...amounts.map((amount, epoch) => {
			const dates = epochDates(epoch, startDate);
			return `${dates.startDate.toISOString().split('T')[0]},${dates.endDate.toISOString().split('T')[0]},${Math.round(amount)},${Math.round(amount / 10)}`;
		})
	].join('\n');
}
