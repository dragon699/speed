import { mount } from 'svelte'
import App from './App.svelte'
import { loadKey } from './lib/device'
import { readStorage } from './lib/storage'
import './theme.css'

loadKey()
document.documentElement.dataset.theme = readStorage('theme') ?? 'dark'

export default mount(App, { target: document.getElementById('app')! })
