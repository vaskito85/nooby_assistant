import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Caras } from './Caras'
import { Panel } from './Panel'
import './estilos.css'

// `/#/panel` = panel de ajustes (en la PC). Cualquier otra cosa = la cara (en el celu).
const esPanel = location.hash.startsWith('#/panel')
const esCaras = location.hash.startsWith('#/caras') // galería de expresiones

createRoot(document.getElementById('root')!).render(<StrictMode>{esPanel ? <Panel /> : esCaras ? <Caras /> : <App />}</StrictMode>)
