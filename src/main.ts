import { mount } from 'svelte';
import App from './app/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');
export default mount(App, { target });
