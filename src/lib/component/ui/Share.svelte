<script lang="ts">
    import { Button, Popover } from 'flowbite-svelte';
    import { toast } from '@zerodevx/svelte-toast';
    import { copy } from 'svelte-copy';
  
    export let url: string;
    export let text: string;
    export let placement: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
  
    let popoverOpen = false;
  
    function shareToSocialMedia(platform: string) {
      let shareUrl = '';
      switch (platform) {
        case 'twitter':
          shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
          break;
        case 'facebook':
          shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
          break;
        case 'telegram':
          shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
          break;
        case 'instagram':
          // Instagram doesn't have a direct share URL, so we'll copy the text and URL to clipboard
          navigator.clipboard.writeText(`${text} ${url}`);
          toast.push('Content copied to clipboard. You can now paste it into your Instagram story or post.');
          popoverOpen = false;
          return;
      }
      window.open(shareUrl, '_blank');
      popoverOpen = false;
    }
  </script>
  
  <Button on:click={() => popoverOpen = !popoverOpen}>
    <i class="fas fa-share-alt mr-2"></i>
    Share
  </Button>
  
  <Popover class="w-64 text-sm font-light relative z-10" bind:open={popoverOpen} placement={placement}>
    <div class="px-3 py-2">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Share to:</h3>
      <div class="flex flex-col space-y-2">
        <Button color="blue" on:click={() => shareToSocialMedia('twitter')}>
          <i class="fab fa-x-twitter mr-2"></i>
          / Twitter
        </Button>
        <!--<Button color="blue" on:click={() => shareToSocialMedia('facebook')}>
          <i class="fab fa-facebook mr-2"></i>
          Facebook
        </Button>-->
        <Button color="blue" on:click={() => shareToSocialMedia('telegram')}>
          <i class="fab fa-telegram mr-2"></i>
          Telegram
        </Button>
        <Button color="blue" on:click={() => shareToSocialMedia('instagram')}>
          <i class="fab fa-instagram mr-2"></i>
          Instagram
        </Button>
        <Button color="alternative">
          <div class="flex flex-row space-x-2" use:copy={url} on:svelte-copy={() => toast.push(`URL Copied to Clipboard:<br/> ${url.substring(0,20)}...`)}>
            <i class="fas fa-copy mr-2"></i>
            Copy URL
          </div>
        </Button>
      </div>
    </div>
  </Popover>