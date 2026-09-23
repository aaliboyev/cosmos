import { mount } from 'svelte';
import '../ui/common/style.css';
import App from './ui/App.svelte';
import { startAccretion } from './scene';

startAccretion(document.getElementById('space') as HTMLCanvasElement);
mount(App, { target: document.getElementById('hud')! });
