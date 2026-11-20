'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function shortDate(iso: string | null) {
  if (!iso) return '—'
  return iso.split('T')[0].split('-').reverse().join('/')
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)
}

// Días hábiles (sin sábados ni domingos) entre dos fechas
function businessDaysBetween(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return null
  const start = new Date(startISO)
  const end = new Date(endISO.split('T')[0])
  if (end <= start) return 0
  let count = 0
  const d = new Date(start)
  while (d < end) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

// Trae todas las filas de una consulta paginando (Supabase devuelve máximo 1000 por vez)
async function fetchAllRows(build: (from: number, to: number) => any) {
  const out: any[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) break
  }
  return out
}

export default function HistorialPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [inicioByOrder, setInicioByOrder] = useState<Record<string, string>>({})
  const [producidoByOrder, setProducidoByOrder] = useState<Record<string, number>>({})
  const [ingresos, setIngresos] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filtroIngreso, setFiltroIngreso] = useState<'todas' | 'pendientes' | 'completas'>('todas')
  const [selected, setSelected] = useState<any | null>(null)
  const [detailTasks, setDetailTasks] = useState<any[]>([])
  const [hoursSummary, setHoursSummary] = useState<{ estimadas: number; reales: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({})

  // Modal de ingresos a stock (control paralelo a Tango)
  const [ingresoOrder, setIngresoOrder] = useState<any | null>(null)
  const [fFecha, setFFecha] = useState(todayISO())
  const [fCantidad, setFCantidad] = useState('')
  const [fNota, setFNota] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [ingresoMsg, setIngresoMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function fetchOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, client_name, lot_quantity, completed_at, notes, products(name)')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
    setOrders(data || [])

    const orderIds = (data || []).map((o: any) => o.id)
    if (orderIds.length > 0) {
      // Trae todas las tareas de estas OPs solo para calcular el Inicio real:
      // la primera fecha con Real cargado en el sector de menor secuencia (ej. Corte Láser)
      const { data: taskData } = await supabase
        .from('operator_daily_tasks')
        .select('order_id, plan_date, actual_quantity, sectors(sequence_no)')
        .in('order_id', orderIds)

      const minSeqByOrder: Record<string, number> = {}
      ;(taskData || []).forEach((t: any) => {
        const seq = t.sectors?.sequence_no
        if (seq == null) return
        if (minSeqByOrder[t.order_id] == null || seq < minSeqByOrder[t.order_id]) {
          minSeqByOrder[t.order_id] = seq
        }
      })

      const inicioMap: Record<string, string> = {}
      ;(taskData || []).forEach((t: any) => {
        const seq = t.sectors?.sequence_no
        if (seq == null || t.actual_quantity == null) return
        if (seq !== minSeqByOrder[t.order_id]) return
        if (!inicioMap[t.order_id] || t.plan_date < inicioMap[t.order_id]) {
          inicioMap[t.order_id] = t.plan_date
        }
      })
      setInicioByOrder(inicioMap)

      // Producido = lo que pasó por Embalaje (sector final). Si la OP no tiene renglón de Embalaje, se toma la cantidad del lote.
      try {
        const { data: secData } = await supabase.from('sectors').select('id, name')
        const embalajeIds = (secData || []).filter((s: any) => /embal/i.test(s.name || '')).map((s: any) => s.id)
        const prod: Record<string, number> = {}
        if (embalajeIds.length > 0) {
          const chunks: string[][] = []
          for (let i = 0; i < orderIds.length; i += 80) chunks.push(orderIds.slice(i, i + 80))
          for (const ch of chunks) {
            const rows = await fetchAllRows((from, to) =>
              supabase
                .from('order_progress_detail')
                .select('order_id, target_type, quantity_completed')
                .in('sector_id', embalajeIds)
                .in('order_id', ch)
                .range(from, to)
            )
            rows.forEach((r: any) => {
              if (r.target_type && r.target_type !== 'product') return
              prod[r.order_id] = (prod[r.order_id] || 0) + (Number(r.quantity_completed) || 0)
            })
          }
        }
        setProducidoByOrder(prod)
      } catch {
        setProducidoByOrder({})
      }

      try {
        const ing = await fetchAllRows((from, to) =>
          supabase.from('orden_ingresos').select('id, order_id, fecha, cantidad, nota, created_at').order('fecha', { ascending: true }).range(from, to)
        )
        setIngresos(ing)
      } catch {
        setIngresos([])
      }
    } else {
      setInicioByOrder({})
      setProducidoByOrder({})
      setIngresos([])
    }

    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  // ---- Ingresos a stock ----
  function ingresadoDe(orderId: string) {
    return ingresos.filter((i) => i.order_id === orderId).reduce((s, i) => s + Number(i.cantidad), 0)
  }
  function producidoDe(o: any) {
    const p = producidoByOrder[o.id]
    return p != null && p > 0 ? p : Number(o.lot_quantity) || 0
  }
  function pendienteDe(o: any) {
    return producidoDe(o) - ingresadoDe(o.id)
  }

  function abrirIngresos(o: any) {
    setIngresoOrder(o)
    setEditId(null)
    setFFecha(todayISO())
    setFCantidad('')
    setFNota('')
    setIngresoMsg(null)
  }

  function cerrarIngresos() {
    setIngresoOrder(null)
    setEditId(null)
    setIngresoMsg(null)
  }

  function empezarEditar(i: any) {
    setEditId(i.id)
    setFFecha(String(i.fecha).split('T')[0])
    setFCantidad(String(i.cantidad))
    setFNota(i.nota || '')
    setIngresoMsg(null)
  }

  function cancelarEditar() {
    setEditId(null)
    setFFecha(todayISO())
    setFCantidad('')
    setFNota('')
    setIngresoMsg(null)
  }

  async function guardarIngreso() {
    if (!ingresoOrder) return
    const cant = parseFloat(fCantidad.replace(',', '.'))
    if (isNaN(cant) || cant <= 0) { setIngresoMsg('Poné una cantidad mayor a 0.'); return }
    if (!fFecha) { setIngresoMsg('Falta la fecha.'); return }

    // Aviso si lo ingresado supera lo producido (no se bloquea: puede haber un ajuste de la OP)
    const otros = ingresos
      .filter((i) => i.order_id === ingresoOrder.id && i.id !== editId)
      .reduce((s, i) => s + Number(i.cantidad), 0)
    const producido = producidoDe(ingresoOrder)
    if (otros + cant > producido) {
      const ok = window.confirm(
        `Con este ingreso quedarían ${fmtNum(otros + cant)} unidades ingresadas y la orden produjo ${fmtNum(producido)}. ¿Guardar igual?`
      )
      if (!ok) return
    }

    setSaving(true)
    setIngresoMsg(null)
    const payload = { order_id: ingresoOrder.id, fecha: fFecha, cantidad: cant, nota: fNota.trim() || null }
    const res = editId
      ? await supabase.from('orden_ingresos').update(payload).eq('id', editId).select().single()
      : await supabase.from('orden_ingresos').insert(payload).select().single()
    setSaving(false)
    if (res.error || !res.data) {
      setIngresoMsg('No se pudo guardar: ' + (res.error?.message || 'error desconocido'))
      return
    }
    const saved = res.data
    setIngresos((prev) => editId ? prev.map((x) => (x.id === editId ? saved : x)) : [...prev, saved])
    cancelarEditar()
  }

  async function borrarIngreso(id: string) {
    if (!window.confirm('¿Eliminar este ingreso?')) return
    const { error } = await supabase.from('orden_ingresos').delete().eq('id', id)
    if (error) { setIngresoMsg('No se pudo eliminar: ' + error.message); return }
    setIngresos((prev) => prev.filter((x) => x.id !== id))
    if (editId === id) cancelarEditar()
  }

  function ingresoBadgeClass(o: any) {
    const ing = ingresadoDe(o.id)
    const prod = producidoDe(o)
    if (ing > prod) return 'text-rose-600'
    if (ing >= prod && prod > 0) return 'text-emerald-600'
    if (ing > 0) return 'text-amber-600'
    return 'text-slate-500'
  }

  const filtered = orders
    .filter((o) =>
      search.length === 0 ||
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name?.toLowerCase().includes(search.toLowerCase())
    )
    .filter((o) => {
      if (filtroIngreso === 'pendientes') return pendienteDe(o) > 0
      if (filtroIngreso === 'completas') return pendienteDe(o) <= 0
      return true
    })

  // Resumen: unidades terminadas que todavía no se ingresaron a stock, por producto
  const pendientesPorProducto = (() => {
    const map: Record<string, { unidades: number; ordenes: number }> = {}
    orders.forEach((o) => {
      const pend = pendienteDe(o)
      if (pend <= 0) return
      const name = o.products?.name || 'Sin producto'
      if (!map[name]) map[name] = { unidades: 0, ordenes: 0 }
      map[name].unidades += pend
      map[name].ordenes += 1
    })
    return Object.entries(map).sort((a, b) => b[1].unidades - a[1].unidades)
  })()
  const totalPendiente = pendientesPorProducto.reduce((s, [, v]) => s + v.unidades, 0)

  async function openDetail(order: any) {
    setSelected(order)
    setLoadingDetail(true)
    setExpandedSectors({})

    const { data: tasksData } = await supabase
      .from('operator_daily_tasks')
      .select('*, operators(full_name), sectors(name, sequence_no), components(name)')
      .eq('order_id', order.id)
      .order('plan_date', { ascending: true })
    setDetailTasks(tasksData || [])

    const { data: progressData } = await supabase
      .from('order_progress_detail')
      .select('minutes_required')
      .eq('order_id', order.id)
    const estimadasMin = (progressData || []).reduce((s: number, r: any) => s + r.minutes_required, 0)

    const realesMin = (tasksData || []).reduce((s: number, t: any) =>
      s + (t.actual_quantity != null ? t.actual_quantity * (t.standard_time_minutes || 0) : 0), 0)

    setHoursSummary({
      estimadas: Math.round((estimadasMin / 60) * 10) / 10,
      reales: Math.round((realesMin / 60) * 10) / 10,
    })

    setLoadingDetail(false)
  }

  function closeDetail() {
    setSelected(null)
    setDetailTasks([])
    setHoursSummary(null)
    setExpandedSectors({})
  }

  function toggleSector(sectorId: string) {
    setExpandedSectors((prev) => ({ ...prev, [sectorId]: !prev[sectorId] }))
  }

  // Agrupa las tareas del detalle por sector, en el orden de secuencia de planta
  function groupedBySector() {
    const groups: Record<string, { sectorId: string; sectorName: string; sequenceNo: number; tasks: any[] }> = {}
    detailTasks.forEach((t: any) => {
      const sectorId = t.sector_id
      const sectorName = t.sectors?.name || 'Sin sector'
      const sequenceNo = t.sectors?.sequence_no ?? 999
      if (!groups[sectorId]) groups[sectorId] = { sectorId, sectorName, sequenceNo, tasks: [] }
      groups[sectorId].tasks.push(t)
    })
    return Object.values(groups).sort((a, b) => a.sequenceNo - b.sequenceNo)
  }

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  const ingresosDeModal = ingresoOrder
    ? ingresos.filter((i) => i.order_id === ingresoOrder.id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    : []

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Historial de Órdenes</h1>
      <p className="text-sm text-slate-500 mb-6">Trazabilidad completa de las órdenes finalizadas: quién hizo qué, cuándo y cuánto. Y el control de lo que ya ingresaste a stock en Tango.</p>

      {/* Resumen de lo que falta ingresar a stock */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Falta ingresar a stock (Tango)</h2>
          <span className={`text-sm font-semibold ${totalPendiente > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {totalPendiente > 0 ? `${fmtNum(totalPendiente)} unidades` : 'Todo ingresado'}
          </span>
        </div>
        {pendientesPorProducto.length > 0 && (
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {pendientesPorProducto.map(([name, v]) => (
              <div key={name} className="flex justify-between gap-3 text-sm border-b border-slate-100 py-1">
                <span className="text-slate-600 truncate">{name}</span>
                <span className="text-slate-800 font-medium shrink-0">
                  {fmtNum(v.unidades)} <span className="text-xs text-slate-400 font-normal">({v.ordenes} {v.ordenes === 1 ? 'orden' : 'órdenes'})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          placeholder="Buscar por N° OP, producto o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm w-full sm:w-80"
        />
        <div className="flex gap-1">
          {([['todas', 'Todas'], ['pendientes', 'Con stock pendiente'], ['completas', 'Ya ingresadas']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltroIngreso(k)}
              className={`px-3 py-1.5 rounded-full text-xs border ${filtroIngreso === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-500">{orders.length === 0 ? 'Todavía no hay órdenes completadas.' : 'Ninguna orden coincide con el filtro.'}</p>
      ) : (
        <>
          {/* ===== VERSIÓN PC: tabla ===== */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-left">
                  <th className="p-3 font-medium">N° OP</th>
                  <th className="p-3 font-medium">Producto</th>
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 font-medium text-center">Cantidad</th>
                  <th className="p-3 font-medium text-center">Inicio</th>
                  <th className="p-3 font-medium text-center">Fin</th>
                  <th className="p-3 font-medium text-center">Días hábiles</th>
                  <th className="p-3 font-medium text-center">Ingresado a stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => openDetail(o)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="p-3 font-medium text-slate-700">#{o.order_number}</td>
                    <td className="p-3 text-slate-700">{o.products?.name}</td>
                    <td className="p-3 text-slate-600">{o.client_name}</td>
                    <td className="p-3 text-center text-slate-600">{o.lot_quantity}</td>
                    <td className="p-3 text-center text-slate-500">{shortDate(inicioByOrder[o.id] || null)}</td>
                    <td className="p-3 text-center text-slate-500">{shortDate(o.completed_at)}</td>
                    <td className="p-3 text-center font-medium text-slate-700">
                      {businessDaysBetween(inicioByOrder[o.id] || null, o.completed_at) ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirIngresos(o) }}
                        className={`font-semibold underline decoration-dotted underline-offset-4 hover:text-blue-700 ${ingresoBadgeClass(o)}`}
                      >
                        {fmtNum(ingresadoDe(o.id))} / {fmtNum(producidoDe(o))}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== VERSIÓN CELULAR: tarjetas ===== */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.map((o) => (
              <div key={o.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <button onClick={() => openDetail(o)} className="text-left w-full">
                  <p className="text-xs text-slate-400">#{o.order_number}</p>
                  <p className="text-sm font-medium text-slate-700 break-words">{o.products?.name}</p>
                  <p className="text-xs text-slate-500 mt-1">Cliente: {o.client_name} — Cantidad: {o.lot_quantity}</p>
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>Inicio: {shortDate(inicioByOrder[o.id] || null)}</span>
                    <span>Fin: {shortDate(o.completed_at)}</span>
                    <span className="font-medium text-slate-700">
                      {businessDaysBetween(inicioByOrder[o.id] || null, o.completed_at) ?? '—'} días hábiles
                    </span>
                  </div>
                </button>
                <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <span>Ingresado a stock</span>
                  <button onClick={() => abrirIngresos(o)} className={`text-sm font-semibold underline decoration-dotted underline-offset-4 ${ingresoBadgeClass(o)}`}>
                    {fmtNum(ingresadoDe(o.id))} / {fmtNum(producidoDe(o))}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODAL de ingresos a stock */}
      {ingresoOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={cerrarIngresos}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">#{ingresoOrder.order_number} — {ingresoOrder.products?.name}</h3>
                <p className="text-sm text-slate-500">Ingresos a stock (anotación de lo que cargaste en Tango)</p>
              </div>
              <button onClick={cerrarIngresos} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-2 my-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Producido</p>
                <p className="text-sm font-semibold text-slate-700">{fmtNum(producidoDe(ingresoOrder))}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Ingresado</p>
                <p className="text-sm font-semibold text-slate-700">{fmtNum(ingresadoDe(ingresoOrder.id))}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Falta ingresar</p>
                <p className={`text-sm font-semibold ${pendienteDe(ingresoOrder) > 0 ? 'text-amber-600' : pendienteDe(ingresoOrder) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {fmtNum(pendienteDe(ingresoOrder))}
                </p>
              </div>
            </div>

            {ingresosDeModal.length === 0 ? (
              <p className="text-sm text-slate-400 mb-3">Todavía no anotaste ningún ingreso de esta orden.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg mb-3">
                {ingresosDeModal.map((i) => (
                  <div key={i.id} className={`px-3 py-2 flex items-center justify-between gap-3 ${editId === i.id ? 'bg-blue-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">
                        <strong>{fmtNum(Number(i.cantidad))}</strong> <span className="text-slate-400">el</span> {shortDate(i.fecha)}
                      </p>
                      {i.nota && <p className="text-xs text-slate-500 italic truncate">"{i.nota}"</p>}
                    </div>
                    <div className="flex gap-3 shrink-0 text-xs">
                      <button onClick={() => empezarEditar(i)} className="text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => borrarIngreso(i.id)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 mb-2">{editId ? 'Editar ingreso' : 'Nuevo ingreso'}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  Fecha
                  <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-700 bg-white" />
                </label>
                <label className="text-xs text-slate-500">
                  Cantidad
                  <input inputMode="decimal" value={fCantidad} onChange={(e) => setFCantidad(e.target.value)} placeholder={pendienteDe(ingresoOrder) > 0 ? String(pendienteDe(ingresoOrder)) : ''}
                    className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-700 bg-white" />
                </label>
              </div>
              <label className="text-xs text-slate-500 block mt-2">
                Nota (opcional)
                <input value={fNota} onChange={(e) => setFNota(e.target.value)} placeholder="Ej: remito o comprobante de Tango"
                  className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-700 bg-white" />
              </label>
              {ingresoMsg && <p className="text-xs text-rose-600 mt-2">{ingresoMsg}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={guardarIngreso} disabled={saving}
                  className="flex-1 bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
                  {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Agregar ingreso'}
                </button>
                {editId && (
                  <button onClick={cancelarEditar} className="px-4 border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-white">Cancelar</button>
                )}
              </div>
            </div>

            <button onClick={cerrarIngresos} className="mt-4 w-full border border-slate-300 text-slate-700 rounded-md py-2 text-sm font-medium hover:bg-slate-50">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL de detalle / trazabilidad */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeDetail}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">#{selected.order_number} — {selected.products?.name}</h3>
                <p className="text-sm text-slate-500">Cliente: {selected.client_name} — Cantidad: {selected.lot_quantity}</p>
              </div>
              <button onClick={closeDetail} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Inicio</p>
                <p className="text-sm font-semibold text-slate-700">{shortDate(inicioByOrder[selected.id] || null)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Fin</p>
                <p className="text-sm font-semibold text-slate-700">{shortDate(selected.completed_at)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Duración (días hábiles)</p>
                <p className="text-sm font-semibold text-slate-700">
                  {businessDaysBetween(inicioByOrder[selected.id] || null, selected.completed_at) ?? '—'} días
                </p>
              </div>
            </div>

            {hoursSummary && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-sm">
                <span className="text-blue-700">Horas estándar estimadas: <strong>{hoursSummary.estimadas}h</strong></span>
                <span className="mx-2 text-blue-300">|</span>
                <span className="text-blue-700">Horas reales insumidas: <strong>{hoursSummary.reales}h</strong></span>
              </div>
            )}

            {selected.notes && (
              <p className="text-sm text-slate-500 italic mb-4">Obs. de la OP: "{selected.notes}"</p>
            )}

            <h4 className="text-sm font-semibold text-slate-700 mb-2">Línea de tiempo por sector</h4>
            {loadingDetail ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : detailTasks.length === 0 ? (
              <p className="text-sm text-slate-400">No hay tareas registradas para esta OP.</p>
            ) : (
              <div className="space-y-2">
                {groupedBySector().map((group) => {
                  const isOpen = !!expandedSectors[group.sectorId]
                  const allClosed = group.tasks.every((t) => t.actual_quantity != null)
                  const totalProg = group.tasks.reduce((s, t) => s + t.target_quantity, 0)
                  const totalReal = group.tasks.reduce((s, t) => s + (t.actual_quantity ?? 0), 0)
                  const operatorNames = Array.from(new Set(group.tasks.map((t) => t.operators?.full_name).filter(Boolean)))

                  return (
                    <div key={group.sectorId} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSector(group.sectorId)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-400 text-xs w-3 shrink-0">{isOpen ? '▾' : '▸'}</span>
                          <span className="text-sm font-medium text-slate-700 truncate">{group.sectorName}</span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {operatorNames.length === 1 ? operatorNames[0] : `${operatorNames.length} operarios`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <span className={allClosed ? 'text-slate-600' : 'text-amber-600'}>
                            Prog: <strong>{totalProg}</strong> — Real: <strong>{allClosed ? totalReal : 'sin cerrar'}</strong>
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-slate-100">
                          {group.tasks.map((t: any) => (
                            <div key={t.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <div>
                                <p className="text-xs text-slate-400">
                                  {shortDate(t.plan_date)}{t.components?.name ? ` — ${t.components.name}` : ''}
                                </p>
                                <p className="text-sm text-slate-700 font-medium">{t.operators?.full_name}</p>
                                {t.notes && <p className="text-xs text-slate-500 italic">"{t.notes}"</p>}
                              </div>
                              <div className="text-sm text-slate-600 shrink-0">
                                Programado: <strong>{t.target_quantity}</strong> — Real: <strong className={t.actual_quantity == null ? 'text-amber-600' : 'text-slate-700'}>
                                  {t.actual_quantity != null ? t.actual_quantity : 'sin cerrar'}
                                </strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={closeDetail} className="mt-4 w-full bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
