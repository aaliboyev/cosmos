import { mount } from 'svelte';
import './ui/style.css';
import App from './ui/App.svelte';
import { startOrrery } from './orrery/scene';

startOrrery(document.getElementById('space') as HTMLCanvasElement);
mount(App, { target: document.getElementById('hud')! });
