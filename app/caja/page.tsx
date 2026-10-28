'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function hoy() {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
function fechaAR(f: string | null) {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}
function plata(n: number) {
  const v = Number(n) || 0
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}
function numero(n: number, dec = 2) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec })
}
function aNumero(t: string) {
  return parseFloat(String(t).replace(/\./g, '').replace(',', '.'))
}
function mesDe(f: string) { return f.slice(0, 7) }
function nombreMes(m: string) {
  const [y, mm] = m.split('-')
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${nombres[parseInt(mm, 10) - 1]} ${y}`
}

// Celda que se edita con un click
function EditCell({
  value, type = 'text', onSave, display, align, canEdit = true,
}: {
  value: string
  type?: 'text' | 'number' | 'date'
  onSave: (v: string) => void
  display?: ReactNode
  align?: 'right'
  canEdit?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => { setV(value) }, [value])
  const shown = display !== undefined ? display : (value || <span className="text-slate-300">—</span>)
  if (!canEdit) return <span>{shown}</span>
  if (!editing) {
    return <span onClick={() => { cancelled.current = false; setEditing(true) }} title="Click para editar"
      className="cursor-pointer hover:underline decoration-dotted decoration-slate-400">{shown}</span>
  }
  function finish() {
    setEditing(false)
    if (cancelled.current) { setV(value); return }
    if (v !== value) onSave(v)
  }
  return (
    <input autoFocus type={type} step={type === 'number' ? 'any' : undefined} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur() }
      }}
      className={`border border-slate-300 rounded px-1 py-0.5 text-sm w-full min-w-[80px] ${align === 'right' ? 'text-right' : ''}`} />
  )
}

const BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10]

export default function CajaPage() {
  const { role } = useAuth()
  const esDueno = role === 'perfil_1'

  const [tab, setTab] = useState<'chatarra' | 'caja'>('chatarra')
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  const [precios, setPrecios] = useState<any[]>([])
  const [cargas, setCargas] = useState<any[]>([])
  const [cobros, setCobros] = useState<any[]>([])
  const [movs, setMovs] = useState<any[]>([])
  const [arqueos, setArqueos] = useState<any[]>([])

  // formularios
  const [pFecha, setPFecha] = useState(hoy())
  const [pValor, setPValor] = useState('')
  const [mostrarPrecio, setMostrarPrecio] = useState(false)

  const [cFecha, setCFecha] = useState(hoy())
  const [cKilos, setCKilos] = useState('')
  const [cRetiro, setCRetiro] = useState(true)
  const [cNota, setCNota] = useState('')
  const [cPrecioEsp, setCPrecioEsp] = useState('')

  const [kFecha, setKFecha] = useState(hoy())
  const [kMonto, setKMonto] = useState('')
  const [kNota, setKNota] = useState('')
  const [kACaja, setKACaja] = useState(true)

  const [mFecha, setMFecha] = useState(hoy())
  const [mTipo, setMTipo] = useState<'ingreso' | 'egreso'>('egreso')
  const [mDetalle, setMDetalle] = useState('')
  const [mMonto, setMMonto] = useState('')

  const [mesChatarra, setMesChatarra] = useState('todos')
  const [mesCaja, setMesCaja] = useState('todos')

  const [conteo, setConteo] = useState<Record<string, string>>({})
  const [aFecha, setAFecha] = useState(hoy())
  const [aNota, setANota] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (esDueno) { cargar() } else { setLoading(false) } }, [esDueno])

  async function cargar() {
    setLoading(true)
    const [p, c, k, m, a] = await Promise.all([
      supabase.from('chatarra_precios').select('*').order('vigente_desde', { ascending: false }),
      supabase.from('chatarra_cargas').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('chatarra_cobros').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('caja_movimientos').select('*').order('fecha', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('caja_arqueos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(10),
    ])
    const err = [p, c, k, m, a].find((x) => x.error)
    if (err && err.error) setErrorCarga('No se pudieron cargar los datos: ' + err.error.message + ' (¿corriste el SQL caja_tablas.sql?)')
    else setErrorCarga('')
    setPrecios(p.data || []); setCargas(c.data || []); setCobros(k.data || []); setMovs(m.data || []); setArqueos(a.data || [])
    setLoading(false)
  }

  // ---------- Chatarra ----------
  function precioPara(fecha: string): number | null {
    // el precio vigente es el de la fecha más reciente que no supere la fecha de la carga
    const p = precios.find((x) => x.vigente_desde <= fecha)
    return p ? Number(p.precio_kg) : null
  }
  const precioActual = precios.length > 0 ? precios[0] : null

  async function guardarPrecio() {
    const v = aNumero(pValor)
    if (isNaN(v) || v < 0) { alert('Ingresá el precio por kg (un número).'); return }
    const { error } = await supabase.from('chatarra_precios').upsert({ vigente_desde: pFecha, precio_kg: v }, { onConflict: 'vigente_desde' })
    if (error) { alert('No se pudo guardar el precio: ' + error.message); return }
    setPValor(''); setMostrarPrecio(false)
    cargar()
  }
  async function borrarPrecio(p: any) {
    if (!confirm(`¿Borrar el precio ${plata(p.precio_kg)} desde el ${fechaAR(p.vigente_desde)}? Las cargas ya guardadas conservan su precio.`)) return
    const { error } = await supabase.from('chatarra_precios').delete().eq('id', p.id)
    if (error) { alert('No se pudo borrar: ' + error.message); return }
    cargar()
  }

  const espNum = aNumero(cPrecioEsp)
  const hayEsp = cPrecioEsp.trim() !== '' && !isNaN(espNum) && espNum >= 0
  const precioNueva = hayEsp ? espNum : precioPara(cFecha)
  async function agregarCarga() {
    const kilos = aNumero(cKilos)
    if (isNaN(kilos) || kilos <= 0) { alert('Ingresá los kilos (mayor a 0).'); return }
    if (cPrecioEsp.trim() !== '' && !hayEsp) { alert('El precio especial no es un número válido.'); return }
    if (precioNueva == null) { alert('Para esa fecha todavía no hay un precio por kg. Cargá primero el precio con "Cambiar precio" o poné un precio especial.'); return }
    const { error } = await supabase.from('chatarra_cargas').insert({ fecha: cFecha, retiro: cRetiro, kilos, precio_kg: precioNueva, nota: cNota.trim() || null })
    if (error) { alert('No se pudo guardar la carga: ' + error.message); return }
    setCKilos(''); setCNota(''); setCPrecioEsp('')
    cargar()
  }
  async function editarCarga(c: any, patch: Record<string, any>) {
    const { error } = await supabase.from('chatarra_cargas').update(patch).eq('id', c.id)
    if (error) { alert('No se pudo guardar el cambio: ' + error.message); return }
    cargar()
  }
  function numCarga(c: any, campo: 'kilos' | 'precio_kg', v: string) {
    const n = aNumero(v)
    if (isNaN(n) || n < 0 || (campo === 'kilos' && n <= 0)) { alert('Ingresá un número válido.'); return }
    editarCarga(c, { [campo]: n })
  }
  async function borrarCarga(c: any) {
    if (!confirm(`¿Eliminar la carga del ${fechaAR(c.fecha)} (${numero(c.kilos)} kg)? No se puede deshacer.`)) return
    const { error } = await supabase.from('chatarra_cargas').delete().eq('id', c.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    cargar()
  }

  async function agregarCobro() {
    const monto = aNumero(kMonto)
    if (isNaN(monto) || monto <= 0) { alert('Ingresá el monto cobrado (mayor a 0).'); return }
    const { error } = await supabase.from('chatarra_cobros').insert({ fecha: kFecha, monto, nota: kNota.trim() || null, a_caja: kACaja })
    if (error) { alert('No se pudo guardar el cobro: ' + error.message); return }
    setKMonto(''); setKNota('')
    cargar()
  }
  async function editarCobro(k: any, patch: Record<string, any>) {
    const { error } = await supabase.from('chatarra_cobros').update(patch).eq('id', k.id)
    if (error) { alert('No se pudo guardar el cambio: ' + error.message); return }
    cargar()
  }
  async function borrarCobro(k: any) {
    if (!confirm(`¿Eliminar el cobro del ${fechaAR(k.fecha)} (${plata(k.monto)})? Si había entrado a la caja chica, ese ingreso también se borra.`)) return
    const { error } = await supabase.from('chatarra_cobros').delete().eq('id', k.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    cargar()
  }

  const vendido = cargas.reduce((a, c) => a + Number(c.kilos) * Number(c.precio_kg), 0)
  const kilosTotal = cargas.reduce((a, c) => a + Number(c.kilos), 0)
  const cobrado = cobros.reduce((a, k) => a + Number(k.monto), 0)
  const debe = vendido - cobrado

  const mesesChatarra = useMemo(() => Array.from(new Set(cargas.map((c) => mesDe(c.fecha)))).sort().reverse(), [cargas])
  const cargasVisibles = cargas.filter((c) => mesChatarra === 'todos' || mesDe(c.fecha) === mesChatarra)
  const subtotalMes = cargasVisibles.reduce((a, c) => a + Number(c.kilos) * Number(c.precio_kg), 0)
  const kilosMes = cargasVisibles.reduce((a, c) => a + Number(c.kilos), 0)

  // ---------- Caja chica ----------
  const movsConSaldo = useMemo(() => {
    let saldo = 0
    return movs.map((m) => {
      saldo += m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)
      return { ...m, saldo }
    })
  }, [movs])
  const saldoCaja = movsConSaldo.length > 0 ? movsConSaldo[movsConSaldo.length - 1].saldo : 0
  const mesesCaja = useMemo(() => Array.from(new Set(movs.map((m) => mesDe(m.fecha)))).sort().reverse(), [movs])
  const movsVisibles = movsConSaldo.filter((m) => mesCaja === 'todos' || mesDe(m.fecha) === mesCaja)
  const ingresosVis = movsVisibles.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0)
  const egresosVis = movsVisibles.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0)

  async function agregarMov() {
    const monto = aNumero(mMonto)
    if (isNaN(monto) || monto <= 0) { alert('Ingresá el monto (mayor a 0).'); return }
    if (!mDetalle.trim()) { alert('Escribí el detalle (en qué se gastó o de dónde viene).'); return }
    const { error } = await supabase.from('caja_movimientos').insert({ fecha: mFecha, tipo: mTipo, detalle: mDetalle.trim(), monto, origen: 'manual' })
    if (error) { alert('No se pudo guardar el movimiento: ' + error.message); return }
    setMMonto(''); setMDetalle('')
    cargar()
  }
  async function editarMov(m: any, patch: Record<string, any>) {
    const { error } = await supabase.from('caja_movimientos').update(patch).eq('id', m.id)
    if (error) { alert('No se pudo guardar el cambio: ' + error.message); return }
    cargar()
  }
  async function borrarMov(m: any) {
    if (!confirm(`¿Eliminar "${m.detalle}" (${plata(m.monto)})? No se puede deshacer.`)) return
    const { error } = await supabase.from('caja_movimientos').delete().eq('id', m.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    cargar()
  }

  const totalContado = BILLETES.reduce((a, b) => a + b * (parseInt(conteo[String(b)] || '0', 10) || 0), 0)
  const diferencia = totalContado - saldoCaja
  async function guardarArqueo() {
    const detalle: Record<string, number> = {}
    BILLETES.forEach((b) => { const n = parseInt(conteo[String(b)] || '0', 10) || 0; if (n > 0) detalle[String(b)] = n })
    if (Object.keys(detalle).length === 0) { alert('Cargá la cantidad de billetes que contaste.'); return }
    const { error } = await supabase.from('caja_arqueos').insert({ fecha: aFecha, conteo: detalle, total_contado: totalContado, saldo_sistema: saldoCaja, nota: aNota.trim() || null })
    if (error) { alert('No se pudo guardar el conteo: ' + error.message); return }
    setConteo({}); setANota('')
    cargar()
  }
  async function borrarArqueo(a: any) {
    if (!confirm(`¿Eliminar el conteo del ${fechaAR(a.fecha)}?`)) return
    const { error } = await supabase.from('caja_arqueos').delete().eq('id', a.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    cargar()
  }

  if (!esDueno) return <main className="p-6 text-slate-500">Este módulo es solo para el dueño.</main>
  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  const inp = 'border border-slate-300 rounded-md px-2 py-1.5 text-sm'
  const th = 'py-2 pr-3 font-normal text-xs text-slate-400'

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Caja y Chatarra</h1>
      <p className="text-sm text-slate-500 mb-4">Control de la venta de chatarra y de la caja chica. Solo lo ves vos.</p>

      {errorCarga && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{errorCarga}</div>}

      <div className="flex gap-6 border-b border-slate-200 mb-6">
        {([['chatarra', 'Venta de chatarra'], ['caja', 'Caja chica']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label}</button>
        ))}
      </div>

      {tab === 'chatarra' && (
        <>
          {/* Precio y resumen */}
          <div className="flex flex-wrap gap-x-10 gap-y-4 items-end mb-6">
            <div>
              <div className="text-xs text-slate-400">Precio por kg {precioActual ? `(desde ${fechaAR(precioActual.vigente_desde)})` : ''}</div>
              <div className="text-2xl font-semibold text-slate-800">{precioActual ? plata(precioActual.precio_kg) : <span className="text-amber-600 text-base">sin precio cargado</span>}</div>
              <button onClick={() => setMostrarPrecio(!mostrarPrecio)} className="text-xs text-blue-600 hover:underline">{mostrarPrecio ? 'Cancelar' : 'Cambiar precio'}</button>
            </div>
            <div>
              <div className="text-xs text-slate-400">Vendido ({numero(kilosTotal, 0)} kg)</div>
              <div className="text-2xl font-semibold text-slate-800">{plata(vendido)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Cobrado</div>
              <div className="text-2xl font-semibold text-slate-800">{plata(cobrado)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Debe</div>
              <div className={`text-2xl font-semibold ${debe > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{plata(debe)}</div>
            </div>
          </div>

          {mostrarPrecio && (
            <div className="mb-6 flex flex-wrap items-end gap-3 border border-slate-200 rounded-lg p-3">
              <label className="text-xs text-slate-500">Rige desde
                <input type="date" value={pFecha} onChange={(e) => setPFecha(e.target.value)} className={`${inp} block mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Nuevo precio por kg
                <input inputMode="decimal" value={pValor} onChange={(e) => setPValor(e.target.value)} placeholder="Ej: 150" className={`${inp} block mt-1 w-32 text-right`} />
              </label>
              <button onClick={guardarPrecio} className="text-sm bg-slate-800 text-white px-4 py-1.5 rounded-md hover:bg-slate-700">Guardar precio</button>
              <p className="text-xs text-slate-400 w-full">Las cargas de esa fecha en adelante usan este precio. Las anteriores conservan el suyo.</p>
            </div>
          )}

          {precios.length > 1 && (
            <details className="mb-6 text-sm">
              <summary className="cursor-pointer text-xs text-slate-500">Historial de precios ({precios.length})</summary>
              <ul className="mt-2 space-y-1">
                {precios.map((p) => (
                  <li key={p.id} className="flex gap-4 text-slate-600">
                    <span className="w-24">{fechaAR(p.vigente_desde)}</span><span className="w-20">{plata(p.precio_kg)}/kg</span>
                    <button onClick={() => borrarPrecio(p)} className="text-xs text-slate-400 hover:text-red-600">eliminar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Cargas */}
          <h2 className="text-base font-semibold text-slate-800 mb-2">Cargas</h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-xs text-slate-500">Fecha
              <input type="date" value={cFecha} onChange={(e) => setCFecha(e.target.value)} className={`${inp} block mt-1`} />
            </label>
            <label className="text-xs text-slate-500">Kilos
              <input inputMode="decimal" value={cKilos} onChange={(e) => setCKilos(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarCarga() }} className={`${inp} block mt-1 w-28 text-right`} />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1 pb-2"><input type="checkbox" checked={cRetiro} onChange={(e) => setCRetiro(e.target.checked)} /> Retiró</label>
            <label className="text-xs text-slate-500">Precio especial $/kg (opcional)
              <input inputMode="decimal" value={cPrecioEsp} onChange={(e) => setCPrecioEsp(e.target.value)} placeholder={precioPara(cFecha) != null ? String(precioPara(cFecha)) : ''} className={`${inp} block mt-1 w-40 text-right`} />
            </label>
            <label className="text-xs text-slate-500">Nota (opcional)
              <input value={cNota} onChange={(e) => setCNota(e.target.value)} className={`${inp} block mt-1 w-48`} />
            </label>
            <div className="pb-1.5 text-xs text-slate-400">
              {precioNueva != null && aNumero(cKilos) > 0 ? <>{plata(precioNueva)}/kg → <b className="text-slate-700">{plata(aNumero(cKilos) * precioNueva)}</b></> : (precioNueva == null ? <span className="text-amber-600">sin precio para esa fecha</span> : null)}
            </div>
            <button onClick={agregarCarga} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700">+ Agregar carga</button>
          </div>

          <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
            <span>Ver:</span>
            <select value={mesChatarra} onChange={(e) => setMesChatarra(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5">
              <option value="todos">Todos los meses</option>
              {mesesChatarra.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
            {mesChatarra !== 'todos' && <span>{numero(kilosMes, 0)} kg · <b className="text-slate-700">{plata(subtotalMes)}</b></span>}
          </div>

          {cargasVisibles.length === 0 ? <p className="text-sm text-slate-400 mb-8">No hay cargas todavía.</p> : (
            <table className="w-full text-sm border-collapse mb-8">
              <thead>
                <tr className="text-left">
                  <th className={th}>Fecha</th><th className={th}>Retiró</th><th className={`${th} text-right`}>Kilos</th>
                  <th className={`${th} text-right`}>$ por kg</th><th className={`${th} text-right`}>Valorizado</th><th className={th}>Nota</th><th></th>
                </tr>
              </thead>
              <tbody>
                {cargasVisibles.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap"><EditCell type="date" value={c.fecha} display={fechaAR(c.fecha)} onSave={(v) => v && editarCarga(c, { fecha: v })} /></td>
                    <td className="py-1.5 pr-3"><input type="checkbox" checked={!!c.retiro} onChange={(e) => editarCarga(c, { retiro: e.target.checked })} /></td>
                    <td className="py-1.5 pr-3 text-right"><EditCell type="number" align="right" value={String(c.kilos)} display={numero(c.kilos)} onSave={(v) => numCarga(c, 'kilos', v)} /></td>
                    <td className="py-1.5 pr-3 text-right"><EditCell type="number" align="right" value={String(c.precio_kg)} display={plata(c.precio_kg)} onSave={(v) => numCarga(c, 'precio_kg', v)} />{precioPara(c.fecha) != null && Number(precioPara(c.fecha)) !== Number(c.precio_kg) && <span className="ml-1 text-[10px] text-amber-600 border border-amber-200 rounded px-1">especial</span>}</td>
                    <td className="py-1.5 pr-3 text-right font-medium">{plata(Number(c.kilos) * Number(c.precio_kg))}</td>
                    <td className="py-1.5 pr-3 text-slate-500"><EditCell value={c.nota || ''} onSave={(v) => editarCarga(c, { nota: v.trim() || null })} /></td>
                    <td className="py-1.5 text-xs"><button onClick={() => borrarCarga(c)} className="text-slate-400 hover:text-red-600">eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Cobros */}
          <h2 className="text-base font-semibold text-slate-800 mb-2">Cobros (lo que pagó)</h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-xs text-slate-500">Fecha
              <input type="date" value={kFecha} onChange={(e) => setKFecha(e.target.value)} className={`${inp} block mt-1`} />
            </label>
            <label className="text-xs text-slate-500">Monto cobrado
              <input inputMode="decimal" value={kMonto} onChange={(e) => setKMonto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarCobro() }} className={`${inp} block mt-1 w-36 text-right`} />
            </label>
            <label className="text-xs text-slate-500">Nota (opcional)
              <input value={kNota} onChange={(e) => setKNota(e.target.value)} className={`${inp} block mt-1 w-48`} />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1 pb-2"><input type="checkbox" checked={kACaja} onChange={(e) => setKACaja(e.target.checked)} /> Entra a la caja chica</label>
            <button onClick={agregarCobro} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700">+ Registrar cobro</button>
          </div>
          {cobros.length === 0 ? <p className="text-sm text-slate-400">Todavía no registraste cobros.</p> : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left"><th className={th}>Fecha</th><th className={`${th} text-right`}>Monto</th><th className={th}>Nota</th><th className={th}>Entró a caja chica</th><th></th></tr>
              </thead>
              <tbody>
                {cobros.map((k) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap"><EditCell type="date" value={k.fecha} display={fechaAR(k.fecha)} onSave={(v) => v && editarCobro(k, { fecha: v })} /></td>
                    <td className="py-1.5 pr-3 text-right font-medium"><EditCell type="number" align="right" value={String(k.monto)} display={plata(k.monto)}
                      onSave={(v) => { const n = aNumero(v); if (isNaN(n) || n <= 0) { alert('Ingresá un monto válido.'); return } editarCobro(k, { monto: n }) }} /></td>
                    <td className="py-1.5 pr-3 text-slate-500"><EditCell value={k.nota || ''} onSave={(v) => editarCobro(k, { nota: v.trim() || null })} /></td>
                    <td className="py-1.5 pr-3"><input type="checkbox" checked={!!k.a_caja} onChange={(e) => editarCobro(k, { a_caja: e.target.checked })} /></td>
                    <td className="py-1.5 text-xs"><button onClick={() => borrarCobro(k)} className="text-slate-400 hover:text-red-600">eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'caja' && (
        <>
          <div className="flex flex-wrap gap-x-10 gap-y-3 items-end mb-6">
            <div>
              <div className="text-xs text-slate-400">Saldo en caja</div>
              <div className={`text-3xl font-semibold ${saldoCaja < 0 ? 'text-red-600' : 'text-slate-800'}`}>{plata(saldoCaja)}</div>
            </div>
            <p className="text-xs text-slate-400 max-w-sm">Los cobros de chatarra marcados "entra a la caja chica" se suman solos como ingreso. Si todavía no cargaste el saldo anterior, agregalo como un ingreso con ese detalle.</p>
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-xs text-slate-500">Fecha
              <input type="date" value={mFecha} onChange={(e) => setMFecha(e.target.value)} className={`${inp} block mt-1`} />
            </label>
            <label className="text-xs text-slate-500">Tipo
              <select value={mTipo} onChange={(e) => setMTipo(e.target.value as any)} className={`${inp} block mt-1`}>
                <option value="egreso">Egreso (compra / retiro)</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </label>
            <label className="text-xs text-slate-500 flex-1 min-w-[200px]">Detalle
              <input value={mDetalle} onChange={(e) => setMDetalle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarMov() }} placeholder="Ej: FACT-18268 materiales" className={`${inp} block mt-1 w-full`} />
            </label>
            <label className="text-xs text-slate-500">Monto
              <input inputMode="decimal" value={mMonto} onChange={(e) => setMMonto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarMov() }} className={`${inp} block mt-1 w-32 text-right`} />
            </label>
            <button onClick={agregarMov} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700">+ Agregar</button>
          </div>

          <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
            <span>Ver:</span>
            <select value={mesCaja} onChange={(e) => setMesCaja(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5">
              <option value="todos">Todos los meses</option>
              {mesesCaja.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
            <span>Ingresos <b className="text-emerald-700">{plata(ingresosVis)}</b> · Egresos <b className="text-red-600">{plata(egresosVis)}</b></span>
          </div>

          {movsVisibles.length === 0 ? <p className="text-sm text-slate-400 mb-8">No hay movimientos todavía.</p> : (
            <table className="w-full text-sm border-collapse mb-8">
              <thead>
                <tr className="text-left">
                  <th className={th}>Fecha</th><th className={th}>Detalle</th>
                  <th className={`${th} text-right`}>Ingreso</th><th className={`${th} text-right`}>Egreso</th><th className={`${th} text-right`}>Saldo</th><th></th>
                </tr>
              </thead>
              <tbody>
                {movsVisibles.map((m) => {
                  const auto = m.origen === 'chatarra'
                  return (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 whitespace-nowrap"><EditCell canEdit={!auto} type="date" value={m.fecha} display={fechaAR(m.fecha)} onSave={(v) => v && editarMov(m, { fecha: v })} /></td>
                      <td className="py-1.5 pr-3">
                        <EditCell canEdit={!auto} value={m.detalle} onSave={(v) => v.trim() && editarMov(m, { detalle: v.trim() })} />
                        {auto && <span className="ml-2 text-[10px] text-slate-400 border border-slate-200 rounded px-1">automático · se edita en Venta de chatarra</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-emerald-700">
                        {m.tipo === 'ingreso' ? <EditCell canEdit={!auto} type="number" align="right" value={String(m.monto)} display={plata(m.monto)}
                          onSave={(v) => { const n = aNumero(v); if (isNaN(n) || n <= 0) { alert('Ingresá un monto válido.'); return } editarMov(m, { monto: n }) }} /> : ''}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-red-600">
                        {m.tipo === 'egreso' ? <EditCell type="number" align="right" value={String(m.monto)} display={plata(m.monto)}
                          onSave={(v) => { const n = aNumero(v); if (isNaN(n) || n <= 0) { alert('Ingresá un monto válido.'); return } editarMov(m, { monto: n }) }} /> : ''}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium">{plata(m.saldo)}</td>
                      <td className="py-1.5 text-xs">{!auto && <button onClick={() => borrarMov(m)} className="text-slate-400 hover:text-red-600">eliminar</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Conteo de billetes */}
          <details className="mb-6" open>
            <summary className="cursor-pointer text-base font-semibold text-slate-800 mb-3">Contar la caja</summary>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 mb-3 max-w-2xl">
              {BILLETES.map((b) => (
                <label key={b} className="text-xs text-slate-500">{plata(b)}
                  <input inputMode="numeric" value={conteo[String(b)] || ''} onChange={(e) => setConteo((p) => ({ ...p, [String(b)]: e.target.value.replace(/\D/g, '') }))} className={`${inp} block mt-1 w-full text-right`} placeholder="0" />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2 mb-3">
              <div><div className="text-xs text-slate-400">Contado</div><div className="text-xl font-semibold text-slate-800">{plata(totalContado)}</div></div>
              <div><div className="text-xs text-slate-400">Debería haber (según el sistema)</div><div className="text-xl font-semibold text-slate-800">{plata(saldoCaja)}</div></div>
              <div><div className="text-xs text-slate-400">Diferencia</div><div className={`text-xl font-semibold ${diferencia === 0 ? 'text-emerald-600' : 'text-red-600'}`}>{plata(diferencia)}</div></div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500">Fecha
                <input type="date" value={aFecha} onChange={(e) => setAFecha(e.target.value)} className={`${inp} block mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Nota (opcional)
                <input value={aNota} onChange={(e) => setANota(e.target.value)} className={`${inp} block mt-1 w-56`} />
              </label>
              <button onClick={guardarArqueo} className="text-sm bg-slate-800 text-white px-4 py-1.5 rounded-md hover:bg-slate-700">Guardar este conteo</button>
            </div>

            {arqueos.length > 0 && (
              <table className="w-full max-w-2xl text-sm border-collapse mt-5">
                <thead><tr className="text-left"><th className={th}>Fecha</th><th className={`${th} text-right`}>Contado</th><th className={`${th} text-right`}>Sistema</th><th className={`${th} text-right`}>Diferencia</th><th className={th}>Nota</th><th></th></tr></thead>
                <tbody>
                  {arqueos.map((a) => {
                    const d = Number(a.total_contado) - Number(a.saldo_sistema)
                    return (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{fechaAR(a.fecha)}</td>
                        <td className="py-1.5 pr-3 text-right">{plata(a.total_contado)}</td>
                        <td className="py-1.5 pr-3 text-right">{plata(a.saldo_sistema)}</td>
                        <td className={`py-1.5 pr-3 text-right font-medium ${d === 0 ? 'text-emerald-600' : 'text-red-600'}`}>{plata(d)}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{a.nota || ''}</td>
                        <td className="py-1.5 text-xs"><button onClick={() => borrarArqueo(a)} className="text-slate-400 hover:text-red-600">eliminar</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </details>
        </>
      )}
    </main>
  )
}
