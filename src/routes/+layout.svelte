<script lang="ts">
	import '../app.css';
	import Header from '#lib/components/Header.svelte';
	import Toaster from '#lib/components/Toaster.svelte';

	let { children } = $props();
</script>

<div class="relative flex min-h-dvh flex-col">
	<div class="glow-top pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"></div>
	<Header />
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
		{@render children()}
	</main>
	<footer class="mx-auto w-full max-w-5xl px-4 pb-6 text-[0.6875rem] text-muted-foreground">Saga {__APP_VERSION__}</footer>
</div>
<Toaster />
