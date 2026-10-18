import { createBrowserRouter } from 'react-router'
import Inicio from './pages/Inicio.tsx'
import NoEncontrada from './pages/NoEncontrada.tsx'

export const router = createBrowserRouter([
  { path: '/', Component: Inicio },
  { path: '*', Component: NoEncontrada },
])
