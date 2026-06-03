import { browser } from '$app/environment';

const STORAGE_KEY = 'ai-web-expenses-v1';

export type ExpenseRow = {
	id: string;
	date: string;
	amountYen: number;
	description: string;
};

function isExpenseRow(x: unknown): x is ExpenseRow {
	if (!x || typeof x !== 'object') return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		typeof o.date === 'string' &&
		typeof o.amountYen === 'number' &&
		Number.isFinite(o.amountYen) &&
		typeof o.description === 'string'
	);
}

function load(): ExpenseRow[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const data = JSON.parse(raw) as unknown;
		if (!Array.isArray(data)) return [];
		return data.filter(isExpenseRow);
	} catch {
		return [];
	}
}

function persist(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses.rows));
}

/** 一覧・登録フォームはこのモジュールの関数経由で更新してください */
export const expenses = $state({
	rows: load() as ExpenseRow[],
});

export const expenseForm = $state({
	date: '',
	amountYen: '',
	description: '',
});

export function expenseTodayISO(): string {
	const d = new Date();
	return d.toISOString().slice(0, 10);
}

export function submitExpense(ev: Event): void {
	ev.preventDefault();
	const amount = Number(String(expenseForm.amountYen).replace(/,/g, ''));
	if (!Number.isFinite(amount) || amount <= 0) return;
	const date = expenseForm.date.trim() || expenseTodayISO();
	expenses.rows = [
		...expenses.rows,
		{
			id: crypto.randomUUID(),
			date,
			amountYen: Math.round(amount),
			description: expenseForm.description.trim(),
		},
	];
	persist();
	expenseForm.date = '';
	expenseForm.amountYen = '';
	expenseForm.description = '';
}

export function removeExpense(id: string): void {
	expenses.rows = expenses.rows.filter((r) => r.id !== id);
	persist();
}
