import { mount } from 'svelte';
import App from './app/App.svelte';
import { loadLocales } from './data/loader';
import { initI18n, setLang } from './i18n';
import { loadSettings } from './storage';
import { audio } from './audio';
import { settings } from './app/store';

async function boot(): Promise<void> {
  const target = document.getElementById('app');
  if (!target) throw new Error('#app not found');
  const locales = await loadLocales();
  if (locales) initI18n(locales);
  const s = loadSettings();
  setLang(s.lang);
  document.documentElement.lang = s.lang;
  settings.set(s);
  audio.setVolumes({ bgm: s.bgmVolume, se: s.seVolume, muted: s.muted });
  mount(App, { target });
}

void boot();
