<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';
	import {
		addEmployee,
		cost,
		hourlyRateYen,
		removeEmployee,
		sumMonthlyCostYen,
		updateEmployee,
		type Employee,
	} from '$lib/employees.svelte';

	let form = $state({
		name: '',
		department: '',
		monthlyCostYen: '',
		monthlyHours: '',
		memo: '',
	});

	let editingId = $state<string | null>(null);

	function parseYen(s: string): number {
		const n = Number(String(s).replace(/,/g, ''));
		return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
	}

	function parseHours(s: string): number {
		const n = Number(String(s).replace(/,/g, ''));
		return Number.isFinite(n) ? Math.max(0, n) : 0;
	}

	function rowFromForm(): Omit<Employee, 'id'> {
		return {
			name: form.name.trim(),
			department: form.department.trim(),
			monthlyCostYen: parseYen(form.monthlyCostYen),
			monthlyHours: parseHours(form.monthlyHours),
			memo: form.memo.trim(),
		};
	}

	function resetForm() {
		form = { name: '', department: '', monthlyCostYen: '', monthlyHours: '', memo: '' };
		editingId = null;
	}

	function submit() {
		const row = rowFromForm();
		if (!row.name) return;
		if (editingId) updateEmployee(editingId, row);
		else addEmployee(row);
		resetForm();
	}

	function startEdit(e: Employee) {
		editingId = e.id;
		form = {
			name: e.name,
			department: e.department,
			monthlyCostYen: String(e.monthlyCostYen),
			monthlyHours: String(e.monthlyHours),
			memo: e.memo,
		};
	}

	function statusForEmployee(e: Employee): { label: string; className: string } {
		if (e.monthlyHours >= 160) return { label: '承認済み', className: 'status-approved' };
		if (e.monthlyHours > 0) return { label: '申請中', className: 'status-pending' };
		return { label: '下書き', className: 'status-draft' };
	}

	const totalYen = $derived(sumMonthlyCostYen(cost.employees));
	const totalHours = $derived.by(() => cost.employees.reduce((sum, e) => sum + e.monthlyHours, 0));
	const averageHourlyYen = $derived.by(() =>
		totalHours > 0 ? Math.round(totalYen / totalHours) : 0
	);
	const deptTotals = $derived.by(() => {
		const m = new Map<string, number>();
		for (const e of cost.employees) {
			const key = e.department || '未設定';
			m.set(key, (m.get(key) ?? 0) + e.monthlyCostYen);
		}
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	});
	const topDepartment = $derived.by(() => deptTotals[0]?.[0] ?? '未設定');
</script>

<svelte:head>
	<title>経費登録システム | ダッシュボード</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/" subtitle="Design System" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">ダッシュボード</h1>
			<p class="page-subtitle">社員原価・時間単価を統合管理します</p>
		</header>

		<section class="kpi-grid" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">登録人数</p>
				<p class="kpi-value">{cost.employees.length}<span> 名</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">合計月額人件費</p>
				<p class="kpi-value mono">¥{totalYen.toLocaleString('ja-JP')}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">平均時間単価</p>
				<p class="kpi-value mono">{averageHourlyYen > 0 ? `¥${averageHourlyYen.toLocaleString('ja-JP')}` : '—'}</p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">最大コスト部署</p>
				<p class="kpi-value">{topDepartment}</p>
			</article>
		</section>

		<div class="split-grid">
			<section class="card">
				<div class="card-head">
					<h2 class="card-title">{editingId ? '社員情報を編集' : '社員情報を追加'}</h2>
					<p class="card-note">必須項目を入力して登録</p>
				</div>
				<form
					class="form-grid"
					onsubmit={(ev) => {
						ev.preventDefault();
						submit();
					}}
				>
					<label class="field">
						<span>氏名 <em>*</em></span>
						<input bind:value={form.name} placeholder="山田 太郎" required autocomplete="name" />
					</label>
					<label class="field">
						<span>部署</span>
						<input bind:value={form.department} placeholder="開発部" />
					</label>
					<label class="field">
						<span>月額人件費（円）</span>
						<input bind:value={form.monthlyCostYen} inputmode="numeric" placeholder="500000" />
					</label>
					<label class="field">
						<span>月間稼働時間（h）</span>
						<input bind:value={form.monthlyHours} inputmode="decimal" placeholder="160" />
					</label>
					<label class="field full">
						<span>メモ</span>
						<input bind:value={form.memo} placeholder="案件按分・備考など" />
					</label>
					<div class="form-actions full">
						<button type="submit" class="btn btn-primary">{editingId ? '保存する' : '追加する'}</button>
						{#if editingId}
							<button type="button" class="btn btn-secondary" onclick={resetForm}>キャンセル</button>
						{/if}
					</div>
				</form>
			</section>

			<section class="card">
				<div class="card-head">
					<h2 class="card-title">部署別 月額合計</h2>
				</div>
				<ul class="dept-list">
					{#if deptTotals.length > 0}
						{#each deptTotals as [dept, yen] (dept)}
							<li>
								<span>{dept}</span>
								<strong class="mono">¥{yen.toLocaleString('ja-JP')}</strong>
							</li>
						{/each}
					{:else}
						<li class="empty">データがありません</li>
					{/if}
				</ul>
			</section>
		</div>

		<section class="card table-card">
			<div class="card-head table-head">
				<h2 class="card-title">社員一覧</h2>
				<p class="card-note">編集・削除は操作列から実行</p>
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
							<th>状態</th>
							<th>メモ</th>
							<th class="align-right">操作</th>
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
								<td>
									<span class={`status-badge ${statusForEmployee(e).className}`}>{statusForEmployee(e).label}</span>
								</td>
								<td class="memo" title={e.memo}>{e.memo || '—'}</td>
								<td class="align-right actions">
									<button type="button" class="text-btn" onclick={() => startEdit(e)}>編集</button>
									<span class="sep">/</span>
									<button
										type="button"
										class="text-btn danger"
										onclick={() => {
											if (confirm(`「${e.name}」を削除しますか？`)) removeEmployee(e.id);
										}}
									>
										削除
									</button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="8" class="table-empty">データがありません。上のフォームから追加してください。</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

<style>
	.split-grid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 12px;
		margin-bottom: 12px;
	}

	.name-cell {
		font-weight: 500;
	}

	.memo {
		max-width: 220px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--gray-600);
	}

	.actions {
		white-space: nowrap;
	}

	.sep {
		margin: 0 6px;
		color: var(--gray-300);
	}

	.dept-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}

	.dept-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--gray-50);
		border: 1px solid var(--gray-200);
	}

	.dept-list li.empty {
		justify-content: center;
		color: var(--gray-500);
	}

	@media (max-width: 1120px) {
		.split-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
