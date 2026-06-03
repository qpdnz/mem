<script lang="ts">
	import KeihiSidebar from '$lib/components/KeihiSidebar.svelte';
	import {
		addMasterCategory,
		categoryMaster,
		removeMasterCategory,
		updateMasterCategory,
	} from '$lib/masterCategories.svelte';
	import { sortedCategories, type MasterCategory } from '$lib/masterCategories';

	let form = $state({
		name: '',
		sortOrder: '',
		memo: '',
	});
	let editingId = $state<string | null>(null);

	function parseSortOrder(s: string): number {
		const n = Number(String(s).replace(/,/g, ''));
		return Number.isFinite(n) ? Math.trunc(n) : 0;
	}

	function rowFromForm(): Omit<MasterCategory, 'id'> {
		return {
			name: form.name.trim(),
			sortOrder: parseSortOrder(form.sortOrder),
			memo: form.memo.trim(),
		};
	}

	function resetForm() {
		form = { name: '', sortOrder: '', memo: '' };
		editingId = null;
	}

	function submit() {
		const row = rowFromForm();
		if (!row.name) return;
		if (editingId) updateMasterCategory(editingId, row);
		else addMasterCategory(row);
		resetForm();
	}

	function startEdit(c: MasterCategory) {
		editingId = c.id;
		form = { name: c.name, sortOrder: String(c.sortOrder), memo: c.memo };
	}

	const displayRows = $derived(sortedCategories(categoryMaster.rows));
	const highestPriority = $derived.by(() => {
		if (displayRows.length === 0) return '—';
		return `${displayRows[0].name} (${displayRows[0].sortOrder})`;
	});
</script>

<svelte:head>
	<title>経費登録システム | 区分マスタ</title>
</svelte:head>

<div class="keihi-app">
	<KeihiSidebar currentPath="/master" subtitle="Category Master" />

	<div class="workspace">
		<header class="page-header">
			<h1 class="page-title">区分マスタ</h1>
			<p class="page-subtitle"><a href="/master" class="crumb">マスタ管理</a> / 経費・集計で使う区分の管理</p>
		</header>

		<section class="kpi-grid kpi-2" aria-label="KPI">
			<article class="kpi-card">
				<p class="kpi-label">登録区分数</p>
				<p class="kpi-value">{displayRows.length}<span> 件</span></p>
			</article>
			<article class="kpi-card">
				<p class="kpi-label">先頭表示区分</p>
				<p class="kpi-value mono small">{highestPriority}</p>
			</article>
		</section>

		<section class="card">
			<div class="card-head">
				<h2 class="card-title">{editingId ? '区分を編集' : '区分を追加'}</h2>
			</div>
			<form
				class="form-grid"
				onsubmit={(ev) => {
					ev.preventDefault();
					submit();
				}}
			>
				<label class="field">
					<span>区分名 <em>*</em></span>
					<input bind:value={form.name} placeholder="例: 旅費交通費" required />
				</label>
				<label class="field">
					<span>表示順（小さいほど上）</span>
					<input bind:value={form.sortOrder} inputmode="numeric" placeholder="0" />
				</label>
				<label class="field full">
					<span>メモ</span>
					<input bind:value={form.memo} placeholder="補足・用途など" />
				</label>
				<div class="form-actions full">
					<button type="submit" class="btn btn-primary">{editingId ? '保存する' : '追加する'}</button>
					{#if editingId}
						<button type="button" class="btn btn-secondary" onclick={resetForm}>キャンセル</button>
					{/if}
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
							<th class="align-right">表示順</th>
							<th>区分名</th>
							<th>メモ</th>
							<th class="align-right">操作</th>
						</tr>
					</thead>
					<tbody>
						{#each displayRows as c (c.id)}
							<tr>
								<td class="align-right mono">{c.sortOrder}</td>
								<td class="name-cell">{c.name}</td>
								<td class="memo" title={c.memo}>{c.memo || '—'}</td>
								<td class="align-right actions">
									<button type="button" class="text-btn" onclick={() => startEdit(c)}>編集</button>
									<span class="sep">/</span>
									<button
										type="button"
										class="text-btn danger"
										onclick={() => {
											if (confirm(`「${c.name}」を削除しますか？`)) removeMasterCategory(c.id);
										}}
									>
										削除
									</button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="table-empty">区分がありません。上のフォームから追加してください。</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

<style>
	.crumb {
		color: var(--blue-700);
		text-decoration: none;
	}

	.crumb:hover {
		text-decoration: underline;
	}

	.kpi-2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.kpi-value.small {
		font-size: 15px;
	}

	.name-cell {
		font-weight: 500;
	}

	.memo {
		max-width: 300px;
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

	@media (max-width: 720px) {
		.kpi-2 {
			grid-template-columns: 1fr;
		}
	}
</style>
