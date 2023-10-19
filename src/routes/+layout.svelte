<script lang="ts">
	// import need to init tailwind
	import '../app.css';
	import '@fortawesome/fontawesome-free/css/all.min.css'
	import { webVitals } from '$lib/vitals';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';

	let analyticsId = import.meta.env.VERCEL_ANALYTICS_ID;

	$: if (browser && analyticsId) {
		webVitals({
			path: $page.url.pathname,
			params: $page.params,
			analyticsId
		});
	}
</script>

<slot />
