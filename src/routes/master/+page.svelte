<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';

	const modules = [
		{
			title: '社員原価マスタ',
			description: '社員の月額人件費・稼働時間の登録・編集',
			href: '/',
			status: '稼働中',
		},
		{
			title: '区分マスタ',
			description: '経費・集計用の区分名の登録・編集',
			href: '/master/categories',
			status: '稼働中',
		},
		{
			title: '案件管理',
			description: '案件情報・予算・進行状態の管理',
			href: '/projects',
			status: '稼働中',
		},
		{
			title: '承認ワークフロー',
			description: '申請中データの承認・却下処理',
			href: '/approvals',
			status: '稼働中',
		},
	];
</script>

<svelte:head>
	<title>経費登録システム | マスタ管理</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/master" subtitle="Master Console" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">マスタ管理</h1>
			<p class="page-subtitle">各種マスタと関連画面へのハブです</p>
		</header>

		<section class="kpi-grid kpi-3" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">公開モジュール</p>
				<p class="kpi-value">{modules.length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">利用中</p>
				<p class="kpi-value">{modules.filter((x) => x.status === '稼働中').length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">次期追加予定</p>
				<p class="kpi-value">2<span> 件</span></p>
			</article>
		</section>

		<section class="module-grid">
			{#each modules as m (m.href)}
				<a href={m.href} class="module-card">
					<div class="module-head">
						<h2 class="card-title">{m.title}</h2>
						<span class="status-badge status-approved">{m.status}</span>
					</div>
					<p>{m.description}</p>
					<span class="go">画面を開く</span>
				</a>
			{/each}
		</section>
	</div>
</div>

<style>
	.kpi-3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.module-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.module-card {
		display: block;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}

	.module-card:hover {
		border-color: var(--blue-600);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.module-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.module-card p {
		margin: 10px 0 0;
		font-size: 13px;
		color: var(--gray-600);
	}

	.go {
		display: inline-block;
		margin-top: 12px;
		font-size: 13px;
		color: var(--blue-700);
	}

	@media (max-width: 720px) {
		.module-grid,
		.kpi-3 {
			grid-template-columns: 1fr;
		}
	}
</style>
