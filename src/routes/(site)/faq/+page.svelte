<script lang="ts">
  import Markdown from 'svelte-markdown';
  import ExternalLink from '$lib/components/ExternalLink.svelte';
  import { Accordion, AccordionItem, Toast } from 'flowbite-svelte';
  import { LinkOutline, ClipboardOutline } from 'flowbite-svelte-icons';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  export let data;
  const { faqData, highlightedFAQ: initialHighlightedFAQ } = data;

  let selectedCategory = 'All';
  let expandAll = false;
  let highlightedFAQ = initialHighlightedFAQ;
  let showToast = false;

  $: categories = ['All', ...new Set(faqData.map(item => item.category))];
  $: filteredFAQ = selectedCategory === 'All' 
    ? faqData 
    : faqData.filter(item => item.category === selectedCategory);

  function toggleAll() {
    expandAll = !expandAll;
  }

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
  }

  function copyLinkToClipboard(question: string) {
    const slug = slugify(question);
    const url = `${$page.url.origin}${$page.url.pathname}#${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast = true;
      setTimeout(() => showToast = false, 3000);
    });
  }

  onMount(() => {
    if (highlightedFAQ) {
      const element = document.getElementById(slugify(highlightedFAQ.question));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
</script>

<svelte:head>
  <title>{data.pageMetaTags.title}</title>
  <meta name="description" content={data.pageMetaTags.description}>
  <meta property="og:title" content={data.pageMetaTags.title}>
  <meta property="og:description" content={data.pageMetaTags.description}>
  <meta property="og:image" content={data.pageMetaTags.imageUrl}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={data.pageMetaTags.title}>
  <meta name="twitter:description" content={data.pageMetaTags.description}>
  <meta name="twitter:image" content={data.pageMetaTags.imageUrl}>
</svelte:head>

<div class="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-purple-900 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
  <div class="max-w-4xl mx-auto">
    <header class="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 mb-8">
      <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">Frequently Asked Questions</h1>
      <p class="mt-2 text-xl text-gray-600 dark:text-gray-300">Find answers to common questions about Voi Network</p>
    </header>

    <section class="mb-8 bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden">
      <header class="bg-purple-600 dark:bg-purple-800 py-4 px-6 flex justify-between items-center">
        <h2 class="text-2xl font-bold text-white">FAQ Categories</h2>
        <div class="flex items-center">
          <label for="category" class="text-white mr-2">Filter:</label>
          <select 
            id="category" 
            bind:value={selectedCategory}
            class="p-2 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
          >
            {#each categories as category}
              <option value={category}>{category}</option>
            {/each}
          </select>
        </div>
      </header>
      
      <div class="p-6">
        <button
          on:click={toggleAll}
          class="mb-4 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
        >
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>

        {#if highlightedFAQ}
          <Accordion class="divide-y divide-gray-200 dark:divide-gray-700 mb-8">
            <AccordionItem open={true}>
              <svelte:fragment slot="header">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <LinkOutline class="w-5 h-5 mr-3 text-purple-600 dark:text-purple-400" />
                    <span class="text-xl font-semibold text-gray-700 dark:text-gray-300">
                      {#each highlightedFAQ.question.split('**') as part, index}
                        {#if index % 2 === 0}
                          {part}
                        {:else}
                          <strong class="text-purple-600 dark:text-purple-400">{part}</strong>
                        {/if}
                      {/each}
                    </span>
                  </div>
                  <button
                    on:click|stopPropagation={() => copyLinkToClipboard(highlightedFAQ.question)}
                    class="ml-2 p-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200"
                    title="Copy link to clipboard"
                  >
                    <ClipboardOutline class="w-5 h-5" />
                  </button>
                </div>
              </svelte:fragment>
              <div class="markdown whitespace-pre-wrap prose dark:prose-invert max-w-none py-4">
                <Markdown source={highlightedFAQ.answer} renderers={{ link: ExternalLink }}/>
              </div>
            </AccordionItem>
          </Accordion>
        {/if}

        <Accordion class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each filteredFAQ as item}
            <AccordionItem open={expandAll} id={slugify(item.question)}>
              <svelte:fragment slot="header">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <LinkOutline class="w-5 h-5 mr-3 text-purple-600 dark:text-purple-400" />
                    <span class="text-xl font-semibold text-gray-700 dark:text-gray-300">
                      <a href={`#${slugify(item.question)}`} class="hover:underline">
                        {#each item.question.split('**') as part, index}
                          {#if index % 2 === 0}
                            {part}
                          {:else}
                            <strong class="text-purple-600 dark:text-purple-400">{part}</strong>
                          {/if}
                        {/each}
                      </a>
                    </span>
                  </div>
                  <button
                    on:click|stopPropagation={() => copyLinkToClipboard(item.question)}
                    class="ml-2 p-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200"
                    title="Copy link to clipboard"
                  >
                    <ClipboardOutline class="w-5 h-5" />
                  </button>
                </div>
              </svelte:fragment>
              <div class="markdown whitespace-pre-wrap prose dark:prose-invert max-w-none py-4">
                <Markdown source={item.answer} renderers={{ link: ExternalLink }}/>
              </div>
            </AccordionItem>
          {/each}
        </Accordion>
      </div>
    </section>
  </div>
</div>

{#if showToast}
  <Toast class="fixed bottom-5 right-5">
    <span class="font-semibold text-sm text-blue-500 dark:text-blue-400">Link copied to clipboard!</span>
  </Toast>
{/if}

<style>
  :global(body) {
    @apply bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100;
  }
</style>