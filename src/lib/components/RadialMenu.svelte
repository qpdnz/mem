<script lang="ts">
	import { fade } from 'svelte/transition';

	const entries = [
		{ href: '/master', label: 'マスタ管理' },
		{ href: '/master/categories', label: '区分マスタ' },
		{ href: '/expenses', label: '経費登録' },
	] as const;

	const FAB = 56;
	const MENU_R = 168;
	/** 円心＝拡大の原点＝コンテナ右下角（FAB 扇と一致） */
	const BOX = Math.ceil(MENU_R + 24);
	const ORIGIN_X = BOX;
	const ORIGIN_Y = BOX;
	const CX = ORIGIN_X;
	const CY = ORIGIN_Y;

	/**
	 * ユーザー角（度）の範囲に扇を収める。0=左、-90=上寄り
	 * 数学角（ラジアン）へは phiMath = 180° + userDeg
	 */
	const USER_DEG_START = -90;
	const USER_DEG_END = 0;

	function userDegToMathRad(userDeg: number): number {
		return ((180 + userDeg) * Math.PI) / 180;
	}

	const ARC_START = userDegToMathRad(USER_DEG_START);
	const ARC_END = userDegToMathRad(USER_DEG_END);
	const ARC_SPAN = ARC_END - ARC_START;

	let open = $state(false);
	let scaleT = $state(0);
	let animFrame = 0;

	const n = entries.length;
	const sliceAngle = ARC_SPAN / n;

	/**
	 * 扇形パス。座標は y 下向き SVG 用（θ 増加は画面上では円周を反時計回り）。
	 * SVG の sweep=1 は時計回りなので、短い弧は delta>0 のとき sweep=0 にする。
	 */
	function piePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
		const x0 = cx + r * Math.cos(a0);
		const y0 = cy - r * Math.sin(a0);
		const x1 = cx + r * Math.cos(a1);
		const y1 = cy - r * Math.sin(a1);
		let delta = a1 - a0;
		while (delta <= -Math.PI * 2 + 1e-9) delta += Math.PI * 2;
		while (delta > Math.PI * 2 - 1e-9) delta -= Math.PI * 2;
		const large = Math.abs(delta) > Math.PI ? 1 : 0;
		const sweep = delta > 0 ? 0 : 1;
		return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1} Z`;
	}

	/** 外周の円弧だけ（一本で描いて歪み・ギザを防ぐ） */
	function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
		const x0 = cx + r * Math.cos(a0);
		const y0 = cy - r * Math.sin(a0);
		const x1 = cx + r * Math.cos(a1);
		const y1 = cy - r * Math.sin(a1);
		let delta = a1 - a0;
		while (delta <= -Math.PI * 2 + 1e-9) delta += Math.PI * 2;
		while (delta > Math.PI * 2 - 1e-9) delta -= Math.PI * 2;
		const large = Math.abs(delta) > Math.PI ? 1 : 0;
		const sweep = delta > 0 ? 0 : 1;
		return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
	}

	function labelAt(i: number): { x: number; y: number } {
		const mid = ARC_START + (i + 0.5) * sliceAngle;
		const rr = MENU_R * 0.52;
		return {
			x: CX + rr * Math.cos(mid),
			y: CY - rr * Math.sin(mid),
		};
	}

	/** 弧の接線に沿った回転角（度） */
	function tangentRotateDeg(mid: number): number {
		const tx = -Math.sin(mid);
		const ty = -Math.cos(mid);
		let deg = (Math.atan2(ty, tx) * 180) / Math.PI;
		if (deg > 90) deg -= 180;
		else if (deg < -90) deg += 180;
		return deg;
	}

	function labelRotateDeg(i: number): number {
		return tangentRotateDeg(ARC_START + (i + 0.5) * sliceAngle);
	}

	/** トグル扇の中心角（メニューと同じ 90° 扇） */
	const FAB_MID = ARC_START + ARC_SPAN / 2;
	const FAB_ICON_R = FAB * 0.38;
	const FAB_ICON_X = FAB + FAB_ICON_R * Math.cos(FAB_MID);
	const FAB_ICON_Y = FAB - FAB_ICON_R * Math.sin(FAB_MID);
	const FAB_ICON_ROT = tangentRotateDeg(FAB_MID);

	function animateSector(to: number) {
		cancelAnimationFrame(animFrame);
		const from = scaleT;
		const start = performance.now();
		const duration = 300;
		function tick(now: number) {
			const t = Math.min(1, (now - start) / duration);
			const e = 1 - (1 - t) ** 3;
			scaleT = from + (to - from) * e;
			if (t < 1) animFrame = requestAnimationFrame(tick);
		}
		animFrame = requestAnimationFrame(tick);
	}

	function toggle() {
		open = !open;
		animateSector(open ? 1 : 0);
	}

	function close() {
		open = false;
		animateSector(0);
	}
</script>

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-40 cursor-default bg-black/45 backdrop-blur-[2px] transition-opacity"
		transition:fade={{ duration: 180 }}
		aria-label="メニューを閉じる"
		onclick={close}
	></button>
{/if}

<div class="pointer-events-none fixed bottom-0 right-0 z-50 flex p-4 sm:p-6">
	<div class="pointer-events-auto relative" style:width="{BOX}px" style:height="{BOX}px">
		{#if scaleT > 0.001}
			<!-- 扇とラベルを同じ transform-origin でだけ拡縮（数式の二重適用を防ぐ） -->
			<div
				class="absolute inset-0 z-[1]"
				style:transform="scale({scaleT})"
				style:transform-origin="{ORIGIN_X}px {ORIGIN_Y}px"
			>
				<svg
					class="absolute left-0 top-0 block overflow-visible"
					width={BOX}
					height={BOX}
					shape-rendering="geometricPrecision"
					aria-hidden="true"
				>
					{#each entries as item, i (item.href)}
						{@const a0 = ARC_START + i * sliceAngle}
						{@const a1 = ARC_START + (i + 1) * sliceAngle}
						<a href={item.href} class="slice" onclick={close} aria-label={item.label}>
							<path
								class="slice-path"
								d={piePath(CX, CY, MENU_R, a0, a1)}
								fill={i % 2 === 0 ? 'rgb(15 23 42 / 0.98)' : 'rgb(30 41 59 / 0.98)'}
								stroke="none"
							/>
						</a>
					{/each}
					<path
						d={arcPath(CX, CY, MENU_R, ARC_START, ARC_END)}
						fill="none"
						stroke="rgb(16 185 129 / 0.9)"
						stroke-width="2"
						stroke-linecap="round"
					/>
					{#each Array.from({ length: n + 1 }, (_, i) => i) as i (i)}
						{@const a = ARC_START + i * sliceAngle}
						<line
							x1={CX}
							y1={CY}
							x2={CX + MENU_R * Math.cos(a)}
							y2={CY - MENU_R * Math.sin(a)}
							stroke="rgb(255 255 255 / 0.18)"
							stroke-width="1"
						/>
					{/each}
				</svg>

				<div class="pointer-events-none absolute inset-0">
					{#each entries as item, i (item.href)}
						{@const pos = labelAt(i)}
						{@const rot = labelRotateDeg(i)}
						<span
							class="slice-label absolute text-center text-xs font-semibold tracking-tight"
							style:left="{pos.x}px"
							style:top="{pos.y}px"
							style:transform="translate(-50%, -50%) rotate({rot}deg)"
							style:color="#f8fafc"
							style:text-shadow="0 1px 2px rgb(0 0 0 / 0.75), 0 0 1px rgb(0 0 0 / 0.9)"
						>
							{item.label}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<button
			type="button"
			class="absolute bottom-0 right-0 z-[2] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
			style:width="{FAB}px"
			style:height="{FAB}px"
			aria-expanded={open}
			aria-haspopup="true"
			aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
			onclick={toggle}
		>
			<svg
				class="block drop-shadow-lg"
				width={FAB}
				height={FAB}
				viewBox="0 0 {FAB} {FAB}"
				aria-hidden="true"
			>
				<path
					d={piePath(FAB, FAB, FAB, ARC_START, ARC_END)}
					class="fill-emerald-600 stroke-emerald-400/55 transition-colors hover:fill-emerald-500"
					stroke-width="1.5"
				/>
				<g transform="translate({FAB_ICON_X} {FAB_ICON_Y}) rotate({FAB_ICON_ROT})">
					<g transform="translate(-12 -12)">
						<g transform="rotate({open ? 45 : 0} 12 12)" class="transition-transform duration-200">
							<svg width="24" height="24" viewBox="0 0 24 24">
								<path
									d="M12 5v14M5 12h14"
									fill="none"
									stroke="white"
									stroke-width="2.2"
									stroke-linecap="round"
								/>
							</svg>
						</g>
					</g>
				</g>
			</svg>
		</button>
	</div>
</div>

<style>
	.slice {
		outline: none;
	}
	.slice-path {
		transition: filter 0.15s ease;
	}
	.slice:hover .slice-path,
	.slice:focus-visible .slice-path {
		filter: brightness(1.15);
	}
	.slice-label {
		pointer-events: none;
	}
</style>
