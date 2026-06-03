<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';
	import { expenseForm, expenses, removeExpense, submitExpense } from '$lib/expenses.svelte';

	const totalYen = $derived.by(() => expenses.rows.reduce((sum, row) => sum + row.amountYen, 0));
	const latestDate = $derived.by(() => {
		if (expenses.rows.length === 0) return '—';
		return [...expenses.rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? '—';
	});
	const avgYen = $derived.by(() =>
		expenses.rows.length > 0 ? Math.round(totalYen / expenses.rows.length) : 0
	);
</script>

<svelte:head>
	<title>経費登録システム | 経費登録</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/expenses" subtitle="Expense System" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">経費登録</h1>
			<p class="page-subtitle">日次の経費申請を登録し、一覧で金額を管理します</p>
		</header>

		<section class="kpi-grid" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">登録件数</p>
				<p class="kpi-value">{expenses.rows.length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">合計金額</p>
				<p class="kpi-value mono">¥{totalYen.toLocaleString('ja-JP')}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">平均単価</p>
				<p class="kpi-value mono">{avgYen > 0 ? `¥${avgYen.toLocaleString('ja-JP')}` : '—'}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">最新登録日</p>
				<p class="kpi-value mono">{latestDate}</p>
			</article>
		</section>

		<section class="card">
			<div class="card-head">
				<h2 class="card-title">新規登録</h2>
				<p class="card-note">必須情報を入力して登録</p>
			</div>
			<form class="form-grid" onsubmit={submitExpense}>
				<label class="field">
					<span>日付</span>
					<input type="date" bind:value={expenseForm.date} />
				</label>
				<label class="field">
					<span>金額（円）</span>
					<input inputmode="numeric" bind:value={expenseForm.amountYen} placeholder="3000" />
				</label>
				<label class="field full">
					<span>内容</span>
					<input bind:value={expenseForm.description} placeholder="交通費・備品など" />
				</label>
				<div class="form-actions full">
					<button type="submit" class="btn btn-primary">登録する</button>
				</div>
			</form>
		</section>

		<section class="card table-card">
			<div class="card-head table-head">
				<h2 class="card-title">登録一覧</h2>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>日付</th>
							<th class="align-right">金額（円）</th>
							<th>内容</th>
							<th class="align-right">操作</th>
						</tr>
					</thead>
					<tbody>
						{#each expenses.rows as r (r.id)}
							<tr>
								<td class="mono">{r.date}</td>
								<td class="align-right mono">¥{r.amountYen.toLocaleString('ja-JP')}</td>
								<td class="memo" title={r.description}>{r.description || '—'}</td>
								<td class="align-right actions">
									<button
										type="button"
										class="text-btn danger"
										onclick={() => {
											if (confirm('この行を削除しますか？')) removeExpense(r.id);
										}}
									>
										削除
									</button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="table-empty">経費がありません。</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

<style>
	.memo {
		max-width: 360px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--gray-600);
	}

	.actions {
		white-space: nowrap;
	}
</style>
