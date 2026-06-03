import { browser } from '$app/environment';
import {
	addCategoryRow,
	parseStoredCategories,
	removeCategoryRow,
	updateCategoryRow,
	type MasterCategory,
} from './masterCategories';

const STORAGE_KEY = 'ai-web-master-categories-v1';

function load(): MasterCategory[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return parseStoredCategories(raw);
	} catch {
		return [];
	}
}

function persist(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(categoryMaster.rows));
}

/** 区分マスタ一覧。変更は下記の関数経由で行ってください */
export const categoryMaster = $state({
	rows: load() as MasterCategory[],
});

export function addMasterCategory(row: Omit<MasterCategory, 'id'>): void {
	categoryMaster.rows = addCategoryRow(categoryMaster.rows, row, () => crypto.randomUUID());
	persist();
}

export function updateMasterCategory(id: string, row: Omit<MasterCategory, 'id'>): void {
	categoryMaster.rows = updateCategoryRow(categoryMaster.rows, id, row);
	persist();
}

export function removeMasterCategory(id: string): void {
	categoryMaster.rows = removeCategoryRow(categoryMaster.rows, id);
	persist();
}
