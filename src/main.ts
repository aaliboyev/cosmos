import { mount } from 'svelte';
import './ui/common/style.css';
import App from './orrery/ui/App.svelte';
import { startOrrery } from './orrery/scene';

startOrrery(document.getElementById('space') as HTMLCanvasElement);
mount(App, { target: document.getElementById('hud')! });
