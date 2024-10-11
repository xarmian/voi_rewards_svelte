<script lang="ts">
  import { Accordion, AccordionItem, Toast } from 'flowbite-svelte';
  import { LinkOutline, ClipboardOutline } from 'flowbite-svelte-icons';
  import Markdown from 'svelte-markdown';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import { page } from '$app/stores';

  export let faqData: {
    question: string;
    answer: string;
    category: string;
  };
  export let expandAll: boolean = false;
  export let slug: string | null = null;

  let showToast = false;

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
  }

  $: itemSlug = slug || slugify(faqData.question);

  function copyLinkToClipboard() {
    const url = `${$page.url.origin}${$page.url.pathname}#${itemSlug}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast = true;
      setTimeout(() => showToast = false, 3000);
    });
  }
</script>

<Accordion multiple class="divide-y divide-gray-200 dark:divide-gray-700">
  <AccordionItem open={expandAll} id={itemSlug}>
    <svelte:fragment slot="header">
      <a href={`#${itemSlug}`} class="w-full">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center">
            <LinkOutline class="w-5 h-5 mr-3 text-purple-600 dark:text-purple-400" />
            <span class="text-xl font-semibold text-gray-700 dark:text-gray-300">
              {#each faqData.question.split('**') as part, index}
                {#if index % 2 === 0}
                  {part}
                {:else}
                  <strong class="text-purple-600 dark:text-purple-400">{part}</strong>
                {/if}
              {/each}
            </span>
          </div>
          <button
            on:click|stopPropagation={copyLinkToClipboard}
            class="ml-2 p-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200"
            title="Copy link to clipboard"
          >
            <ClipboardOutline class="w-5 h-5" />
          </button>
        </div>
      </a>
    </svelte:fragment>
    <div class="markdown whitespace-pre-wrap prose dark:prose-invert max-w-none py-4">
      <Markdown source={faqData.answer} renderers={{ link: ExternalLink }}/>
    </div>
  </AccordionItem>
</Accordion>

{#if showToast}
  <Toast class="fixed bottom-5 right-5">
    <span class="font-semibold text-sm text-blue-500 dark:text-blue-400">Link copied to clipboard!</span>
  </Toast>
{/if}