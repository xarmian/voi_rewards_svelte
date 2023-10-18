<script context="module" lang="ts">
	export type SelectOption =
		| {
				id: string;
				name: string;
		  }
		| undefined;
</script>

<script lang="ts">
	export let options: SelectOption[] = [];

	export let index = 0;
	export let value;

	$: {
		value = index; //;options ? options[index]?.id : 'undefined';
		console.log(`opt: ${value}`);
	}
</script>

<select bind:value={index}>
	{#each options || [] as option, i}
		<option value={i}>{option?.name}</option>
	{/each}
</select>
