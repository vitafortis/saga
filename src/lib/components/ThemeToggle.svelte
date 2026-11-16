<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { setTheme, theme } from '#lib/client/state.svelte.ts';

	onMount(() => {
		theme.value = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
	});
</script>

<button
	class="btn btn-ghost btn-icon"
	onclick={() => setTheme(theme.value === 'dark' ? 'light' : 'dark')}
	aria-label="Switch to {theme.value === 'dark' ? 'light' : 'dark'} theme"
	title="Theme"
>
	{#if theme.value === 'dark'}<Sun />{:else}<Moon />{/if}
</button>
