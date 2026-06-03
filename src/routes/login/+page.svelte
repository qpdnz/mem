<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		isAuthenticated,
		isLocked,
		lockRemainingSeconds,
		login,
		loginWithExternalUser
	} from '$lib/auth.svelte';
	import { loginWithMicrosoft } from '$lib/msAuth';

	let username = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isSubmitting = $state(false);
	let isMicrosoftSubmitting = $state(false);

	async function submit(): Promise<void> {
		errorMessage = '';
		if (isSubmitting) return;
		isSubmitting = true;
		try {
			const result = await login(username, password);
			if (!result.ok) {
				errorMessage = result.message;
				return;
			}
			await goto('/', { replaceState: true });
		} finally {
			isSubmitting = false;
		}
	}

	async function submitMicrosoft(): Promise<void> {
		errorMessage = '';
		if (isMicrosoftSubmitting) return;
		isMicrosoftSubmitting = true;
		try {
			const result = await loginWithMicrosoft();
			const displayName =
				result.account?.name ?? result.account?.username ?? 'Microsoft User';
			loginWithExternalUser(displayName);
			await goto('/', { replaceState: true });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Microsoft ログインに失敗しました。';
		} finally {
			isMicrosoftSubmitting = false;
		}
	}

	$effect(() => {
		if (isAuthenticated()) goto('/', { replaceState: true });
	});
</script>

<svelte:head>
	<title>ログイン | 経費登録システム</title>
</svelte:head>

<main class="login-shell">
	<section class="login-card">
		<h1>ログイン</h1>
		<p class="note">認証情報を入力してください</p>
		<form
			class="form"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<label class="field">
				<span>ユーザー名</span>
				<input bind:value={username} autocomplete="username" required />
			</label>
			<label class="field">
				<span>パスワード</span>
				<input bind:value={password} type="password" autocomplete="current-password" required />
			</label>
			{#if errorMessage}
				<p class="error">{errorMessage}</p>
			{:else if isLocked()}
				<p class="error">再試行まで {lockRemainingSeconds()} 秒</p>
			{/if}
			<button class="btn btn-primary" type="submit" disabled={isSubmitting}>
				{isSubmitting ? '確認中...' : 'ログイン'}
			</button>
		</form>
		<div class="oauth">
			<div class="divider" aria-hidden="true"><span></span></div>
			<button class="btn btn-secondary" type="button" onclick={submitMicrosoft} disabled={isMicrosoftSubmitting}>
				{isMicrosoftSubmitting ? '接続中...' : 'Microsoft でログイン'}
			</button>
		</div>
		<p class="help">初期アカウント: <code>admin</code> / <code>Admin#2026!MemSafe</code></p>
		<p class="help">環境変数: <code>VITE_MS_CLIENT_ID</code>（任意で <code>VITE_MS_TENANT_ID</code>）</p>
	</section>
</main>

<style>
	.login-shell {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 16px;
		background:
			radial-gradient(circle at 10% 10%, #1e293b 0, transparent 32%),
			radial-gradient(circle at 85% 20%, #172554 0, transparent 36%),
			var(--gray-100);
	}

	.login-card {
		width: min(420px, 100%);
		padding: 24px;
		background: var(--white);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	h1 {
		margin: 0;
		font-size: 24px;
		line-height: 1.3;
	}

	.note {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--gray-600);
	}

	.form {
		margin-top: 16px;
		display: grid;
		gap: 12px;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	.field span {
		font-size: 12px;
		font-weight: 500;
		color: var(--gray-700);
	}

	.error {
		margin: 0;
		font-size: 12px;
		color: var(--red-700);
	}

	.btn {
		width: 100%;
	}

	.oauth {
		margin-top: 12px;
		display: grid;
		gap: 12px;
	}

	.divider {
		display: grid;
		place-items: center;
	}

	.divider span {
		width: 100%;
		height: 1px;
		background: var(--gray-200);
	}

	.help {
		margin: 12px 0 0;
		font-size: 12px;
		color: var(--gray-600);
	}
</style>
