import { mount } from 'svelte';
import App from './app/App.svelte';
import { loadLocales } from './data/loader';
import { initI18n, setLang } from './i18n';
import { loadSettings } from './storage';
import { audio } from './audio';
import { settings } from './app/store';

const LOAD_ERROR = '読み込めませんでした。再読み込みしてください / Failed to load. Please reload the page.';

let mounted = false;

/** mount 前に起きた失敗でも、真っ白にせず静的な案内を出す */
function showLoadError(): void {
  if (mounted) return;
  const target = document.getElementById('app');
  if (!target) return;
  target.textContent = LOAD_ERROR;
}

// App の例外境界は mount 後にしか効かない。起動中の例外はここで拾う
if (typeof window !== 'undefined') {
  window.addEventListener('error', showLoadError);
  window.addEventListener('unhandledrejection', showLoadError);
}

async function boot(): Promise<void> {
  const target = document.getElementById('app');
  if (!target) throw new Error('#app not found');
  const locales = await loadLocales();
  if (locales) initI18n(locales);
  const s = loadSettings();
  // 描画前に配色を決める（ダーク設定なら初期表示から暗くする）
  document.documentElement.dataset.theme = s.theme;
  setLang(s.lang);
  document.documentElement.lang = s.lang;
  settings.set(s);
  audio.setVolumes({ bgm: s.bgmVolume, se: s.seVolume, muted: s.muted });
  mount(App, { target });
  mounted = true;
}

void boot().catch(showLoadError);
