<script lang="ts">
	import { page } from '$app/state';
	import { FileQuestion } from '@lucide/svelte';
	import CodeJump from '#lib/components/CodeJump.svelte';
</script>

<svelte:head><title>{page.status} · Saga</title></svelte:head>

<div class="mx-auto mt-10 max-w-sm text-center">
	<div class="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"><FileQuestion class="size-6" /></div>
	<h1 class="text-lg font-semibold tracking-tight">{page.status === 404 ? 'Not found' : `Error ${page.status}`}</h1>
	<p class="mt-1 text-[0.8125rem] text-muted-foreground">{page.error?.message}</p>
	<div class="mt-6"><CodeJump large /></div>
	<a class="btn btn-ghost btn-sm mt-3" href="/">Home</a>
</div>
