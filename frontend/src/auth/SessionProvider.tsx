import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { supabase, modoDemo } from '../lib/supabase'
import { api } from '../lib/api'
import { ErrorApi } from '../lib/api-error'
import { SesionContext } from './session'
import type { Identidad, Rol } from '../types'

const datosDeNegocio = {
  predicate: (query: Query) => query.queryKey[0] !== 'identidad',
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [auth, setAuth] = useState<{ ready: boolean; id: string | null }>({
    ready: modoDemo || !supabase,
    id: modoDemo ? sessionStorage.getItem('paqueteo:demo-rol') : null,
  })
  const [errorSesion, setErrorSesion] = useState<unknown>(null)
  const sessionId = useRef<string | null>(null)
  const alcance = useRef<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Sin llamadas asíncronas dentro de este callback: Supabase mantiene su bloqueo de sesión.
      const id = session?.user.id ?? null
      if (sessionId.current !== id) {
        void queryClient.cancelQueries()
        queryClient.clear()
        alcance.current = null
      }
      sessionId.current = id
      setAuth({ ready: true, id })
    })
    return () => subscription.unsubscribe()
  }, [queryClient])
  useEffect(() => {
    const expired = () => {
      void queryClient.cancelQueries()
      queryClient.clear()
      sessionId.current = null
      alcance.current = null
      setAuth({ ready: true, id: null })
      setErrorSesion(null)
      void supabase?.auth.signOut({ scope: 'local' })
    }
    const revalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['identidad'] })
    }
    window.addEventListener('paqueteo:sesion-vencida', expired)
    window.addEventListener('paqueteo:revalidar-acceso', revalidate)
    return () => {
      window.removeEventListener('paqueteo:sesion-vencida', expired)
      window.removeEventListener('paqueteo:revalidar-acceso', revalidate)
    }
  }, [queryClient])
  const me = useQuery({
    queryKey: ['identidad', auth.id],
    queryFn: async ({ signal }) => {
      try {
        const identidad = await api<Identidad>('/api/me', { signal })
        signal.throwIfAborted()
        const siguiente = JSON.stringify([
          identidad.tipo,
          identidad.id,
          identidad.agencia?.id ?? null,
          [...identidad.roles].sort(),
        ])
        if (alcance.current !== null && alcance.current !== siguiente) {
          // /me es la autoridad también cuando cambia el acceso con el mismo JWT.
          // Cancelar primero impide que una respuesta anterior repueble la caché.
          await queryClient.cancelQueries(datosDeNegocio)
          signal.throwIfAborted()
          queryClient.removeQueries(datosDeNegocio)
        }
        alcance.current = siguiente
        return identidad
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof ErrorApi && error.status === 403) {
          await queryClient.cancelQueries(datosDeNegocio)
          signal.throwIfAborted()
          queryClient.removeQueries(datosDeNegocio)
          alcance.current = null
        }
        throw error
      }
    },
    enabled: auth.ready && !!auth.id,
    staleTime: 0,
    refetchInterval: 60_000,
    retry: false,
  })
  const entrarDemo = (rol: Rol) => {
    if (!modoDemo) return
    void queryClient.cancelQueries()
    queryClient.clear()
    alcance.current = null
    sessionStorage.setItem('paqueteo:demo-rol', rol)
    setAuth({ ready: true, id: rol })
    setErrorSesion(null)
  }
  const salir = async () => {
    setErrorSesion(null)
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        setErrorSesion(
          new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.'),
        )
        return
      }
    }
    await queryClient.cancelQueries()
    queryClient.clear()
    sessionId.current = null
    alcance.current = null
    sessionStorage.removeItem('paqueteo:demo-rol')
    setAuth({ ready: true, id: null })
  }
  return (
    <SesionContext.Provider
      value={{
        usuario: me.isError ? undefined : me.data,
        cargando: !auth.ready || (!!auth.id && me.isPending),
        autenticado: !!auth.id,
        error: me.error || errorSesion,
        demo: modoDemo,
        entrarDemo,
        salir,
        reintentar: () => {
          setErrorSesion(null)
          void me.refetch()
        },
      }}
    >
      {children}
    </SesionContext.Provider>
  )
}
