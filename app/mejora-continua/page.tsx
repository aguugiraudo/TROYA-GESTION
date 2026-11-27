'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Filtro = 'todas' | 'vencidas' | 'sinfecha' | 'cola' | 'terminadas'
type Vista = 'lista' | 'calendario'
type Modal =
  | { modo: 'problema' }
  | { modo: 'accion'; problema: any }
  | { modo: 'editar'; accion: any }
  | { modo: 'pegar' }
  | null

// ---------- fechas (formato AAAA-MM-DD, hora local) ----------
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function today() {
  return iso(new Date())
}
function shortDate(s: string | null) {
  if (!s) return '—'
  return s.split('T')[0].split('-').reverse().slice(0, 2).join('/')
}
function fullDate(s: string | null) {
  if (!s) return '—'
  return s.split('T')[0].split('-').reverse().join('/')
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function MejoraContinuaPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'
  const esDueno = role === 'perfil_1'

  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [problemas, setProblemas] = useState<any[]>([])
  const [acciones, setAcciones] = useState<any[]>([])
  const [tope, setTope] = useState(14)

  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<Vista>('lista')
  const [mesCal, setMesCal] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const [modal, setModal] = useState<Modal>(null)
  const [fTitulo, setFTitulo] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fFecha, setFFecha] = useState('')
  const [fResp, setFResp] = useState('')
  const [fTexto, setFTexto] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const [pRes, aRes, cRes] = await Promise.all([
      supabase.from('mejora_problemas').select('*').order('numero'),
      supabase.from('mejora_acciones').select('*').order('numero'),
      supabase.from('mejora_config').select('tope').eq('id', 1).maybeSingle(),
    ])
    if (pRes.error || aRes.error) {
      setSetupError((pRes.error || aRes.error)!.message)
      setLoading(false)
      return
    }
    setSetupError(null)
    setProblemas(pRes.data || [])
    setAcciones(aRes.data || [])
    if (cRes.data?.tope) setTope(cRes.data.tope)
    setLoading(false)
  }

  // ---------- datos derivados ----------
  const hoy = today()
  const problemaById: Record<string, any> = {}
  problemas.forEach((p) => (problemaById[p.id] = p))

  const items = acciones
    .filter((a) => problemaById[a.problema_id])
    .map((a) => ({ ...a, p: problemaById[a.problema_id] }))
    .sort((x, y) => x.p.numero - y.p.numero || x.numero - y.numero)

  const numLabel = (a: any) => `${a.p.numero}.${a.numero}`
  const vencida = (a: any) => a.estado !== 'terminada' && !!a.fecha && a.fecha < hoy

  const enTablero = items.filter((a) => a.estado === 'tablero')
  const enCola = items.filter((a) => a.estado === 'cola').sort((x, y) => x.orden - y.orden)
  const terminadas = items.filter((a) => a.estado === 'terminada').sort((x, y) => (y.terminada_at || '').localeCompare(x.terminada_at || ''))
  const lugaresLibres = Math.max(0, tope - enTablero.length)

  const q = busqueda.trim().toLowerCase()
  function coincide(a: any) {
    if (!q) return true
    if (/^\d+(\.\d+)?$/.test(q)) return q.includes('.') ? numLabel(a) === q : String(a.p.numero) === q
    return `${a.p.titulo} ${a.descripcion} ${a.responsable || ''}`.toLowerCase().includes(q)
  }

  const tableroFiltrado = enTablero.filter((a) => {
    if (filtro === 'vencidas' && !vencida(a)) return false
    if (filtro === 'sinfecha' && a.fecha) return false
    return coincide(a)
  })
  const colaFiltrada = enCola.filter(coincide)
  const terminadasFiltradas = terminadas.filter(coincide)

  const cntVencidas = enTablero.filter(vencida).length
  const cntSinFecha = enTablero.filter((a) => !a.fecha).length
  const responsables = Array.from(new Set(items.map((a) => a.responsable).filter(Boolean))).sort() as string[]

  const mostrarTablero = filtro === 'todas' || filtro === 'vencidas' || filtro === 'sinfecha'
  const mostrarCola = filtro === 'todas' || filtro === 'cola'
  const mostrarTerminadas = filtro === 'todas' || filtro === 'terminadas'
  const hayFiltro = filtro !== 'todas' || busqueda !== ''

  // ---------- acciones sobre la base ----------
  async function run(fn: () => PromiseLike<{ error: any }>) {
    const { error } = await fn()
    if (error) alert('No se pudo guardar: ' + error.message)
    await cargar()
  }

  async function marcarAvance(a: any, v: number) {
    if (!canEdit) return
    const nuevo = a.avance === v ? v - 25 : v
    if (nuevo === 100 && !confirm(`¿Marcar la acción ${numLabel(a)} como TERMINADA (100%)? Pasa al historial y sube la primera de la cola.`)) return
    await run(() => supabase.from('mejora_acciones').update({ avance: nuevo }).eq('id', a.id))
  }

  async function guardarCampo(a: any, campo: 'fecha' | 'responsable', valor: string) {
    if (!canEdit) return
    const v = campo === 'responsable' ? valor.trim().toUpperCase() || null : valor || null
    if ((a[campo] || null) === v) return
    await run(() => supabase.from('mejora_acciones').update({ [campo]: v }).eq('id', a.id))
  }

  async function mover(a: any, dir: -1 | 1) {
    const idx = enCola.findIndex((x) => x.id === a.id)
    const otro = enCola[idx + dir]
    if (!otro) return
    await run(async () => {
      const r1 = await supabase.from('mejora_acciones').update({ orden: otro.orden }).eq('id', a.id)
      if (r1.error) return r1
      return supabase.from('mejora_acciones').update({ orden: a.orden }).eq('id', otro.id)
    })
  }

  async function subirAlTablero(a: any) {
    if (lugaresLibres <= 0) return
    await run(() => supabase.from('mejora_acciones').update({ estado: 'tablero' }).eq('id', a.id))
  }

  async function reabrir(a: any) {
    if (!confirm(`¿Reabrir la acción ${numLabel(a)}? Vuelve con 75% de avance.`)) return
    await run(() => supabase.from('mejora_acciones').update({ avance: 75, estado: lugaresLibres > 0 ? 'tablero' : 'cola' }).eq('id', a.id))
  }

  async function cambiarTope() {
    const txt = prompt('¿Cuántas acciones pueden estar en el tablero al mismo tiempo?', String(tope))
    if (txt === null) return
    const n = parseInt(txt, 10)
    if (!n || n < 1) { alert('Poné un número mayor a 0.'); return }
    await run(() => supabase.from('mejora_config').update({ tope: n }).eq('id', 1))
  }

  // ---------- ventana de carga / edición ----------
  function abrirModal(m: Modal) {
    setFTitulo(''); setFDesc(''); setFFecha(''); setFResp(''); setFTexto('')
    if (m && m.modo === 'editar') {
      setFTitulo(m.accion.p.titulo)
      setFDesc(m.accion.descripcion)
      setFFecha(m.accion.fecha || '')
      setFResp(m.accion.responsable || '')
    }
    setModal(m)
  }

  async function guardarModal() {
    if (!modal) return
    setSaving(true)
    try {
      if (modal.modo === 'problema') {
        if (!fTitulo.trim() || !fDesc.trim()) { alert('Completá el problema y la acción.'); return }
        const { data: p, error } = await supabase.from('mejora_problemas').insert({ titulo: fTitulo.trim() }).select('id').single()
        if (error || !p) { alert('No se pudo guardar: ' + (error?.message || '')); return }
        const r = await supabase.from('mejora_acciones').insert({
          problema_id: p.id, descripcion: fDesc.trim(), fecha: fFecha || null, responsable: fResp.trim().toUpperCase() || null, estado: 'cola',
        })
        if (r.error) { alert('No se pudo guardar: ' + r.error.message); return }
      } else if (modal.modo === 'accion') {
        if (!fDesc.trim()) { alert('Escribí la acción.'); return }
        const r = await supabase.from('mejora_acciones').insert({
          problema_id: modal.problema.id, descripcion: fDesc.trim(), fecha: fFecha || null, responsable: fResp.trim().toUpperCase() || null, estado: 'cola',
        })
        if (r.error) { alert('No se pudo guardar: ' + r.error.message); return }
      } else if (modal.modo === 'editar') {
        if (!fTitulo.trim() || !fDesc.trim()) { alert('El problema y la acción no pueden quedar vacíos.'); return }
        const r1 = await supabase.from('mejora_problemas').update({ titulo: fTitulo.trim() }).eq('id', modal.accion.problema_id)
        if (r1.error) { alert('No se pudo guardar: ' + r1.error.message); return }
        const r2 = await supabase.from('mejora_acciones').update({
          descripcion: fDesc.trim(), fecha: fFecha || null, responsable: fResp.trim().toUpperCase() || null,
        }).eq('id', modal.accion.id)
        if (r2.error) { alert('No se pudo guardar: ' + r2.error.message); return }
      } else if (modal.modo === 'pegar') {
        // Cada renglón: "Problema | Acción" (o separados por tab, como al copiar de Excel). Sin separador: el renglón es el problema.
        const lineas = fTexto.split('\n').map((l) => l.trim()).filter(Boolean)
        if (lineas.length === 0) { alert('Pegá al menos un renglón.'); return }
        for (const l of lineas) {
          const partes = l.split(/\t|\|/).map((x) => x.trim())
          const titulo = partes[0]
          const desc = partes[1] || 'Definir acción'
          if (!titulo) continue
          const { data: p, error } = await supabase.from('mejora_problemas').insert({ titulo }).select('id').single()
          if (error || !p) { alert('No se pudo guardar: ' + (error?.message || '')); break }
          const r = await supabase.from('mejora_acciones').insert({ problema_id: p.id, descripcion: desc, estado: 'cola' })
          if (r.error) { alert('No se pudo guardar: ' + r.error.message); break }
        }
      }
      setModal(null)
      await cargar()
    } finally {
      setSaving(false)
    }
  }

  async function borrarAccion(a: any) {
    const hermanas = items.filter((x) => x.problema_id === a.problema_id).length
    const msg = hermanas <= 1
      ? `¿Borrar la acción ${numLabel(a)} y su problema? No se puede deshacer.`
      : `¿Borrar la acción ${numLabel(a)}? No se puede deshacer.`
    if (!confirm(msg)) return
    setSaving(true)
    try {
      const r = hermanas <= 1
        ? await supabase.from('mejora_problemas').delete().eq('id', a.problema_id)
        : await supabase.from('mejora_acciones').delete().eq('id', a.id)
      if (r.error) alert('No se pudo borrar: ' + r.error.message)
      setModal(null)
      await cargar()
    } finally {
      setSaving(false)
    }
  }

  // ---------- piezas de pantalla ----------
  function Avance({ a }: { a: any }) {
    return (
      <div className="flex items-center gap-1.5">
        {[25, 50, 75, 100].map((v) => (
          <button
            key={v}
            disabled={!canEdit}
            onClick={() => marcarAvance(a, v)}
            aria-label={`Marcar avance ${v}%`}
            className={`w-7 h-7 rounded-md border-2 ${a.avance >= v ? 'bg-orange-500 border-orange-700' : 'bg-white border-slate-400'} ${canEdit ? 'cursor-pointer hover:border-orange-600' : 'cursor-default'}`}
          />
        ))}
        <span className="text-xs text-slate-500 w-9">{a.avance}%</span>
      </div>
    )
  }

  function FechaCelda({ a }: { a: any }) {
    const v = vencida(a)
    if (!canEdit) {
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${!a.fecha ? 'bg-amber-100 text-amber-800' : v ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
          {a.fecha ? shortDate(a.fecha) + (v ? ' · vencida' : '') : 'Sin fecha'}
        </span>
      )
    }
    return (
      <div className="flex flex-col items-start gap-0.5">
        <input
          type="date"
          key={a.id + (a.fecha || '')}
          defaultValue={a.fecha || ''}
          onBlur={(e) => guardarCampo(a, 'fecha', e.target.value)}
          className={`border rounded-md px-1.5 py-1 text-xs w-32 ${!a.fecha ? 'border-amber-300 bg-amber-50' : v ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300'}`}
        />
        {v && <span className="text-[11px] font-semibold text-rose-600">Vencida</span>}
      </div>
    )
  }

  function RespCelda({ a }: { a: any }) {
    if (!canEdit) return <span className="text-sm text-slate-700">{a.responsable || '—'}</span>
    return (
      <input
        key={a.id + (a.responsable || '')}
        defaultValue={a.responsable || ''}
        onBlur={(e) => guardarCampo(a, 'responsable', e.target.value)}
        list="resp-list"
        placeholder="+ Asignar"
        className="border border-slate-300 rounded-md px-1.5 py-1 text-xs w-20 uppercase placeholder:normal-case"
      />
    )
  }

  // ---------- calendario ----------
  function Calendario() {
    const { y, m } = mesCal
    const offset = (new Date(y, m, 1).getDay() + 6) % 7
    const dim = new Date(y, m + 1, 0).getDate()
    const celdas: { dia: number | null; iso: string; acc: any[] }[] = []
    for (let i = 0; i < offset; i++) celdas.push({ dia: null, iso: '', acc: [] })
    let total = 0
    for (let d = 1; d <= dim; d++) {
      const s = iso(new Date(y, m, d))
      const acc = items.filter((a) => a.estado !== 'terminada' && a.fecha === s && coincide(a))
      total += acc.length
      celdas.push({ dia: d, iso: s, acc })
    }
    const sinFechaTotal = items.filter((a) => a.estado !== 'terminada' && !a.fecha).length
    function mover(delta: number) {
      const d = new Date(y, m + delta, 1)
      setMesCal({ y: d.getFullYear(), m: d.getMonth() })
    }
    return (
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => mover(-1)} aria-label="Mes anterior" className="border border-slate-300 rounded-md w-10 h-10 hover:bg-slate-50">◀</button>
            <h2 className="font-semibold text-slate-800 min-w-[150px] text-center">{MESES[m]} {y}</h2>
            <button onClick={() => mover(1)} aria-label="Mes siguiente" className="border border-slate-300 rounded-md w-10 h-10 hover:bg-slate-50">▶</button>
          </div>
          <span className="text-xs text-slate-500">
            {total} {total === 1 ? 'acción para cerrar' : 'acciones para cerrar'} este mes · <span className="text-rose-600 font-semibold">rojo = vencida</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[840px]">
            {DIAS.map((d) => (
              <div key={d} className="px-2 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-200">{d}</div>
            ))}
            {celdas.map((c, i) => (
              <div key={i} className={`min-h-[96px] border-b border-r border-slate-200 p-1.5 min-w-0 ${c.dia === null ? 'bg-slate-50' : c.iso === hoy ? 'bg-blue-50' : 'bg-white'}`}>
                {c.dia !== null && (
                  <>
                    <div className={`text-xs ${c.iso === hoy ? 'font-bold text-blue-700' : 'text-slate-500'}`}>{c.dia}</div>
                    {c.acc.map((a) => (
                      <div
                        key={a.id}
                        title={`${a.p.titulo} — ${a.descripcion}${a.responsable ? ' (' + a.responsable + ')' : ''}`}
                        className={`mt-1 text-[11px] leading-tight px-1.5 py-1 rounded ${vencida(a) ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-800'}`}
                      >
                        <strong>{numLabel(a)}</strong> · {a.descripcion}
                        {a.responsable && <span className="opacity-70"> · {a.responsable}</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-200">
          Las acciones sin fecha no aparecen en el calendario: {sinFechaTotal} por programar.
        </p>
      </section>
    )
  }

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  if (setupError) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-800 mb-3">Mejora continua</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Falta crear las tablas de este módulo en la base de datos. Corré el SQL <strong>mejora_continua_tablas.sql</strong> en el SQL Editor de Supabase y recargá la página.
          <p className="text-xs text-amber-600 mt-2">Detalle técnico: {setupError}</p>
        </div>
      </main>
    )
  }

  const tarjetas: { key: Filtro; label: string; valor: number; extra?: string; alerta?: boolean }[] = [
    { key: 'todas', label: 'En el tablero', valor: enTablero.length, extra: ` de ${tope} lugares` },
    { key: 'vencidas', label: 'Vencidas', valor: cntVencidas, alerta: cntVencidas > 0 },
    { key: 'sinfecha', label: 'Sin fecha', valor: cntSinFecha },
    { key: 'cola', label: 'En cola de espera', valor: enCola.length },
    { key: 'terminadas', label: 'Terminadas', valor: terminadas.length },
  ]
  const titulosTabla: Record<string, string> = { todas: 'Tablero', vencidas: 'Acciones vencidas', sinfecha: 'Acciones sin fecha' }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 mb-1">Mejora continua</h1>
          <p className="text-sm text-slate-500">
            Problemas y acciones en curso, y la cola de espera por prioridad.
            {esDueno && (
              <button onClick={cambiarTope} className="ml-2 text-xs text-orange-700 underline">Cambiar tope ({tope})</button>
            )}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => abrirModal({ modo: 'pegar' })} className="border border-slate-300 bg-white text-slate-800 text-sm px-4 py-2 rounded-lg hover:bg-slate-50">
              Pegar lista a la cola
            </button>
            <button onClick={() => abrirModal({ modo: 'problema' })} className="bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-800">
              + Nuevo problema
            </button>
          </div>
        )}
      </div>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — solo el dueño y el encargado pueden cargar y marcar avances.
        </div>
      )}

      {/* Tarjetas = filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        {tarjetas.map((t) => {
          const activa = filtro === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setFiltro(activa ? 'todas' : t.key); setVista('lista') }}
              className={`text-left rounded-xl px-4 py-3 min-w-[160px] border-2 ${activa ? 'border-slate-900' : t.alerta ? 'border-amber-200' : 'border-slate-200'} ${t.alerta ? 'bg-amber-50' : 'bg-white'}`}
            >
              <p className={`text-xs ${t.alerta ? 'text-amber-800' : 'text-slate-500'}`}>{t.label}</p>
              <p className={`text-2xl font-bold ${t.alerta ? 'text-amber-800' : 'text-slate-800'}`}>
                {t.valor}
                {t.extra && <span className="text-sm font-medium text-slate-500">{t.extra}</span>}
              </p>
            </button>
          )
        })}
      </div>

      {/* Buscador y vista */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mc-buscar" className="text-sm text-slate-500">Buscar</label>
          <input
            id="mc-buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="N.º de problema (11), de acción (11.2) o texto"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[340px] max-w-full"
          />
          {hayFiltro && (
            <button onClick={() => { setFiltro('todas'); setBusqueda('') }} className="text-xs text-orange-700 underline px-2 py-2">Quitar filtros</button>
          )}
        </div>
        <div className="flex border border-slate-300 rounded-lg overflow-hidden bg-white">
          <button onClick={() => setVista('lista')} className={`px-4 py-2 text-sm ${vista === 'lista' ? 'bg-slate-900 text-white' : 'text-slate-800'}`}>Lista</button>
          <button onClick={() => { setVista('calendario'); setFiltro('todas') }} className={`px-4 py-2 text-sm ${vista === 'calendario' ? 'bg-slate-900 text-white' : 'text-slate-800'}`}>Calendario</button>
        </div>
      </div>

      <datalist id="resp-list">
        {responsables.map((r) => <option key={r} value={r} />)}
      </datalist>

      {vista === 'calendario' && <Calendario />}

      {vista === 'lista' && mostrarTablero && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">{titulosTabla[filtro] || 'Tablero'}</h2>
            <span className="text-xs text-slate-500">
              {canEdit ? 'Tocá un cuadradito para marcar el avance: 25 · 50 · 75 · 100%' : 'Avance: 25 · 50 · 75 · 100%'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-slate-500 bg-slate-50">
                  <th className="p-3 w-14">N.º</th>
                  <th className="p-3 w-[27%]">Problema</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3 w-36">Fecha</th>
                  <th className="p-3 w-28">Resp.</th>
                  <th className="p-3 w-44">Avance</th>
                  {canEdit && <th className="p-3 w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {tableroFiltrado.map((a, i) => {
                  const prev = tableroFiltrado[i - 1]
                  const mostrarProblema = !prev || prev.problema_id !== a.problema_id
                  return (
                    <tr key={a.id} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-semibold text-slate-500 whitespace-nowrap">{numLabel(a)}</td>
                      <td className="p-3 font-semibold text-slate-800">{mostrarProblema ? a.p.titulo : ''}</td>
                      <td className="p-3 text-slate-700">{a.descripcion}</td>
                      <td className="p-3"><FechaCelda a={a} /></td>
                      <td className="p-3"><RespCelda a={a} /></td>
                      <td className="p-3"><Avance a={a} /></td>
                      {canEdit && (
                        <td className="p-3 whitespace-nowrap text-xs">
                          <button onClick={() => abrirModal({ modo: 'editar', accion: a })} className="text-slate-600 underline mr-2">Editar</button>
                          <button onClick={() => abrirModal({ modo: 'accion', problema: a.p })} className="text-orange-700 underline" title="Agregar otra acción a este problema">+ acción</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {tableroFiltrado.length === 0 && <p className="p-4 text-sm text-slate-500">No hay acciones con ese filtro.</p>}
        </section>
      )}

      {vista === 'lista' && mostrarCola && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Cola de espera</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ordenada por prioridad. Cuando una acción llega al 100% y se libera un lugar, sube sola la primera.
            </p>
          </div>
          {colaFiltrada.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{enCola.length === 0 ? 'No hay nada esperando.' : 'No hay acciones con esa búsqueda.'}</p>
          ) : (
            colaFiltrada.map((a) => {
              const posicion = enCola.findIndex((x) => x.id === a.id) + 1
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-slate-100">
                  <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">{posicion}</span>
                  <div className="flex-1 min-w-[260px]">
                    <p className="font-semibold text-slate-800 text-sm">
                      <span className="text-slate-400 font-medium mr-1.5">{numLabel(a)}</span>{a.p.titulo}
                    </p>
                    <p className="text-sm text-slate-600">{a.descripcion}</p>
                    {(a.fecha || a.responsable) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {a.responsable ? `Resp.: ${a.responsable}` : ''}{a.responsable && a.fecha ? ' · ' : ''}{a.fecha ? `Fecha: ${fullDate(a.fecha)}` : ''}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => mover(a, -1)} aria-label="Subir prioridad" className="border border-slate-300 rounded-md w-9 h-9 hover:bg-slate-50">▲</button>
                      <button onClick={() => mover(a, 1)} aria-label="Bajar prioridad" className="border border-slate-300 rounded-md w-9 h-9 hover:bg-slate-50">▼</button>
                      <button
                        onClick={() => subirAlTablero(a)}
                        disabled={lugaresLibres <= 0}
                        title={lugaresLibres <= 0 ? 'El tablero está completo' : 'Subir al tablero'}
                        className="text-xs border border-slate-300 rounded-md px-3 h-9 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Subir al tablero
                      </button>
                      <button onClick={() => abrirModal({ modo: 'editar', accion: a })} className="text-xs text-slate-600 underline px-1">Editar</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </section>
      )}

      {vista === 'lista' && mostrarTerminadas && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Terminadas</h2>
            <p className="text-xs text-slate-500 mt-0.5">Quedan guardadas con su fecha de cierre.</p>
          </div>
          {terminadasFiltradas.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{terminadas.length === 0 ? 'Todavía no se terminó ninguna.' : 'No hay acciones con esa búsqueda.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-slate-500 bg-slate-50">
                    <th className="p-3 w-14">N.º</th>
                    <th className="p-3 w-[30%]">Problema</th>
                    <th className="p-3">Acción</th>
                    <th className="p-3 w-24">Resp.</th>
                    <th className="p-3 w-28">Fecha prevista</th>
                    <th className="p-3 w-28">Cerrada el</th>
                    {canEdit && <th className="p-3 w-20"></th>}
                  </tr>
                </thead>
                <tbody>
                  {terminadasFiltradas.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-semibold text-slate-500">{numLabel(a)}</td>
                      <td className="p-3 text-slate-800 font-medium">{a.p.titulo}</td>
                      <td className="p-3 text-slate-700">{a.descripcion}</td>
                      <td className="p-3 text-slate-600">{a.responsable || '—'}</td>
                      <td className="p-3 text-slate-500">{fullDate(a.fecha)}</td>
                      <td className="p-3 text-emerald-700 font-semibold">{fullDate(a.terminada_at)}</td>
                      {canEdit && (
                        <td className="p-3 text-xs">
                          <button onClick={() => reabrir(a)} className="text-slate-600 underline">Reabrir</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Ventana de carga / edición */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 mt-10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              {modal.modo === 'problema' && 'Nuevo problema'}
              {modal.modo === 'accion' && `Nueva acción para el problema ${modal.problema.numero}`}
              {modal.modo === 'editar' && `Editar ${numLabel(modal.accion)}`}
              {modal.modo === 'pegar' && 'Pegar lista a la cola'}
            </h3>

            {modal.modo === 'accion' && (
              <p className="text-sm text-slate-600 mb-3 bg-slate-50 rounded-md px-3 py-2">{modal.problema.titulo}</p>
            )}

            {(modal.modo === 'problema' || modal.modo === 'editar') && (
              <div className="mb-3">
                <label className="text-xs text-slate-500">Problema</label>
                <input value={fTitulo} onChange={(e) => setFTitulo(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                {modal.modo === 'editar' && <p className="text-[11px] text-slate-400 mt-1">Si el problema tiene más acciones, el cambio se ve en todas.</p>}
              </div>
            )}

            {modal.modo !== 'pegar' && (
              <>
                <div className="mb-3">
                  <label className="text-xs text-slate-500">Acción</label>
                  <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-slate-500">Fecha estimada (opcional)</label>
                    <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Responsable (iniciales)</label>
                    <input value={fResp} onChange={(e) => setFResp(e.target.value)} list="resp-list" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm uppercase" />
                  </div>
                </div>
                {modal.modo !== 'editar' && (
                  <p className="text-xs text-slate-500 mb-3">
                    {lugaresLibres > 0
                      ? `Hay ${lugaresLibres} ${lugaresLibres === 1 ? 'lugar libre' : 'lugares libres'} en el tablero: la acción entra directo.`
                      : 'El tablero está completo: la acción entra al final de la cola de espera.'}
                  </p>
                )}
              </>
            )}

            {modal.modo === 'pegar' && (
              <div className="mb-3">
                <p className="text-sm text-slate-600 mb-2">
                  Un renglón por problema, con este formato: <strong>Problema | Acción</strong>. También sirve copiar dos columnas de Excel. Si un renglón no tiene «|», se carga como problema con la acción «Definir acción». Entran a la cola en el orden en que los pegues.
                </p>
                <textarea
                  value={fTexto}
                  onChange={(e) => setFTexto(e.target.value)}
                  rows={8}
                  placeholder={'Falta de iluminación en plegado | Cambiar luminarias\nDesorden en pañol | 5S del pañol'}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mt-4">
              <div>
                {modal.modo === 'editar' && (
                  <button onClick={() => borrarAccion(modal.accion)} disabled={saving} className="text-sm text-rose-600 underline">Borrar</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} disabled={saving} className="border border-slate-300 text-sm px-4 py-2 rounded-lg hover:bg-slate-50">Cancelar</button>
                <button onClick={guardarModal} disabled={saving} className="bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
