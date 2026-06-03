<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';
	import { cost, hourlyRateYen } from '$lib/employees.svelte';

	const totalCost = $derived.by(() => cost.employees.reduce((sum, e) => sum + e.monthlyCostYen, 0));
	const avgHours = $derived.by(() => {
		if (cost.employees.length === 0) return 0;
		const total = cost.employees.reduce((sum, e) => sum + e.monthlyHours, 0);
		return Math.round((total / cost.employees.length) * 10) / 10;
	});
</script>

<svelte:head>
	<title>経費登録システム | 社員管理</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/employees" subtitle="Employee Ledger" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">社員管理</h1>
			<p class="page-subtitle">社員別の原価・稼働と時間単価を確認</p>
		</header>

		<section class="kpi-grid" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">社員数</p>
				<p class="kpi-value">{cost.employees.length}<span> 名</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">月額人件費</p>
				<p class="kpi-value mono">¥{totalCost.toLocaleString('ja-JP')}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">平均稼働時間</p>
				<p class="kpi-value">{avgHours}<span> h</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">編集画面</p>
				<p class="kpi-value"><a href="/" class="text-link">ダッシュボード</a></p>
			</article>
		</section>

		<section class="card table-card">
			<div class="card-head table-head">
				<h2 class="card-title">社員台帳</h2>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>氏名</th>
							<th>部署</th>
							<th class="align-right">月額（円）</th>
							<th class="align-right">稼働h</th>
							<th class="align-right">時間単価（円）</th>
						</tr>
					</thead>
					<tbody>
						{#each cost.employees as e (e.id)}
							<tr>
								<td class="name-cell">{e.name}</td>
								<td>{e.department || '—'}</td>
								<td class="align-right mono">¥{e.monthlyCostYen.toLocaleString('ja-JP')}</td>
								<td class="align-right mono">{e.monthlyHours}</td>
								<td class="align-right mono">{e.monthlyHours > 0 ? `¥${hourlyRateYen(e).toLocaleString('ja-JP')}` : '—'}</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="table-empty">社員データがありません。</td>
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

	.text-link {
		color: var(--blue-700);
		text-decoration: none;
	}

	.text-link:hover {
		text-decoration: underline;
	}
</style>
