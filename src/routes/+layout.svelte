<script lang="ts">
	// import need to init tailwind
	import '../app.css';
	import '@fortawesome/fontawesome-free/css/all.min.css'

	import { dev } from '$app/environment';
  	// import { inject } from '@vercel/analytics';
	// inject({ mode: dev ? 'development' : 'production' });
</script>

<slot />
