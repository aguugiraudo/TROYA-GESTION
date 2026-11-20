'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tab = 'semana' | 'maquinas' | 'historial'
type Bucket = 'atrasada' | 'semana' | 'proxima' | 'mes' | 'despues'

// ---------- fechas (todas en formato AAAA-MM-DD, hora local) ----------
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function today() {
  return iso(new Date())
}
function parse(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(s: string, n: number) {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
function diffDays(a: string, b: string) {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
}
function shortDate(s: string | null) {
  if (!s) return '—'
  return s.split('T')[0].split('-').reverse().join('/')
}
// Domingo de la semana de una fecha (la semana va de lunes a domingo)
function sundayOf(s: string) {
  const d = parse(s)
  const dow = d.getDay() // 0 = domingo
  return addDays(s, dow === 0 ? 0 : 7 - dow)
}
function endOfMonth(s: string) {
  const d = parse(s)
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function fmtN(n: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)
}

function bucketOf(proximo: string | null): Bucket | null {
  if (!proximo) return null
  const t = today()
  if (proximo < t) return 'atrasada'
  const dom = sundayOf(t)
  if (proximo <= dom) return 'semana'
  if (proximo <= addDays(dom, 7)) return 'proxima'
  if (proximo <= endOfMonth(t)) return 'mes'
  return 'despues'
}

function cuandoTexto(proximo: string | null) {
  if (!proximo) return 'Sin fecha'
  const d = diffDays(proximo, today())
  if (d < 0) return d === -1 ? 'Atrasada desde ayer' : `Atrasada hace ${-d} días`
  if (d === 0) return 'Toca hoy'
  if (d === 1) return 'Toca mañana'
  return `En ${d} días (${shortDate(proximo)})`
}

function frecuenciaTexto(t: any) {
  const v = Number(t.frecuencia_valor)
  const u = t.frecuencia_unidad
  if (u === 'dias') return v === 1 ? 'Todos los días' : `Cada ${v} días`
  if (u === 'semanas') return v === 1 ? 'Cada semana' : `Cada ${v} semanas`
  return v === 1 ? 'Cada mes' : `Cada ${v} meses`
}

function durTexto(min: number | null) {
  if (!min) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const BUCKET_INFO: Record<Bucket, { label: string; head: string; badge: string }> = {
  atrasada: { label: 'Atrasadas', head: 'text-rose-700', badge: 'bg-rose-100 text-rose-700' },
  semana: { label: 'Esta semana', head: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  proxima: { label: 'Semana próxima', head: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  mes: { label: 'Más adelante este mes', head: 'text-slate-600', badge: 'bg-slate-100 text-slate-600' },
  despues: { label: 'Al día', head: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
}

// Máquinas críticas para arrancar con un toque (el sector se busca por nombre; si no coincide queda sin sector)
const SUGERIDAS: { nombre: string; re: RegExp | null }[] = [
  { nombre: 'Máquina láser', re: /l[aá]ser|corte/i },
  { nombre: 'Compresor', re: null },
  { nombre: 'Plegadora', re: /plegad/i },
  { nombre: 'Cabina de pintura', re: /pintur/i },
  { nombre: 'Soldadora', re: /soldad/i },
]

export default function MantenimientoPage() {
  const { role } = useAuth()
  // El encargado (y el dueño) cargan, programan y marcan "Hecho"; el resto solo mira
  const canEdit = role === 'perfil_1' || role === 'perfil_2'
  const esDueno = role === 'perfil_1'

  const [tab, setTab] = useState<Tab>('semana')
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)

  const [sectors, setSectors] = useState<any[]>([])
  const [maquinas, setMaquinas] = useState<any[]>([])
  const [tareas, setTareas] = useState<any[]>([])
  const [tareaInsumos, setTareaInsumos] = useState<any[]>([])
  const [insumos, setInsumos] = useState<any[]>([])
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({})
  const [operators, setOperators] = useState<any[]>([])
  const [registros, setRegistros] = useState<any[]>([])
  const [histFiltro, setHistFiltro] = useState('')

  // --- modal Hecho ---
  const [hechoTarea, setHechoTarea] = useState<any | null>(null)
  const [hFecha, setHFecha] = useState(today())
  const [hQuien, setHQuien] = useState('')
  const [hExterno, setHExterno] = useState('')
  const [hNota, setHNota] = useState('')
  const [hInsumos, setHInsumos] = useState<Record<string, { usar: boolean; cant: string }>>({})
  const [saving, setSaving] = useState(false)

  // --- modal Máquina ---
  const [maqModal, setMaqModal] = useState<{ id: string | null } | null>(null)
  const [mNombre, setMNombre] = useState('')
  const [mSector, setMSector] = useState('')
  const [mMarca, setMMarca] = useState('')
  const [mCritica, setMCritica] = useState(false)
  const [mNotas, setMNotas] = useState('')

  // --- modal Tarea ---
  const [tareaModal, setTareaModal] = useState<{ id: string | null; maquinaId: string } | null>(null)
  const [tNombre, setTNombre] = useState('')
  const [tValor, setTValor] = useState('3')
  const [tUnidad, setTUnidad] = useState('meses')
  const [tUltima, setTUltima] = useState('')
  const [tInicio, setTInicio] = useState(today())
  const [tDuracion, setTDuracion] = useState('')
  const [tParada, setTParada] = useState(false)
  const [tResponsable, setTResponsable] = useState('interno')
  const [tInstrucciones, setTInstrucciones] = useState('')
  const [tInsumos, setTInsumos] = useState<{ insumo_id: string; cantidad: string }[]>([])
  const [tInsSearch, setTInsSearch] = useState('')

  // --- modal Reprogramar ---
  const [reprog, setReprog] = useState<any | null>(null)
  const [reprogFecha, setReprogFecha] = useState(today())

  async function fetchAll() {
    const [secR, maqR, tarR, tiR, insR, stR, opR, regR] = await Promise.all([
      supabase.from('sectors').select('id, name, sequence_no').order('sequence_no'),
      supabase.from('mant_maquinas').select('*').order('nombre'),
      supabase.from('mant_tareas').select('*').order('proximo', { ascending: true }),
      supabase.from('mant_tarea_insumos').select('*'),
      supabase.from('insumos').select('id, nombre, codigo, unidad_medida').order('nombre'),
      supabase.from('insumo_stock').select('*'),
      supabase.from('operators').select('id, full_name').eq('active', true).order('full_name'),
      supabase
        .from('mant_registros')
        .select('*, operators(full_name)')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
    ])
    if (maqR.error || tarR.error) {
      setSetupError((maqR.error || tarR.error)!.message)
      setLoading(false)
      return
    }
    setSetupError(null)
    setSectors(secR.data || [])
    setMaquinas(maqR.data || [])
    setTareas(tarR.data || [])
    setTareaInsumos(tiR.data || [])
    setInsumos(insR.data || [])
    const stockMap: Record<string, number> = {}
    ;(stR.data || []).forEach((r: any) => { stockMap[r.insumo_id] = Number(r.stock_actual) })
    setStockByItem(stockMap)
    setOperators(opR.data || [])
    setRegistros(regR.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ---------- datos derivados ----------
  const maqById: Record<string, any> = {}
  maquinas.forEach((m) => { maqById[m.id] = m })
  const secById: Record<string, any> = {}
  sectors.forEach((s) => { secById[s.id] = s })
  const insById: Record<string, any> = {}
  insumos.forEach((i) => { insById[i.id] = i })
  const tareaById: Record<string, any> = {}
  tareas.forEach((t) => { tareaById[t.id] = t })

  function sectorNombre(maq: any) {
    return (maq?.sector_id && secById[maq.sector_id]?.name) || 'Sin sector'
  }
  function insumosDe(tareaId: string) {
    return tareaInsumos.filter((x) => x.tarea_id === tareaId)
  }
  function ultimoRegistro(tareaId: string) {
    return registros.find((r) => r.tarea_id === tareaId) || null
  }
  function quienTexto(r: any) {
    if (!r) return ''
    if (r.operators?.full_name) return r.operators.full_name
    return r.externo || 'Externo'
  }

  const tareasConBucket = tareas
    .filter((t) => maqById[t.maquina_id])
    .map((t) => ({ t, b: bucketOf(t.proximo) }))

  const cntAtrasadas = tareasConBucket.filter((x) => x.b === 'atrasada').length
  const cntSemana = tareasConBucket.filter((x) => x.b === 'semana').length
  const cntMes = tareasConBucket.filter((x) => x.b && x.b !== 'atrasada' && x.b !== 'despues' && (x.t.proximo as string) <= endOfMonth(today())).length

  // ---------- Hecho ----------
  function abrirHecho(t: any) {
    setHechoTarea(t)
    setHFecha(today())
    setHQuien('')
    setHExterno('')
    setHNota('')
    const m: Record<string, { usar: boolean; cant: string }> = {}
    insumosDe(t.id).forEach((x) => { m[x.insumo_id] = { usar: true, cant: String(x.cantidad) } })
    setHInsumos(m)
  }

  async function guardarHecho() {
    if (!hechoTarea) return
    if (!hQuien) { alert('Elegí quién lo hizo (o "Proveedor externo").'); return }
    if (!hFecha) { alert('Falta la fecha.'); return }
    if (hFecha > today()) { alert('La fecha no puede ser futura.'); return }
    const maq = maqById[hechoTarea.maquina_id]
    const externo = hQuien === 'externo'
    setSaving(true)
    const { error } = await supabase.from('mant_registros').insert({
      tarea_id: hechoTarea.id,
      fecha: hFecha,
      operator_id: externo ? null : hQuien,
      externo: externo ? (hExterno.trim() || 'Proveedor externo') : null,
      nota: hNota.trim() || null,
    })
    if (error) { setSaving(false); alert('No se pudo guardar: ' + error.message); return }

    // Descuenta del stock de Insumos lo que se usó (si quedó tildado)
    const egresos = Object.entries(hInsumos)
      .filter(([, v]) => v.usar && parseFloat((v.cant || '').replace(',', '.')) > 0)
      .map(([insumoId, v]) => ({
        insumo_id: insumoId,
        tipo: 'egreso',
        cantidad: parseFloat(v.cant.replace(',', '.')),
        operator_id: externo ? null : hQuien,
        motivo: `Mantenimiento: ${maq?.nombre || ''} — ${hechoTarea.nombre}`,
        fecha: hFecha,
      }))
    if (egresos.length > 0) {
      const { error: e2 } = await supabase.from('insumo_movimientos').insert(egresos)
      if (e2) alert('El mantenimiento quedó registrado, pero no se pudo descontar el stock de insumos: ' + e2.message)
    }
    setSaving(false)
    setHechoTarea(null)
    fetchAll()
  }

  async function borrarRegistro(id: string) {
    if (!confirm('¿Eliminar este registro? El próximo vencimiento se recalcula con el registro anterior. (El stock de insumos descontado no se devuelve solo.)')) return
    await supabase.from('mant_registros').delete().eq('id', id)
    fetchAll()
  }

  // ---------- Máquinas ----------
  function abrirMaquina(m: any | null, preset?: { nombre: string; sector_id: string; critica: boolean }) {
    setMaqModal({ id: m ? m.id : null })
    setMNombre(m ? m.nombre : preset?.nombre || '')
    setMSector(m ? m.sector_id || '' : preset?.sector_id || '')
    setMMarca(m ? m.marca_modelo || '' : '')
    setMCritica(m ? !!m.critica : preset?.critica || false)
    setMNotas(m ? m.notas || '' : '')
  }

  async function guardarMaquina() {
    if (!maqModal) return
    if (!mNombre.trim()) { alert('Poné el nombre de la máquina.'); return }
    const payload = {
      nombre: mNombre.trim(),
      sector_id: mSector || null,
      marca_modelo: mMarca.trim() || null,
      critica: mCritica,
      notas: mNotas.trim() || null,
    }
    const res = maqModal.id
      ? await supabase.from('mant_maquinas').update(payload).eq('id', maqModal.id)
      : await supabase.from('mant_maquinas').insert(payload)
    if (res.error) { alert('No se pudo guardar: ' + res.error.message); return }
    setMaqModal(null)
    fetchAll()
  }

  async function borrarMaquina(m: any) {
    const n = tareas.filter((t) => t.maquina_id === m.id).length
    if (!confirm(`¿Eliminar "${m.nombre}"${n > 0 ? ` junto con sus ${n} tarea(s) y todo su historial` : ''}? No se puede deshacer.`)) return
    await supabase.from('mant_maquinas').delete().eq('id', m.id)
    fetchAll()
  }

  async function agregarSugerida(s: { nombre: string; re: RegExp | null }) {
    const sec = s.re ? sectors.find((x) => s.re!.test(x.name || '')) : null
    const { error } = await supabase.from('mant_maquinas').insert({ nombre: s.nombre, sector_id: sec?.id || null, critica: true })
    if (error) { alert('No se pudo crear: ' + error.message); return }
    fetchAll()
  }

  // ---------- Tareas ----------
  function abrirTarea(maquinaId: string, t: any | null) {
    setTareaModal({ id: t ? t.id : null, maquinaId })
    setTNombre(t ? t.nombre : '')
    setTValor(t ? String(t.frecuencia_valor) : '3')
    setTUnidad(t ? t.frecuencia_unidad : 'meses')
    setTUltima('')
    setTInicio(t ? t.fecha_inicio : today())
    setTDuracion(t && t.duracion_min ? String(t.duracion_min) : '')
    setTParada(t ? !!t.requiere_parada : false)
    setTResponsable(t ? t.responsable : 'interno')
    setTInstrucciones(t ? t.instrucciones || '' : '')
    setTInsumos(t ? insumosDe(t.id).map((x) => ({ insumo_id: x.insumo_id, cantidad: String(x.cantidad) })) : [])
    setTInsSearch('')
  }

  async function guardarTarea() {
    if (!tareaModal) return
    if (!tNombre.trim()) { alert('Poné el nombre de la tarea (ej: Cambio de aceite).'); return }
    const valor = parseInt(tValor, 10)
    if (!valor || valor <= 0) { alert('Poné cada cuánto se repite (un número mayor a 0).'); return }
    if (!tareaModal.id && !tUltima && !tInicio) { alert('Poné cuándo se hizo la última vez o cuándo toca la primera.'); return }
    if (tUltima && tUltima > today()) { alert('La última vez no puede ser una fecha futura.'); return }
    const dur = tDuracion ? parseInt(tDuracion, 10) : null

    const payload: any = {
      maquina_id: tareaModal.maquinaId,
      nombre: tNombre.trim(),
      frecuencia_valor: valor,
      frecuencia_unidad: tUnidad,
      duracion_min: dur && dur > 0 ? dur : null,
      requiere_parada: tParada,
      responsable: tResponsable,
      instrucciones: tInstrucciones.trim() || null,
    }
    if (tInicio) payload.fecha_inicio = tInicio

    let tareaId = tareaModal.id
    if (tareaId) {
      const { error } = await supabase.from('mant_tareas').update(payload).eq('id', tareaId)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('mant_tareas').insert(payload).select().single()
      if (error || !data) { alert('No se pudo guardar: ' + (error?.message || 'error desconocido')); return }
      tareaId = data.id
      if (tUltima) {
        const { error: e2 } = await supabase.from('mant_registros').insert({ tarea_id: tareaId, fecha: tUltima, nota: 'Carga inicial' })
        if (e2) alert('La tarea se creó, pero no se pudo guardar la última vez: ' + e2.message)
      }
    }

    // Insumos de la tarea: se reemplaza la lista completa
    await supabase.from('mant_tarea_insumos').delete().eq('tarea_id', tareaId)
    const filas = tInsumos
      .map((x) => ({ tarea_id: tareaId, insumo_id: x.insumo_id, cantidad: parseFloat((x.cantidad || '').replace(',', '.')) }))
      .filter((x) => x.cantidad > 0)
    if (filas.length > 0) await supabase.from('mant_tarea_insumos').insert(filas)

    setTareaModal(null)
    fetchAll()
  }

  async function borrarTarea(t: any) {
    if (!confirm(`¿Eliminar la tarea "${t.nombre}" y todo su historial? No se puede deshacer.`)) return
    await supabase.from('mant_tareas').delete().eq('id', t.id)
    fetchAll()
  }

  async function guardarReprog() {
    if (!reprog || !reprogFecha) return
    const { error } = await supabase.from('mant_tareas').update({ proximo: reprogFecha }).eq('id', reprog.id)
    if (error) { alert('No se pudo reprogramar: ' + error.message); return }
    setReprog(null)
    fetchAll()
  }

  // ---------- Reporte semanal ----------
  function agruparPorSector(items: { t: any; b: Bucket | null }[]) {
    const g: Record<string, { sector: string; seq: number; items: any[] }> = {}
    items.forEach(({ t }) => {
      const maq = maqById[t.maquina_id]
      const sec = maq?.sector_id ? secById[maq.sector_id] : null
      const key = sec?.id || 'none'
      if (!g[key]) g[key] = { sector: sec?.name || 'Sin sector', seq: sec?.sequence_no ?? 999, items: [] }
      g[key].items.push(t)
    })
    return Object.values(g).sort((a, b) => a.seq - b.seq)
  }

  function resumenTexto() {
    const L: string[] = [`MANTENIMIENTO PREVENTIVO — semana del ${shortDate(today())}`]
    ;(['atrasada', 'semana', 'proxima', 'mes'] as Bucket[]).forEach((b) => {
      const items = tareasConBucket.filter((x) => x.b === b)
      if (items.length === 0) return
      L.push('', BUCKET_INFO[b].label.toUpperCase())
      items.forEach(({ t }) => {
        const maq = maqById[t.maquina_id]
        L.push(`• ${maq?.nombre} (${sectorNombre(maq)}): ${t.nombre} — ${cuandoTexto(t.proximo)}${t.requiere_parada ? ' — hay que parar la máquina' : ''}`)
      })
    })
    if (L.length === 1) L.push('', 'No hay mantenimientos atrasados ni programados para este mes.')
    return L.join('\n')
  }

  async function copiarResumen() {
    try {
      await navigator.clipboard.writeText(resumenTexto())
      alert('Copiado. Pegalo donde quieras (WhatsApp, mail).')
    } catch {
      alert('No se pudo copiar automáticamente.')
    }
  }

  // ---------- tarjeta de una tarea (reporte) ----------
  function TareaCard({ t }: { t: any }) {
    const maq = maqById[t.maquina_id]
    const ult = ultimoRegistro(t.id)
    const ins = insumosDe(t.id)
    const b = bucketOf(t.proximo) as Bucket
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {maq?.nombre} <span className="text-slate-400 font-normal">·</span> {t.nombre}
            {maq?.critica && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 align-middle">Crítica</span>}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className={`font-semibold ${b === 'atrasada' ? 'text-rose-600' : 'text-slate-600'}`}>{cuandoTexto(t.proximo)}</span>
            {' · '}{frecuenciaTexto(t)}
            {' · '}Última vez: {t.ultima_fecha ? `${shortDate(t.ultima_fecha)}${ult && ult.fecha === t.ultima_fecha ? ` (${quienTexto(ult)})` : ''}` : 'sin registro'}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {t.requiere_parada && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Hay que parar la máquina</span>}
            {t.duracion_min && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{durTexto(t.duracion_min)}</span>}
            {t.responsable === 'externo' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Lo hace un proveedor</span>}
            {ins.map((x) => {
              const it = insById[x.insumo_id]
              const stock = stockByItem[x.insumo_id] || 0
              const ok = stock >= Number(x.cantidad)
              return (
                <span key={x.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {it?.nombre || 'Insumo'} ×{fmtN(Number(x.cantidad))}{' '}
                  {ok ? '· hay stock' : `· stock ${fmtN(stock)}, faltan ${fmtN(Number(x.cantidad) - stock)}`}
                </span>
              )
            })}
          </div>
          {t.instrucciones && <p className="text-xs text-slate-400 italic mt-1.5 whitespace-pre-line">{t.instrucciones}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2 shrink-0 print:hidden">
            <button onClick={() => abrirHecho(t)} className="bg-emerald-600 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-emerald-700">
              Hecho
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  if (setupError) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-800 mb-3">Mantenimiento</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Falta crear las tablas de este módulo en la base de datos. Corré el SQL <strong>mantenimiento_tablas.sql</strong> en el SQL Editor de Supabase y recargá la página.
          <p className="text-xs text-amber-600 mt-2">Detalle técnico: {setupError}</p>
        </div>
      </main>
    )
  }

  // agrupación Máquinas por sector
  const maquinasPorSector: Record<string, { sector: string; seq: number; items: any[] }> = {}
  maquinas.forEach((m) => {
    const sec = m.sector_id ? secById[m.sector_id] : null
    const key = sec?.id || 'none'
    if (!maquinasPorSector[key]) maquinasPorSector[key] = { sector: sec?.name || 'Sin sector', seq: sec?.sequence_no ?? 999, items: [] }
    maquinasPorSector[key].items.push(m)
  })
  const sectoresOrdenados = Object.values(maquinasPorSector).sort((a, b) => a.seq - b.seq)

  const hechoMaq = hechoTarea ? maqById[hechoTarea.maquina_id] : null
  const insFiltrados = tInsSearch.trim().length > 0
    ? insumos.filter((i) => `${i.nombre} ${i.codigo || ''}`.toLowerCase().includes(tInsSearch.toLowerCase()) && !tInsumos.some((x) => x.insumo_id === i.id)).slice(0, 8)
    : []

  const historialFiltrado = registros.filter((r) => {
    if (!histFiltro) return true
    const t = tareaById[r.tarea_id]
    return t && t.maquina_id === histFiltro
  })

  const SEMANA_BUCKETS: Bucket[] = ['atrasada', 'semana', 'proxima', 'mes']

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Mantenimiento preventivo</h1>
      <p className="text-sm text-slate-500 mb-5">
        Máquinas por sector, sus tareas programadas y el registro de lo que se hizo. Cada vez que se marca "Hecho", el próximo vencimiento se calcula solo.
      </p>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className={`rounded-xl border p-3 ${cntAtrasadas > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <p className="text-xs text-slate-500">Atrasadas</p>
          <p className={`text-2xl font-semibold ${cntAtrasadas > 0 ? 'text-rose-700' : 'text-slate-700'}`}>{cntAtrasadas}</p>
        </div>
        <div className="rounded-xl border bg-white border-slate-200 p-3">
          <p className="text-xs text-slate-500">Esta semana</p>
          <p className="text-2xl font-semibold text-slate-700">{cntSemana}</p>
        </div>
        <div className="rounded-xl border bg-white border-slate-200 p-3">
          <p className="text-xs text-slate-500">Este mes</p>
          <p className="text-2xl font-semibold text-slate-700">{cntMes}</p>
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2 print:hidden">
          Modo solo lectura — solo el encargado puede cargar y marcar mantenimientos.
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 print:hidden">
        {([
          ['semana', 'Esta semana'],
          ['maquinas', 'Máquinas'],
          ['historial', 'Historial'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===================== ESTA SEMANA ===================== */}
      {tab === 'semana' && (
        <>
          <div className="flex justify-end gap-2 mb-4 print:hidden">
            <button onClick={copiarResumen} className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-50">Copiar resumen</button>
            <button onClick={() => window.print()} className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-50">Imprimir</button>
          </div>

          {maquinas.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
              Todavía no hay máquinas cargadas. Andá a la pestaña <strong>Máquinas</strong> para empezar.
            </div>
          ) : tareas.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
              Ya hay máquinas, pero ninguna tiene tareas programadas. En <strong>Máquinas</strong>, tocá "+ Tarea" en cada una.
            </div>
          ) : tareasConBucket.every((x) => !x.b || x.b === 'despues') ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-sm text-emerald-700">
              Todo al día: no hay mantenimientos atrasados ni programados para lo que queda del mes.
            </div>
          ) : (
            <div className="space-y-6">
              {SEMANA_BUCKETS.map((b) => {
                const items = tareasConBucket.filter((x) => x.b === b)
                if (items.length === 0) return null
                return (
                  <section key={b}>
                    <h2 className={`text-sm font-bold uppercase tracking-wide mb-2 ${BUCKET_INFO[b].head}`}>
                      {BUCKET_INFO[b].label} ({items.length})
                    </h2>
                    <div className="space-y-4">
                      {agruparPorSector(items).map((g) => (
                        <div key={g.sector}>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{g.sector}</p>
                          <div className="space-y-2">
                            {g.items.map((t: any) => <TareaCard key={t.id} t={t} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===================== MÁQUINAS ===================== */}
      {tab === 'maquinas' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-400">
              {maquinas.length} máquina(s) · {tareas.length} tarea(s) cargadas
            </p>
            {canEdit && (
              <button onClick={() => abrirMaquina(null)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
                + Nueva máquina
              </button>
            )}
          </div>

          {maquinas.length === 0 && canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Empecemos por las máquinas críticas</p>
              <p className="text-xs text-slate-500 mb-3">Tocá cada una para crearla (después le cambiás el nombre o el sector si hace falta):</p>
              <div className="flex flex-wrap gap-2">
                {SUGERIDAS.map((s) => (
                  <button key={s.nombre} onClick={() => agregarSugerida(s)} className="text-sm border border-slate-300 rounded-full px-3 py-1.5 hover:bg-slate-50">
                    + {s.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {sectoresOrdenados.map((g) => (
              <section key={g.sector}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.sector}</p>
                <div className="space-y-3">
                  {g.items.map((m) => {
                    const ts = tareas.filter((t) => t.maquina_id === m.id)
                    return (
                      <div key={m.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap bg-slate-50 border-b border-slate-100">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">
                              {m.nombre}
                              {m.critica && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 align-middle">Crítica</span>}
                            </p>
                            {(m.marca_modelo || m.notas) && (
                              <p className="text-xs text-slate-400">{[m.marca_modelo, m.notas].filter(Boolean).join(' — ')}</p>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-3 text-xs">
                              <button onClick={() => abrirTarea(m.id, null)} className="text-blue-600 hover:underline font-medium">+ Tarea</button>
                              <button onClick={() => abrirMaquina(m)} className="text-slate-500 hover:underline">Editar</button>
                              {esDueno && <button onClick={() => borrarMaquina(m)} className="text-rose-500 hover:underline">Eliminar</button>}
                            </div>
                          )}
                        </div>

                        {ts.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-amber-600">Sin tareas cargadas todavía.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="text-left text-xs text-slate-400">
                                  <th className="px-4 py-2 font-medium">Tarea</th>
                                  <th className="px-2 py-2 font-medium">Frecuencia</th>
                                  <th className="px-2 py-2 font-medium">Última vez</th>
                                  <th className="px-2 py-2 font-medium">Próxima</th>
                                  <th className="px-2 py-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {ts.map((t) => {
                                  const b = bucketOf(t.proximo) as Bucket
                                  const ult = ultimoRegistro(t.id)
                                  return (
                                    <tr key={t.id} className="border-t border-slate-100">
                                      <td className="px-4 py-2.5 text-slate-700 font-medium">{t.nombre}</td>
                                      <td className="px-2 py-2.5 text-slate-500 whitespace-nowrap">{frecuenciaTexto(t)}</td>
                                      <td className="px-2 py-2.5 text-slate-500 whitespace-nowrap">
                                        {t.ultima_fecha ? `${shortDate(t.ultima_fecha)}${ult && ult.fecha === t.ultima_fecha ? ` · ${quienTexto(ult)}` : ''}` : '—'}
                                      </td>
                                      <td className="px-2 py-2.5 whitespace-nowrap">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BUCKET_INFO[b].badge}`}>
                                          {b === 'despues' ? shortDate(t.proximo) : cuandoTexto(t.proximo)}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                                        {canEdit && (
                                          <div className="flex items-center justify-end gap-3 text-xs pr-2">
                                            <button onClick={() => abrirHecho(t)} className="text-emerald-600 hover:underline font-medium">Hecho</button>
                                            <button onClick={() => { setReprog(t); setReprogFecha(t.proximo || today()) }} className="text-slate-500 hover:underline">Reprogramar</button>
                                            <button onClick={() => abrirTarea(m.id, t)} className="text-slate-500 hover:underline">Editar</button>
                                            {esDueno && <button onClick={() => borrarTarea(t)} className="text-rose-500 hover:underline">Eliminar</button>}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {/* ===================== HISTORIAL ===================== */}
      {tab === 'historial' && (
        <>
          <div className="mb-4">
            <select value={histFiltro} onChange={(e) => setHistFiltro(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todas las máquinas</option>
              {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          {historialFiltrado.length === 0 ? (
            <p className="text-slate-400 text-sm">Todavía no hay mantenimientos registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Máquina</th>
                    <th className="p-3 font-medium">Tarea</th>
                    <th className="p-3 font-medium">Quién</th>
                    <th className="p-3 font-medium">Nota</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {historialFiltrado.map((r) => {
                    const t = tareaById[r.tarea_id]
                    const maq = t ? maqById[t.maquina_id] : null
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="p-3 text-slate-500 whitespace-nowrap">{shortDate(r.fecha)}</td>
                        <td className="p-3 text-slate-700">{maq?.nombre || '—'}</td>
                        <td className="p-3 text-slate-700">{t?.nombre || '—'}</td>
                        <td className="p-3 text-slate-600">{quienTexto(r)}</td>
                        <td className="p-3 text-slate-500 italic">{r.nota || '—'}</td>
                        <td className="p-3 text-right">
                          {esDueno && <button onClick={() => borrarRegistro(r.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== MODAL: HECHO ===================== */}
      {hechoTarea && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setHechoTarea(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg">Marcar como hecho</h3>
            <p className="text-sm text-slate-500 mb-4">{hechoMaq?.nombre} — {hechoTarea.nombre}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Fecha en que se hizo</label>
                  <input type="date" value={hFecha} max={today()} onChange={(e) => setHFecha(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Quién lo hizo</label>
                  <select value={hQuien} onChange={(e) => setHQuien(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                    <option value="">Elegí...</option>
                    {operators.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                    <option value="externo">Proveedor externo</option>
                  </select>
                </div>
              </div>
              {hQuien === 'externo' && (
                <div>
                  <label className="text-xs text-slate-500">¿Qué proveedor o técnico?</label>
                  <input value={hExterno} onChange={(e) => setHExterno(e.target.value)} placeholder="Ej: servicio técnico del láser" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500">Nota (opcional)</label>
                <input value={hNota} onChange={(e) => setHNota(e.target.value)} placeholder="Ej: se cambió también la correa" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>

              {insumosDe(hechoTarea.id).length > 0 && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Insumos usados (se descuentan del stock)</p>
                  <div className="space-y-1.5">
                    {insumosDe(hechoTarea.id).map((x) => {
                      const it = insById[x.insumo_id]
                      const v = hInsumos[x.insumo_id] || { usar: false, cant: String(x.cantidad) }
                      return (
                        <div key={x.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={v.usar} onChange={(e) => setHInsumos((p) => ({ ...p, [x.insumo_id]: { ...v, usar: e.target.checked } }))} className="w-4 h-4" />
                          <span className="flex-1 text-slate-700 truncate">{it?.nombre}</span>
                          <input type="number" value={v.cant} onChange={(e) => setHInsumos((p) => ({ ...p, [x.insumo_id]: { ...v, cant: e.target.value } }))} className="w-16 text-center rounded-md border border-slate-300 py-0.5 text-sm" />
                          <span className="text-xs text-slate-400 w-8">{it?.unidad_medida}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setHechoTarea(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarHecho} disabled={saving} className="flex-1 bg-emerald-600 text-white rounded-md py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: MÁQUINA ===================== */}
      {maqModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMaqModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg mb-4">{maqModal.id ? 'Editar máquina' : 'Nueva máquina'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Nombre</label>
                <input value={mNombre} onChange={(e) => setMNombre(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Sector</label>
                <select value={mSector} onChange={(e) => setMSector(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                  <option value="">Sin sector (general)</option>
                  {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Marca y modelo (opcional)</label>
                <input value={mMarca} onChange={(e) => setMMarca(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={mCritica} onChange={(e) => setMCritica(e.target.checked)} className="w-4 h-4" />
                Máquina crítica (si se rompe, frena la producción)
              </label>
              <div>
                <label className="text-xs text-slate-500">Notas (opcional)</label>
                <input value={mNotas} onChange={(e) => setMNotas(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMaqModal(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarMaquina} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: TAREA ===================== */}
      {tareaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTareaModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg">{tareaModal.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
            <p className="text-sm text-slate-500 mb-4">{maqById[tareaModal.maquinaId]?.nombre}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Qué hay que hacer</label>
                <input value={tNombre} onChange={(e) => setTNombre(e.target.value)} placeholder="Ej: Cambio de aceite" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Cada cuánto se repite</label>
                <div className="flex gap-2 mt-1">
                  <input type="number" min={1} value={tValor} onChange={(e) => setTValor(e.target.value)} className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-sm text-center" />
                  <select value={tUnidad} onChange={(e) => setTUnidad(e.target.value)} className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                    <option value="dias">días</option>
                    <option value="semanas">semanas</option>
                    <option value="meses">meses</option>
                  </select>
                </div>
              </div>

              {!tareaModal.id ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Última vez que se hizo</label>
                    <input type="date" value={tUltima} max={today()} onChange={(e) => setTUltima(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Si no se sabe: primera vez</label>
                    <input type="date" value={tInicio} onChange={(e) => setTInicio(e.target.value)} disabled={!!tUltima} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1 disabled:bg-slate-100 disabled:text-slate-400" />
                  </div>
                  <p className="col-span-2 text-[11px] text-slate-400 -mt-1">
                    Si cargás la última vez, el próximo vencimiento se calcula solo. Si no se sabe, poné cuándo querés que toque la primera.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Próximo vencimiento actual: <strong>{shortDate(tareaById[tareaModal.id]?.proximo)}</strong>. Para moverlo usá "Reprogramar".
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Cuánto tarda (minutos, opcional)</label>
                  <input type="number" min={1} value={tDuracion} onChange={(e) => setTDuracion(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Quién lo hace</label>
                  <select value={tResponsable} onChange={(e) => setTResponsable(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                    <option value="interno">Personal propio</option>
                    <option value="externo">Proveedor externo</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={tParada} onChange={(e) => setTParada(e.target.checked)} className="w-4 h-4" />
                Hay que parar la máquina para hacerlo
              </label>
              <div>
                <label className="text-xs text-slate-500">Instrucciones o aclaraciones (opcional)</label>
                <textarea value={tInstrucciones} onChange={(e) => setTInstrucciones(e.target.value)} rows={2} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 mb-2">Insumos que necesita (avisa si hay stock)</p>
                {tInsumos.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {tInsumos.map((x, idx) => {
                      const it = insById[x.insumo_id]
                      return (
                        <div key={x.insumo_id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-slate-700 truncate">{it?.nombre}</span>
                          <input type="number" value={x.cantidad} onChange={(e) => setTInsumos((p) => p.map((y, j) => (j === idx ? { ...y, cantidad: e.target.value } : y)))} className="w-16 text-center rounded-md border border-slate-300 py-0.5 text-sm" />
                          <span className="text-xs text-slate-400 w-8">{it?.unidad_medida}</span>
                          <button onClick={() => setTInsumos((p) => p.filter((_, j) => j !== idx))} className="text-slate-400 hover:text-rose-600 text-xs">✕</button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <input value={tInsSearch} onChange={(e) => setTInsSearch(e.target.value)} placeholder="Buscar insumo para agregar..." className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full bg-white" />
                {insFiltrados.length > 0 && (
                  <div className="mt-1 bg-white border border-slate-200 rounded-md max-h-40 overflow-y-auto">
                    {insFiltrados.map((i) => (
                      <div key={i.id} onClick={() => { setTInsumos((p) => [...p, { insumo_id: i.id, cantidad: '1' }]); setTInsSearch('') }}
                        className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer flex justify-between gap-2">
                        <span>{i.nombre}</span>
                        {i.codigo && <span className="text-xs text-slate-400">{i.codigo}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setTareaModal(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarTarea} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: REPROGRAMAR ===================== */}
      {reprog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setReprog(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg">Reprogramar</h3>
            <p className="text-sm text-slate-500 mb-4">{maqById[reprog.maquina_id]?.nombre} — {reprog.nombre}</p>
            <label className="text-xs text-slate-500">Nueva fecha de vencimiento</label>
            <input type="date" value={reprogFecha} onChange={(e) => setReprogFecha(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            <p className="text-[11px] text-slate-400 mt-2">Cuando se marque como hecho, el siguiente vencimiento vuelve a calcularse desde esa fecha.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setReprog(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarReprog} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
