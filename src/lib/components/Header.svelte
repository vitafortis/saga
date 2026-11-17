<script lang="ts">
	import { LogIn, LogOut, Settings } from '@lucide/svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/client/api.ts';
	import CodeJump from './CodeJump.svelte';
	import Logo from './Logo.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	async function signOut() {
		await api.post('/api/auth/logout');
		await invalidateAll();
		goto('/');
	}
</script>

<header class="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
	<div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
		<a href="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
			<Logo size={26} />
			<span>Saga</span>
		</a>
		<div class="flex-1"></div>
		<CodeJump />
		<ThemeToggle />
		{#if page.data.authed}
			<a
				class="btn btn-ghost btn-icon {page.url.pathname === '/settings' ? 'bg-accent text-foreground' : ''}"
				href="/settings"
				aria-label="Settings"
				title="Settings"><Settings /></a
			>
		{/if}
		{#if page.data.passwordRequired}
			{#if page.data.authed}
				<button class="btn btn-ghost btn-icon" onclick={signOut} aria-label="Sign out" title="Sign out"><LogOut /></button>
			{:else if page.url.pathname !== '/login'}
				<a class="btn btn-secondary btn-sm" href="/login?next={encodeURIComponent(page.url.pathname)}"><LogIn />Sign in</a>
			{/if}
		{/if}
	</div>
</header>
