type AuthUser = {
	username: string;
	displayName: string;
	passwordHashHex: string;
};

type LoginResult = {
	ok: boolean;
	message: string;
};

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;
const HASH_PEPPER = 'keihi-auth-v1';

const users: AuthUser[] = [
	{
		username: 'admin',
		displayName: '管理者',
		passwordHashHex: '12072ebdd43c4c0ad3189cfdb4057b41454e8aca0e99e46878c9050604d02394',
	},
];

export const authState = $state({
	sessionToken: '',
	sessionExpiresAt: 0,
	currentUser: '' as string,
	failedAttempts: 0,
	lockUntil: 0,
});

function now(): number {
	return Date.now();
}

function toHex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return toHex(digest);
}

function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return toHex(bytes.buffer);
}

export function isLocked(): boolean {
	return authState.lockUntil > now();
}

export function lockRemainingSeconds(): number {
	const remainMs = authState.lockUntil - now();
	return remainMs > 0 ? Math.ceil(remainMs / 1000) : 0;
}

export function isAuthenticated(): boolean {
	if (!authState.sessionToken) return false;
	if (authState.sessionExpiresAt <= now()) {
		logout();
		return false;
	}
	return true;
}

export function touchSession(): void {
	if (!isAuthenticated()) return;
	authState.sessionExpiresAt = now() + SESSION_TTL_MS;
}

export function logout(): void {
	authState.sessionToken = '';
	authState.sessionExpiresAt = 0;
	authState.currentUser = '';
}

export function loginWithExternalUser(displayName: string): void {
	authState.failedAttempts = 0;
	authState.lockUntil = 0;
	authState.sessionToken = generateSessionToken();
	authState.sessionExpiresAt = now() + SESSION_TTL_MS;
	authState.currentUser = displayName.trim() || 'Microsoft User';
}

export async function login(username: string, password: string): Promise<LoginResult> {
	if (isLocked()) {
		return {
			ok: false,
			message: `試行回数が上限に達しました。${lockRemainingSeconds()}秒後に再試行してください。`,
		};
	}

	const normalizedUser = username.trim().toLowerCase();
	const account = users.find((u) => u.username === normalizedUser);
	const inputHash = await sha256Hex(`${normalizedUser}:${password}:${HASH_PEPPER}`);
	const expectedHash = account?.passwordHashHex ?? '';
	const valid = account !== undefined && safeEqual(inputHash, expectedHash);

	if (!valid) {
		authState.failedAttempts += 1;
		if (authState.failedAttempts >= MAX_ATTEMPTS) {
			authState.failedAttempts = 0;
			authState.lockUntil = now() + LOCK_MS;
		}
		return { ok: false, message: 'ユーザー名またはパスワードが正しくありません。' };
	}

	authState.failedAttempts = 0;
	authState.lockUntil = 0;
	loginWithExternalUser(account.displayName);
	return { ok: true, message: 'ログインしました。' };
}
