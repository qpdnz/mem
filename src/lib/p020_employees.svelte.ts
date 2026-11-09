import { browser } from '$app/environment';

const STORAGE_KEY = 'ai-web-employee-costs-v1';

export type Employee = {
	id: string;
	name: string;
	department: string;
	monthlyCostYen: number;
	monthlyHours: number;
	memo: string;
};

function isEmployee(x: unknown): x is Employee {
	if (!x || typeof x !== 'object') return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		typeof o.name === 'string' &&
		typeof o.department === 'string' &&
		typeof o.monthlyCostYen === 'number' &&
		Number.isFinite(o.monthlyCostYen) &&
		typeof o.monthlyHours === 'number' &&
		Number.isFinite(o.monthlyHours) &&
		typeof o.memo === 'string'
	);
}

function load(): Employee[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const data = JSON.parse(raw) as unknown;
		if (!Array.isArray(data)) return [];
		return data.filter(isEmployee);
	} catch {
		return [];
	}
}

/** 一覧は `cost.employees` として参照し、配列は下記の関数でだけ変更してください */
export const cost = $state({
	employees: load() as Employee[],
});

function persist(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(cost.employees));
}

export function hourlyRateYen(e: Employee): number {
	if (e.monthlyHours <= 0) return 0;
	return Math.round(e.monthlyCostYen / e.monthlyHours);
}

export function sumMonthlyCostYen(list: Employee[]): number {
	return list.reduce((acc, e) => acc + e.monthlyCostYen, 0);
}

export function addEmployee(row: Omit<Employee, 'id'>): void {
	cost.employees.push({ ...row, id: crypto.randomUUID() });
	persist();
}

export function updateEmployee(id: string, row: Omit<Employee, 'id'>): void {
	const i = cost.employees.findIndex((e) => e.id === id);
	if (i >= 0) cost.employees[i] = { ...row, id };
	persist();
}

export function removeEmployee(id: string): void {
	const i = cost.employees.findIndex((e) => e.id === id);
	if (i >= 0) cost.employees.splice(i, 1);
	persist();
}
