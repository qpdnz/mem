export type MasterCategory = {
	id: string;
	name: string;
	sortOrder: number;
	memo: string;
};

export function isMasterCategory(x: unknown): x is MasterCategory {
	if (!x || typeof x !== 'object') return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		typeof o.name === 'string' &&
		typeof o.sortOrder === 'number' &&
		Number.isFinite(o.sortOrder) &&
		typeof o.memo === 'string'
	);
}

/** localStorage 等から読んだ JSON 文字列を検証・復元する（純粋関数・テスト対象） */
export function parseStoredCategories(raw: string | null): MasterCategory[] {
	if (raw == null || raw === '') return [];
	try {
		const data = JSON.parse(raw) as unknown;
		if (!Array.isArray(data)) return [];
		return data.filter(isMasterCategory);
	} catch {
		return [];
	}
}

export function sortedCategories(list: MasterCategory[]): MasterCategory[] {
	return [...list].sort((a, b) => {
		if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
		return a.name.localeCompare(b.name, 'ja');
	});
}

export function addCategoryRow(
	list: MasterCategory[],
	row: Omit<MasterCategory, 'id'>,
	newId: () => string,
): MasterCategory[] {
	return [...list, { ...row, id: newId() }];
}

export function updateCategoryRow(
	list: MasterCategory[],
	id: string,
	row: Omit<MasterCategory, 'id'>,
): MasterCategory[] {
	const i = list.findIndex((c) => c.id === id);
	if (i < 0) return list;
	const next = [...list];
	next[i] = { ...row, id };
	return next;
}

export function removeCategoryRow(list: MasterCategory[], id: string): MasterCategory[] {
	return list.filter((c) => c.id !== id);
}
