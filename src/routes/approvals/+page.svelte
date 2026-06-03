<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';

	let approvals = $state([
		{ id: 'AP-2201', applicant: '山田 太郎', category: '旅費交通費', amount: 18400, status: '申請中', date: '2026-04-24' },
		{ id: 'AP-2202', applicant: '佐藤 花子', category: '備品費', amount: 9200, status: '申請中', date: '2026-04-24' },
		{ id: 'AP-2203', applicant: '鈴木 一郎', category: '外注費', amount: 125000, status: '却下', date: '2026-04-23' },
	]);

	const pendingCount = $derived.by(() => approvals.filter((x) => x.status === '申請中').length);
	const rejectedCount = $derived.by(() => approvals.filter((x) => x.status === '却下').length);

	function approve(id: string) {
		approvals = approvals.map((a) => (a.id === id ? { ...a, status: '承認済み' } : a));
	}

	function reject(id: string) {
		approvals = approvals.map((a) => (a.id === id ? { ...a, status: '却下' } : a));
	}
</script>

<svelte:head>
	<title>経費登録システム | 承認ワークフロー</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/approvals" subtitle="Approval Flow" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">承認ワークフロー</h1>
			<p class="page-subtitle">経費申請の承認・却下を実施</p>
		</header>

		<section class="kpi-grid kpi-3" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">申請総数</p>
				<p class="kpi-value">{approvals.length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">承認待ち</p>
				<p class="kpi-value">{pendingCount}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">却下</p>
				<p class="kpi-value">{rejectedCount}<span> 件</span></p>
			</article>
		</section>

		<section class="card table-card">
			<div class="card-head table-head">
				<h2 class="card-title">承認待ち一覧</h2>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>ID</th>
							<th>申請者</th>
							<th>区分</th>
							<th class="align-right">金額（円）</th>
							<th>申請日</th>
							<th>状態</th>
							<th class="align-right">操作</th>
						</tr>
					</thead>
					<tbody>
						{#each approvals as a (a.id)}
							<tr>
								<td class="mono">{a.id}</td>
								<td class="name-cell">{a.applicant}</td>
								<td>{a.category}</td>
								<td class="align-right mono">¥{a.amount.toLocaleString('ja-JP')}</td>
								<td class="mono">{a.date}</td>
								<td>
									<span
										class={`status-badge ${a.status === '承認済み' ? 'status-approved' : a.status === '却下' ? 'status-rejected' : 'status-pending'}`}
									>
										{a.status}
									</span>
								</td>
								<td class="align-right actions">
									{#if a.status === '申請中'}
										<button type="button" class="text-btn" onclick={() => approve(a.id)}>承認</button>
										<span class="sep">/</span>
										<button type="button" class="text-btn danger" onclick={() => reject(a.id)}>却下</button>
									{:else}
										<span class="done">完了</span>
									{/if}
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
	.kpi-3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.name-cell {
		font-weight: 500;
	}

	.actions {
		white-space: nowrap;
	}

	.sep {
		margin: 0 6px;
		color: var(--gray-300);
	}

	.done {
		font-size: 12px;
		color: var(--gray-500);
	}

	@media (max-width: 720px) {
		.kpi-3 {
			grid-template-columns: 1fr;
		}
	}
</style>
