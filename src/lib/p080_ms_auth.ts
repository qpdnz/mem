import { PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser';

let app: PublicClientApplication | null = null;

function getClientId(): string {
	return (import.meta.env.VITE_MS_CLIENT_ID ?? '').trim();
}

function getAuthority(): string {
	const tenant = (import.meta.env.VITE_MS_TENANT_ID ?? 'common').trim();
	return `https://login.microsoftonline.com/${tenant}`;
}

async function getApp(): Promise<PublicClientApplication> {
	if (app) return app;
	const clientId = getClientId();
	if (!clientId) {
		throw new Error('VITE_MS_CLIENT_ID が未設定です。');
	}
	app = new PublicClientApplication({
		auth: {
			clientId,
			authority: getAuthority(),
			redirectUri: window.location.origin
		},
		cache: {
			cacheLocation: 'sessionStorage'
		}
	});
	await app.initialize();
	return app;
}

export async function loginWithMicrosoft(): Promise<AuthenticationResult> {
	const msal = await getApp();
	return msal.loginPopup({
		scopes: ['openid', 'profile', 'email']
	});
}
