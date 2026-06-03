<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';

	const projects = [
		{ code: 'PRJ-1042', name: '販売管理刷新', owner: '開発部', budget: 5600000, spent: 3120000, status: '進行中' },
		{ code: 'PRJ-1050', name: '経費API連携', owner: '基盤チーム', budget: 2800000, spent: 2670000, status: 'レビュー中' },
		{ code: 'PRJ-1061', name: '承認フロー改善', owner: '業務改善室', budget: 1900000, spent: 920000, status: '進行中' },
	];

	const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
	const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
	const progress = Math.round((totalSpent / totalBudget) * 100);
</script>

<svelte:head>
	<title>経費登録システム | 案件管理</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/projects" subtitle="Project Tracker" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">案件管理</h1>
			<p class="page-subtitle">案件別の予算・実績と進行状態を確認</p>
		</header>

		<section class="kpi-grid" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">案件数</p>
				<p class="kpi-value">{projects.length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">総予算</p>
				<p class="kpi-value mono">¥{totalBudget.toLocaleString('ja-JP')}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">総実績</p>
				<p class="kpi-value mono">¥{totalSpent.toLocaleString('ja-JP')}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">消化率</p>
				<p class="kpi-value">{progress}<span>%</span></p>
			</article>
		</section>

		<section class="card table-card">
			<div class="card-head table-head">
				<h2 class="card-title">案件一覧</h2>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>案件コード</th>
							<th>案件名</th>
							<th>担当部署</th>
							<th class="align-right">予算</th>
							<th class="align-right">実績</th>
							<th class="align-right">状態</th>
						</tr>
					</thead>
					<tbody>
						{#each projects as p (p.code)}
							<tr>
								<td class="mono">{p.code}</td>
								<td class="name-cell">{p.name}</td>
								<td>{p.owner}</td>
								<td class="align-right mono">¥{p.budget.toLocaleString('ja-JP')}</td>
								<td class="align-right mono">¥{p.spent.toLocaleString('ja-JP')}</td>
								<td class="align-right">
									<span class={`status-badge ${p.status === 'レビュー中' ? 'status-pending' : 'status-approved'}`}>{p.status}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

<style>
	.name-cell {
		font-weight: 500;
	}
</style>
