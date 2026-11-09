import { mount } from 'svelte'
import App from './App.svelte'
import { loadKey } from './lib/device'
import './theme.css'

loadKey()
document.documentElement.dataset.theme = localStorage.getItem('speed.theme') ?? 'dark'

export default mount(App, { target: document.getElementById('app')! })
