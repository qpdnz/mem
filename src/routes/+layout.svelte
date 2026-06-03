<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAuthenticated, touchSession } from '$lib/auth.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	function guard(pathname: string): void {
		const authed = isAuthenticated();
		if (!authed && pathname !== '/login') {
			goto('/login', { replaceState: true });
			return;
		}
		if (authed && pathname === '/login') {
			goto('/', { replaceState: true });
		}
	}

	$effect(() => {
		guard(page.url.pathname);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="antialiased" onpointerdown={touchSession} onkeydown={touchSession}>
	{@render children()}
</div>
