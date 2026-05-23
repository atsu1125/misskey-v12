import { ref } from 'vue';
import tinycolor from 'tinycolor2';
import { globalEvents } from '@/events';

export type Theme = {
	id: string;
	name: string;
	author: string;
	desc?: string;
	base?: 'dark' | 'light';
	props: Record<string, string>;
};

import lightTheme from '@/themes/_light.json5';
import darkTheme from '@/themes/_dark.json5';

export type CompiledTheme = Record<string, string>;
const MAX_THEME_REFERENCE_DEPTH = 8;

export const themeProps = Object.keys(lightTheme.props).filter(key => !key.startsWith('X'));
export const allThemeProps = Object.keys(lightTheme.props);

export const getBuiltinThemes = () => Promise.all(
	[
		'l-light',
		'l-coffee',
		'l-apricot',
		'l-rainy',
		'l-vivid',
		'l-cherry',
		'l-sushi',
		'l-u0',

		'd-dark',
		'd-persimmon',
		'd-astro',
		'd-future',
		'd-botanical',
		'd-green-lime',
		'd-green-orange',
		'd-cherry',
		'd-ice',
		'd-u0',
	].map(name => import(`../themes/${name}.json5`).then(({ default: _default }): Theme => _default)),
);

export const getBuiltinThemesRef = () => {
	const builtinThemes = ref<Theme[]>([]);
	getBuiltinThemes().then(themes => builtinThemes.value = themes);
	return builtinThemes;
};

function getThemeReferenceColor(theme: Theme, key: string, stack: string[], depth: number): tinycolor.Instance {
	if (depth >= MAX_THEME_REFERENCE_DEPTH) {
		throw new Error('Theme reference limit exceeded');
	}

	if (stack.includes(key)) {
		throw new Error('Theme contains circular references');
	}

	const nextValue = theme.props[key];
	if (typeof nextValue !== 'string') {
		throw new Error(`Theme references missing property: ${key}`);
	}

	return getColor(theme, nextValue, [...stack, key], depth + 1);
}

function getColor(theme: Theme, val: string, stack: string[] = [], depth = 0): tinycolor.Instance {
	if (val[0] === '@') { // ref (prop)
		return getThemeReferenceColor(theme, val.substring(1), stack, depth);
	} else if (val[0] === '$') { // ref (const)
		return getThemeReferenceColor(theme, val, stack, depth);
	} else if (val[0] === ':') { // func
		if (depth >= MAX_THEME_REFERENCE_DEPTH) {
			throw new Error('Theme reference limit exceeded');
		}
		const parts = val.split('<');
		const funcTxt = parts.shift();
		const argTxt = parts.shift();

		if (funcTxt && argTxt) {
			const func = funcTxt.substring(1);
			const arg = parseFloat(argTxt);
			const color = getColor(theme, parts.join('<'), stack, depth + 1);

			switch (func) {
				case 'darken': return color.darken(arg);
				case 'lighten': return color.lighten(arg);
				case 'alpha': return color.setAlpha(arg);
				case 'hue': return color.spin(arg);
				case 'saturate': return color.saturate(arg);
			}
		}
	}

	// other case
	return tinycolor(val);
}

let timeout = null;

export function applyTheme(theme: Theme, persist = true) {
	if (timeout) window.clearTimeout(timeout);

	document.documentElement.classList.add('_themeChanging_');

	timeout = window.setTimeout(() => {
		document.documentElement.classList.remove('_themeChanging_');
	}, 1000);

	const colorSchema = theme.base === 'dark' ? 'dark' : 'light';

	// Deep copy
	const _theme = JSON.parse(JSON.stringify(theme));

	if (_theme.base) {
		const base = [lightTheme, darkTheme].find(x => x.id === _theme.base);
		if (base) _theme.props = Object.assign({}, base.props, _theme.props);
	}

	const props = compile(_theme);

	for (const tag of document.head.children) {
		if (tag.tagName === 'META' && tag.getAttribute('name') === 'theme-color') {
			tag.setAttribute('content', props['htmlThemeColor']);
			break;
		}
	}

	for (const [k, v] of Object.entries(props)) {
		document.documentElement.style.setProperty(`--${k}`, v.toString());
	}

	document.documentElement.style.setProperty('color-schema', colorSchema);

	if (persist) {
		localStorage.setItem('theme', JSON.stringify(props));
		localStorage.setItem('colorSchema', colorSchema);
	}

	// 色計算など再度行えるようにクライアント全体に通知
	globalEvents.emit('themeChanged');
}

export function compile(theme: Theme): CompiledTheme {
	const props = {} as CompiledTheme;

	for (const [k, v] of Object.entries(theme.props)) {
		if (k.startsWith('$')) continue; // ignore const

		props[k] = v.startsWith('"') ? v.replace(/^"\s*/, '') : genValue(getColor(theme, v));
	}

	return Object.fromEntries(
		Object.entries(props).filter(([key]) => allThemeProps.includes(key)),
	) as CompiledTheme;
}

function genValue(c: tinycolor.Instance): string {
	return c.toRgbString();
}

export function validateTheme(theme: Record<string, any>): boolean {
	if (theme.id == null || typeof theme.id !== 'string') return false;
	if (theme.name == null || typeof theme.name !== 'string') return false;
	if (theme.base == null || !['light', 'dark'].includes(theme.base)) return false;
	if (theme.props == null || typeof theme.props !== 'object') return false;
	return true;
}
