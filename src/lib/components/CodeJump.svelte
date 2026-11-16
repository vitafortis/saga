<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let { large = false }: { large?: boolean } = $props();
	let value = $state('');
	const digits = $derived(value.replace(/\D/g, ''));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (digits.length >= 6) goto(`/${digits}`);
	}
</script>

<form onsubmit={submit} class="relative flex items-center {large ? 'w-full' : 'w-40 sm:w-52'}">
	<input
		class="input pr-10 font-mono tracking-[0.12em] {large ? 'h-12 text-center text-lg' : 'h-8 text-[0.8125rem]'}"
		inputmode="numeric"
		autocomplete="off"
		placeholder={large ? '1234 5678' : 'Open a code'}
		aria-label="Shortcode"
		bind:value
	/>
	<button
		class="btn btn-primary btn-icon absolute right-1 {large ? 'size-10' : 'size-6 btn-sm'}"
		disabled={digits.length < 6}
		aria-label="Open"
	>
		<ArrowRight />
	</button>
</form>
