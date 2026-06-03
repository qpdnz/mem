<script lang="ts">
	import {
		BadgeCheck,
		BriefcaseBusiness,
		Database,
		LogOut,
		LayoutDashboard,
		Receipt,
		Users,
		type Icon,
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { logout } from '$lib/auth.svelte';

	type NavItem = {
		href: string;
		label: string;
		icon: typeof Icon;
	};

	let { currentPath, subtitle = 'Operations Suite' } = $props<{
		currentPath: string;
		subtitle?: string;
	}>();

	const navItems: NavItem[] = [
		{ href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
		{ href: '/expenses', label: '経費登録', icon: Receipt },
		{ href: '/projects', label: '案件管理', icon: BriefcaseBusiness },
		{ href: '/employees', label: '社員管理', icon: Users },
		{ href: '/approvals', label: '承認ワークフロー', icon: BadgeCheck },
		{ href: '/master', label: 'マスタ管理', icon: Database },
	];

	function isActive(href: string): boolean {
		if (href === '/') return currentPath === '/';
		return currentPath === href || currentPath.startsWith(`${href}/`);
	}

	function signOut(): void {
		logout();
		goto('/login', { replaceState: true });
	}
</script>

<aside class="sidebar">
	<div class="brand">
		<div class="brand-mark">K</div>
		<div>
			<p class="brand-title">Keihi</p>
			<p class="brand-sub">{subtitle}</p>
		</div>
	</div>
	<nav class="menu" aria-label="主要メニュー">
		{#each navItems as item (item.href)}
			<a class="menu-item" class:item-active={isActive(item.href)} href={item.href}>
				<item.icon class="icon" stroke-width={1.8} />
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>
	<div class="menu-footer">
		<button type="button" class="menu-item logout-btn" onclick={signOut}>
			<LogOut class="icon" stroke-width={1.8} />
			<span>ログアウト</span>
		</button>
	</div>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
	}

	.menu-footer {
		margin-top: auto;
		padding-top: 12px;
	}

	.logout-btn {
		border: 0;
		background: transparent;
		cursor: pointer;
	}
</style>
