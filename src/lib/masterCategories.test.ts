import { describe, expect, it } from 'vitest';
import {
	addCategoryRow,
	isMasterCategory,
	parseStoredCategories,
	removeCategoryRow,
	sortedCategories,
	updateCategoryRow,
	type MasterCategory,
} from './masterCategories';

describe('isMasterCategory', () => {
	it('有効な区分オブジェクトを認める', () => {
		const row: MasterCategory = {
			id: 'a',
			name: '交通費',
			sortOrder: 0,
			memo: '',
		};
		expect(isMasterCategory(row)).toBe(true);
	});

	it('不正な型を拒否する', () => {
		expect(isMasterCategory(null)).toBe(false);
		expect(isMasterCategory({})).toBe(false);
		expect(isMasterCategory({ id: 1, name: 'x', sortOrder: 0, memo: '' })).toBe(false);
		expect(isMasterCategory({ id: 'a', name: 'x', sortOrder: NaN, memo: '' })).toBe(false);
	});
});

describe('parseStoredCategories', () => {
	it('null や空は空配列', () => {
		expect(parseStoredCategories(null)).toEqual([]);
	});

	it('壊れた JSON は空配列', () => {
		expect(parseStoredCategories('{')).toEqual([]);
	});

	it('配列以外は空配列', () => {
		expect(parseStoredCategories('{}')).toEqual([]);
	});

	it('有効な行だけ残す', () => {
		const raw = JSON.stringify([
			{ id: '1', name: 'A', sortOrder: 2, memo: 'm' },
			{ id: '2', name: 'B' },
			{ id: '3', name: 'C', sortOrder: 1, memo: '' },
		]);
		expect(parseStoredCategories(raw)).toEqual([
			{ id: '1', name: 'A', sortOrder: 2, memo: 'm' },
			{ id: '3', name: 'C', sortOrder: 1, memo: '' },
		]);
	});
});

describe('sortedCategories', () => {
	it('sortOrder 昇順、同値は名前（ja）で整列', () => {
		const list: MasterCategory[] = [
			{ id: 'b', name: 'い', sortOrder: 1, memo: '' },
			{ id: 'a', name: 'あ', sortOrder: 1, memo: '' },
			{ id: 'c', name: 'う', sortOrder: 0, memo: '' },
		];
		expect(sortedCategories(list).map((x) => x.id)).toEqual(['c', 'a', 'b']);
	});
});

describe('addCategoryRow', () => {
	it('新しい行を末尾に追加する', () => {
		const base: MasterCategory[] = [{ id: 'x', name: 'X', sortOrder: 0, memo: '' }];
		const next = addCategoryRow(base, { name: 'Y', sortOrder: 1, memo: 'm' }, () => 'new-id');
		expect(next).toEqual([
			{ id: 'x', name: 'X', sortOrder: 0, memo: '' },
			{ id: 'new-id', name: 'Y', sortOrder: 1, memo: 'm' },
		]);
		expect(base).toHaveLength(1);
	});
});

describe('updateCategoryRow', () => {
	it('id が一致する行を置き換える', () => {
		const list: MasterCategory[] = [
			{ id: 'a', name: 'A', sortOrder: 0, memo: '' },
			{ id: 'b', name: 'B', sortOrder: 1, memo: '' },
		];
		expect(updateCategoryRow(list, 'b', { name: 'B2', sortOrder: 9, memo: 'z' })).toEqual([
			{ id: 'a', name: 'A', sortOrder: 0, memo: '' },
			{ id: 'b', name: 'B2', sortOrder: 9, memo: 'z' },
		]);
	});

	it('存在しない id では元の配列を返す', () => {
		const list: MasterCategory[] = [{ id: 'a', name: 'A', sortOrder: 0, memo: '' }];
		expect(updateCategoryRow(list, 'z', { name: 'Z', sortOrder: 0, memo: '' })).toEqual(list);
	});
});

describe('removeCategoryRow', () => {
	it('指定 id を除く', () => {
		const list: MasterCategory[] = [
			{ id: 'a', name: 'A', sortOrder: 0, memo: '' },
			{ id: 'b', name: 'B', sortOrder: 1, memo: '' },
		];
		expect(removeCategoryRow(list, 'a')).toEqual([{ id: 'b', name: 'B', sortOrder: 1, memo: '' }]);
	});
});
