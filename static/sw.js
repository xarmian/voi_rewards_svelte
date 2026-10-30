// Self-unregistering stub (TASK-101). This path served a third-party ad network's push service
// worker during a March 2025 trial. Browsers that registered it re-fetch this file on their next
// update check, install this version, and remove themselves: the push subscription, caches, and the
// registration go. The app has no service worker of its own, so nothing here is ours to keep.
// Serve until 2027-01-28, then delete the file (follow-up on TASK-101's trail).
self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const subscription = await self.registration.pushManager.getSubscription();
			if (subscription) await subscription.unsubscribe();
			for (const key of await caches.keys()) await caches.delete(key);
			await self.registration.unregister();
		})()
	);
});
