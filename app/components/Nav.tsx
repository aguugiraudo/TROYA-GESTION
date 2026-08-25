'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthGate'

const groups = [
  {
    key: 'programacion',
    label: 'Programación',
    tabs: [
      { href: '/', label: 'Cola de Producción', roles: ['perfil_1', 'perfil_2', 'perfil_3', 'perfil_4'] },
      { href: '/plan-turnos', label: 'Turnos y Operarios', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
      { href: '/control-general', label: 'Avance de Producción', roles: ['perfil_1', 'perfil_2', 'perfil_3', 'perfil_4'] },
      { href: '/plan-diario', label: 'Plan Diario', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
      { href: '/balance-mensual', label: 'Capacidad Mensual', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
    ],
  },
  {
    key: 'reportes',
    label: 'Reportes',
    tabs: [
      { href: '/historial', label: 'Historial de Órdenes', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
      { href: '/rendimiento', label: 'Rendimiento de Operarios', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
      { href: '/base-datos', label: 'Catálogo de Productos', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
      { href: '/insumos', label: 'Insumos', roles: ['perfil_1', 'perfil_2', 'perfil_3'] },
    ],
  },
]

const standalone = [
  { href: '/dashboard', label: 'Dashboard', roles: ['perfil_1', 'perfil_3'] },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null)
  const { role, fullName, logout } = useAuth()

  function visibleTabs(tabs: { href: string; label: string; roles: string[] }[]) {
    return tabs.filter((t) => role && t.roles.includes(role))
  }

  const visibleGroups = groups
    .map((g) => ({ ...g, tabs: visibleTabs(g.tabs) }))
    .filter((g) => g.tabs.length > 0)
  const visibleStandalone = visibleTabs(standalone)

  const initial = fullName ? fullName.trim().charAt(0).toUpperCase() : '?'

  // El grupo "activo" es el que contiene la página actual — ese es el que muestra la segunda fila de sub-pestañas
  const activeGroup = visibleGroups.find((g) => g.tabs.some((t) => t.href === pathname)) || null

  return (
    <nav className="bg-slate-900 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-5 min-w-0">
          <Link href="/" className="shrink-0 flex items-center">
            <Image src="/logo_troya_white.png" alt="Troya" width={120} height={42} className="h-8 w-auto" priority />
          </Link>

          <div className="hidden md:flex items-center gap-4">
            {visibleGroups.map((g) => {
              const active = g.key === activeGroup?.key
              return (
                <Link
                  key={g.key}
                  href={g.tabs[0].href}
                  className={`text-sm whitespace-nowrap pb-1 border-b-2 transition ${
                    active
                      ? 'text-white font-medium border-blue-400'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  {g.label}
                </Link>
              )
            })}

            {visibleStandalone.map((t) => {
              const active = pathname === t.href
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`text-sm whitespace-nowrap pb-1 border-b-2 transition ${
                    active
                      ? 'text-white font-medium border-blue-400'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Menú de usuario compacto (desktop y celular) */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-medium flex items-center justify-center hover:bg-slate-600"
            >
              {initial}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-20">
                  <p className="px-3 py-1.5 text-sm text-slate-700 font-medium truncate">{fullName}</p>
                  <button
                    onClick={logout}
                    className="w-full text-left px-3 py-1.5 text-sm text-rose-600 hover:bg-slate-50"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden text-slate-300 p-2"
            aria-label="Abrir menú"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Segunda fila: sub-pestañas del grupo activo (estilo Odoo, siempre visible mientras estés en ese grupo) */}
      {activeGroup && (
        <div className="hidden md:flex items-center gap-4 bg-slate-800 border-t border-slate-700 px-4 md:px-6 h-10">
          {activeGroup.tabs.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`text-sm whitespace-nowrap pb-1 border-b-2 transition ${
                  active
                    ? 'text-white font-medium border-blue-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </div>
      )}

      {open && (
        <div className="md:hidden bg-slate-800 border-t border-slate-700 px-4 py-2">
          {visibleGroups.map((g) => (
            <div key={g.key} className="border-b border-slate-700 last:border-0">
              <button
                onClick={() => setOpenMobileGroup(openMobileGroup === g.key ? null : g.key)}
                className="w-full flex items-center justify-between py-2.5 text-sm text-slate-200 font-medium"
              >
                {g.label}
                <span className={`text-[10px] transition-transform ${openMobileGroup === g.key ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {openMobileGroup === g.key && (
                <div className="pb-2 pl-3">
                  {g.tabs.map((t) => {
                    const active = pathname === t.href
                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        onClick={() => { setOpen(false); setOpenMobileGroup(null) }}
                        className={`block py-2 text-sm ${active ? 'text-white font-medium' : 'text-slate-300'}`}
                      >
                        {t.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {visibleStandalone.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={() => setOpen(false)}
                className={`block py-2.5 text-sm border-b border-slate-700 last:border-0 ${
                  active ? 'text-white font-medium' : 'text-slate-300'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}