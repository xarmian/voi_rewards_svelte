<script lang="ts">
    import type { IQuest } from "$lib/data/types";

    export let quest: IQuest;
    export let wallet: string | null;

</script>
<tr>
    <td>{quest.title}</td>
    <td>{quest.description}</td>
    <td><a href={quest.guide} target="_blank">View Guide</a></td>
    <td></td>
</tr>