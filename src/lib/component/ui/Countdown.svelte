<script lang="ts">
	import { convertMillisecondsToTime } from '$lib/utils/time';

	export let time: number;
	let startTime = new Date(time);

	let diff: number = 0;

	$: countdown = convertMillisecondsToTime(diff);

	const updateCountdown = () => {
		const now = new Date();
		diff = startTime.getTime() - now.getTime();
	};
	setInterval(updateCountdown, 1000);
</script>

<div class="flex gap-5">
	<div>
		<span class="countdown">
			<span style="--value:{countdown.days > 0 ? countdown.days : 0};" />
		</span>
		days
	</div>
	<div>
		<span class="countdown">
			<span style="--value:{countdown.hours > 0 ? countdown.hours : 0};" />
		</span>
		hours
	</div>
	<div>
		<span class="countdown">
			<span style="--value:{countdown.minutes > 0 ? countdown.minutes : 0};" />
		</span>
		min
	</div>
	<div>
		<span class="countdown">
			<span style="--value:{countdown.seconds > 0 ? countdown.seconds : 0};" />
		</span>
		sec
	</div>
</div>
