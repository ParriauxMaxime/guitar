import './styles/base.css'
import './styles/toolbar.css'
import './styles/neck.css'
import './styles/settings.css'
import './pwa'
import { startApp } from './app'

const root = document.querySelector<HTMLElement>('#app')
if (root) startApp(root)
