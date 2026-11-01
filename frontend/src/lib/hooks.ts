import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from './api'
import { modoDemo } from './supabase'

export function useFiltros() {
  const [params, setParams] = useSearchParams()
  const get = (name: string) => params.get(name) ?? ''
  const set = (name: string, value: string | number) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === '') next.delete(name)
        else next.set(name, String(value))
        if (name !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const requestedPage = Number(get('page'))
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  return { get, set, page }
}
export function useAcciones(keys: string[]) {
  const client = useQueryClient()
  const [aviso, setAviso] = useState('')
  const ejecutar = async (
    path: string,
    body?: unknown,
    method = 'POST',
    message = 'Los cambios se guardaron correctamente.',
  ) => {
    await api(path, { method, body })
    await Promise.all(
      keys.map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    setAviso(
      modoDemo
        ? `Demostración: ${message} Los cambios se reinician al recargar.`
        : message,
    )
  }
  return { ejecutar, aviso, cerrarAviso: () => setAviso('') }
}
