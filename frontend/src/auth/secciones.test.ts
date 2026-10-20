import { describe, expect, it } from 'vitest'
import permisosDelBackend from '../../../backend/src/Paqueteria.Api/Auth/Permisos.cs?raw'
import type { Identidad, Rol } from './identidad.ts'
import { destinoInicial, seccionesAgencia, seccionesVisibles } from './secciones.ts'

const titulos = (roles: Rol[]) => seccionesVisibles(roles).map((seccion) => seccion.titulo)

describe('seccionesVisibles', () => {
  it('cada rol ve sus secciones, en el orden del menú', () => {
    expect(titulos(['ADMIN'])).toEqual(seccionesAgencia.map((seccion) => seccion.titulo))
    expect(titulos(['AGENTE'])).toEqual(['Paquetes', 'Clientes', 'Embarques', 'Facturación', 'Entregas', 'Tarifas', 'Tipo de cambio'])
    expect(titulos(['BODEGA'])).toEqual(['Paquetes', 'Clientes', 'Embarques', 'Entregas', 'Tarifas'])
    expect(titulos(['REPARTIDOR'])).toEqual(['Entregas'])
  })

  it('con varios roles ve la unión', () => {
    expect(titulos(['REPARTIDOR', 'BODEGA'])).toEqual(titulos(['BODEGA']))
    expect(titulos(['BODEGA', 'AGENTE'])).toEqual(titulos(['AGENTE']))
  })

  it('sin roles no ve ninguna', () => {
    expect(titulos([])).toEqual([])
  })
})

describe('destinoInicial', () => {
  const identidad = (tipo: Identidad['tipo'], roles: Rol[]): Identidad => ({
    tipo,
    id: 1,
    nombres: 'Ana',
    apellidos: 'López',
    correo: 'ana@agencia.test',
    roles,
    agencia: tipo === 'AGENCIA' ? { id: 1, nombre: 'Agencia de prueba', estado: 'ACTIVA' } : null,
  })

  it('lleva a cada quien a su panel', () => {
    expect(destinoInicial(identidad('PLATAFORMA', ['PLATAFORMA']))).toBe('/plataforma')
    expect(destinoInicial(identidad('AGENCIA', ['ADMIN']))).toBe('/paquetes')
    expect(destinoInicial(identidad('AGENCIA', ['REPARTIDOR']))).toBe('/entregas')
  })

  it('un empleado sin roles activos no tiene adónde ir', () => {
    expect(destinoInicial(identidad('AGENCIA', []))).toBeNull()
  })
})

// Si cambia un permiso en el backend, esta prueba avisa que hay que actualizar el menú.
describe('cada sección tiene los roles de su permiso en Auth/Permisos.cs', () => {
  const rolesPorPermiso = new Map(
    [...permisosDelBackend.matchAll(/const string (\w+) = ([^;]+);/g)].map(([, nombre, valor]) => [
      nombre,
      [...valor.matchAll(/CodigosRol\.(\w+)/g)].map(([, rol]) => rol.toUpperCase()).sort(),
    ]),
  )

  for (const seccion of seccionesAgencia) {
    it(`${seccion.titulo} (${seccion.permiso})`, () => {
      expect(rolesPorPermiso.get(seccion.permiso)).toEqual([...seccion.roles].sort())
    })
  }
})
