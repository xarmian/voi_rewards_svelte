<script>
    import { onMount } from 'svelte';

    let items = ["1. Complete Quests", "2. Learn about Voi", "3. Earn Points toward Airdrop"];
    let currentIndex = 0;
    let isFading = true;

    onMount(() => {
        fadeInItem();
    });

    function fadeInItem() {
        if (currentIndex < items.length) {
            setTimeout(() => {
                currentIndex++;
                fadeInItem();
            }, 2000);
        } else {
            setTimeout(resetList, 4000);
        }
    }

    function resetList() {
        currentIndex = 0;
        setTimeout(fadeInItem, 2000);
    }
</script>

<style>
    .item {
        opacity: 0;
        transition: opacity 2s;
        display: flex;
        align-items: center;
    }

    .item.complete {
        opacity: 1;
    }

    .checkmark {
        margin-left: 10px;
        display: none;
    }

    .item.complete .checkmark {
        display: inline;
    }
</style>

<ul>
    {#each items as item, index}
        <li class="item {index < currentIndex ? 'complete' : ''}">
            {item} <i class="fas fa-check checkmark"></i>
        </li>
    {/each}
</ul>
