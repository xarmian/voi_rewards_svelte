<script lang="ts">
	// import need to init tailwind
	import '../app.css';
	import '@fortawesome/fontawesome-free/css/all.min.css'
	import { page } from '$app/stores';

	import { dev } from '$app/environment';
  	// import { inject } from '@vercel/analytics';
	// inject({ mode: dev ? 'development' : 'production' });

	$: metadata = $page.data.pageMetaTags ?? {};
	$: pageName = metadata.title ? metadata.title + ' | Voi Rewards Auditor' : 'Voi Rewards Auditor';
	$: description = metadata.description ?? 'View real-time expected token rewards for block proposals and node health. Voi, the blockchain for You All.';
	$: imageUrl = metadata.imageUrl ?? 'https://voirewards.com/android-chrome-192x192.png';
	//const twitterHandle = metadata.twitterHandle;
	$: siteName = metadata.siteName ?? ' Voi Rewards Auditor';
	$: cardType = metadata.cardType ?? 'summary';
</script>

<svelte:head>
	<title>{pageName}</title>
	<meta name="description" content="{description}" />
	<meta name="og:title" content="{pageName}" />
	<meta name="og:description" content="{description}" />
	<meta name="og:image" content="{imageUrl}" />
	<meta name="og:site_name" content="{siteName}" />
	<meta name="og:image:alt" content="{description}" />
	<meta name="twitter:card" content="{cardType}" />
	<meta name="twitter:title" content="{pageName}" />
	<meta name="twitter:description" content="{description}" />
	<meta name="twitter:image" content="{imageUrl}" />
	<meta name="twitter:image:alt" content="{description}" />
	<!--<meta name="twitter:site" content="{twitterHandle}" />
	<meta name="twitter:creator" content="{twitterHandle}" />-->
</svelte:head>
<slot />
