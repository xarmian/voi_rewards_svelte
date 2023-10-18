<script lang="ts">
	export let timeStamp = 0;
	$: date = new Date(timeStamp);
</script>

{date
	.toLocaleTimeString([], {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	})
	.replace(',', '')}
