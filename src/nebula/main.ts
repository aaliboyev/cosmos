import { mount } from 'svelte';
import '../ui/common/style.css';
import App from './ui/App.svelte';
import { startNebula } from './scene';

startNebula(document.getElementById('space') as HTMLCanvasElement);
mount(App, { target: document.getElementById('hud')! });
