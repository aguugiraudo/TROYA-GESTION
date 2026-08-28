'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

const CATEGORY_COLORS: Record<string, string> = {
  ESTUFAS: 'bg-orange-100 text-orange-700',
  FOGONEROS: 'bg-red-100 text-red-700',
  HORNOS: 'bg-purple-100 text-purple-700',
  'ACCESORIOS FOGONEROS': 'bg-slate-200 text-slate-700',
  OTROS: 'bg-slate-100 text-slate-500',
}

function eficienciaColor(pct: number | null) {
  if (pct == null) return 'text-slate-300'
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 70) return 'text-amber-600'
  return 'text-rose-600'
}

export default function DashboardPage() {
  const [monthValue, setMonthValue] = useState(currentMonthValue())
  const [completedOrders, setCompletedOrders] = useState<any[]>([])
  const [serviceRows, setServiceRows] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [monthTasks, setMonthTasks] = useState<any[]>([])
  const [leadTimeAvg, setLeadTimeAvg] = useState<number | null>(null)
  const [leadTimeCount, setLeadTimeCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [year, monthNum] = monthValue.split('-').map(Number)
  const monthStart = `${monthValue}-01`
  const nextMonth = new Date(year, monthNum, 1)
  const monthEnd = nextMonth.toISOString().split('T')[0]

  async function fetchData() {
    setLoading(true)

    const { data: sectorsData } = await supabase.from('sectors').select('*').order('sequence_no')
    setSectors(sectorsData || [])

    // Producción del mes = OPs que llegaron a 100% y se completaron dentro de este mes.
    const { data } = await supabase
      .from('orders')
      .select('id, lot_quantity, completed_at, products(name, category, price)')
      .eq('status', 'completed')
      .gte('completed_at', monthStart)
      .lt('completed_at', monthEnd)
    setCompletedOrders(data || [])

    const { data: svc } = await supabase
      .from('service_tasks')
      .select('*, sectors(name)')
      .gte('plan_date', monthStart)
      .lt('plan_date', monthEnd)
    setServiceRows(svc || [])

    // Horas programadas vs reales del mes, por sector
    const { data: taskData } = await supabase
      .from('operator_daily_tasks')
      .select('target_quantity, actual_quantity, standard_time_minutes, sector_id, sectors(name)')
      .gte('plan_date', monthStart)
      .lt('plan_date', monthEnd)
    setMonthTasks(taskData || [])

    // Lead time promedio: OPs completadas este mes, inicio = primera fecha con Real cerrado en el sector de menor secuencia
    if ((data || []).length > 0) {
      const orderIds = (data || []).map((o: any) => o.id)
      const { data: allTasksForLead } = await supabase
        .from('operator_daily_tasks')
        .select('order_id, plan_date, actual_quantity, sectors(sequence_no)')
        .in('order_id', orderIds)

      const minSeqByOrder: Record<string, number> = {}
      ;(allTasksForLead || []).forEach((t: any) => {
        const seq = t.sectors?.sequence_no
        if (seq == null) return
        if (minSeqByOrder[t.order_id] == null || seq < minSeqByOrder[t.order_id]) minSeqByOrder[t.order_id] = seq
      })
      const inicioByOrder: Record<string, string> = {}
      ;(allTasksForLead || []).forEach((t: any) => {
        const seq = t.sectors?.sequence_no
        if (seq == null || t.actual_quantity == null || seq !== minSeqByOrder[t.order_id]) return
        if (!inicioByOrder[t.order_id] || t.plan_date < inicioByOrder[t.order_id]) inicioByOrder[t.order_id] = t.plan_date
      })

      const leadTimes: number[] = []
      ;(data || []).forEach((o: any) => {
        const dias = businessDaysBetween(inicioByOrder[o.id] || null, o.completed_at)
        if (dias != null) leadTimes.push(dias)
      })
      setLeadTimeCount(leadTimes.length)
      setLeadTimeAvg(leadTimes.length > 0 ? Math.round((leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length) * 10) / 10 : null)
    } else {
      setLeadTimeCount(0)
      setLeadTimeAvg(null)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [monthValue])

  const byCategory: Record<string, { qty: number; revenue: number; hasPrice: boolean; products: Record<string, number> }> = {}
  completedOrders.forEach((o) => {
    const cat = o.products?.category || 'OTROS'
    const productName = o.products?.name || 'Producto sin nombre'
    const price = o.products?.price
    if (!byCategory[cat]) byCategory[cat] = { qty: 0, revenue: 0, hasPrice: false, products: {} }
    byCategory[cat].qty += o.lot_quantity
    if (price != null) {
      byCategory[cat].revenue += o.lot_quantity * Number(price)
      byCategory[cat].hasPrice = true
    }
    byCategory[cat].products[productName] = (byCategory[cat].products[productName] || 0) + o.lot_quantity
  })

  const totalUnits = completedOrders.reduce((s, o) => s + o.lot_quantity, 0)
  const totalRevenue = completedOrders.reduce((s, o) => s + (o.products?.price != null ? o.lot_quantity * Number(o.products.price) : 0), 0)
  const anyPriceSet = completedOrders.some((o) => o.products?.price != null)

  const serviceOnlyRows = serviceRows.filter((r) => r.category !== '5s')
  const fiveSRows = serviceRows.filter((r) => r.category === '5s')

  const totalServiceHours = serviceOnlyRows.reduce((s, r) => s + Number(r.hours_assigned || 0), 0)
  const totalServiceQty = serviceOnlyRows.reduce((s, r) => s + (r.quantity_services || 0), 0)
  const bySectorServices: Record<string, { hours: number; qty: number }> = {}
  serviceOnlyRows.forEach((r) => {
    const sec = r.sectors?.name || 'Sin sector'
    if (!bySectorServices[sec]) bySectorServices[sec] = { hours: 0, qty: 0 }
    bySectorServices[sec].hours += Number(r.hours_assigned || 0)
    bySectorServices[sec].qty += r.quantity_services || 0
  })

  const total5SHours = fiveSRows.reduce((s, r) => s + Number(r.hours_assigned || 0), 0)
  const bySector5S: Record<string, number> = {}
  fiveSRows.forEach((r) => {
    const sec = r.sectors?.name || 'Sin sector'
    bySector5S[sec] = (bySector5S[sec] || 0) + Number(r.hours_assigned || 0)
  })

  const categories = Object.keys(byCategory).sort((a, b) => byCategory[b].qty - byCategory[a].qty)

  // ===== Horas programadas vs reales por sector (producción + servicios, igual criterio que Plan Diario) =====
  const hoursBySector: Record<string, { name: string; prog: number; real: number }> = {}
  monthTasks.forEach((t: any) => {
    const name = t.sectors?.name || 'Sin sector'
    if (!hoursBySector[name]) hoursBySector[name] = { name, prog: 0, real: 0 }
    hoursBySector[name].prog += (t.target_quantity * (t.standard_time_minutes || 0)) / 60
    if (t.actual_quantity != null) hoursBySector[name].real += (t.actual_quantity * (t.standard_time_minutes || 0)) / 60
  })
  serviceOnlyRows.forEach((s: any) => {
    const name = s.sectors?.name || 'Sin sector'
    if (!hoursBySector[name]) hoursBySector[name] = { name, prog: 0, real: 0 }
    hoursBySector[name].prog += Number(s.hours_assigned || 0)
    if (s.actual_quantity != null) {
      const target = s.quantity_services ?? 1
      const ratio = target > 0 ? s.actual_quantity / target : 0
      hoursBySector[name].real += Number(s.hours_assigned || 0) * ratio
    }
  })

  const sectorHoursSorted = sectors
    .map((sec) => hoursBySector[sec.name])
    .filter(Boolean)
  Object.values(hoursBySector).forEach((h) => {
    if (!sectorHoursSorted.some((s) => s.name === h.name)) sectorHoursSorted.push(h)
  })

  const totalProgHours = Math.round(sectorHoursSorted.reduce((s, h) => s + h.prog, 0) * 10) / 10
  const totalRealHours = Math.round(sectorHoursSorted.reduce((s, h) => s + h.real, 0) * 10) / 10
  const eficienciaMensual = totalProgHours > 0 ? Math.round((totalRealHours / totalProgHours) * 1000) / 10 : null

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-1">Producción del mes, por categoría de producto.</p>
      <p className="text-xs text-slate-400 mb-6">Solo cuenta OPs completadas al 100% dentro de este mes — no avance parcial de órdenes todavía en curso.</p>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-slate-700">Mes</label>
        <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Total producido este mes</p>
          <p className="text-3xl font-semibold text-slate-800 mt-1">{totalUnits} <span className="text-base font-normal text-slate-400">productos</span></p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Valor de producción {anyPriceSet ? '' : '(cargá precios en el Catálogo)'}</p>
          <p className="text-3xl font-semibold text-emerald-700 mt-1">
            {anyPriceSet ? `$${totalRevenue.toLocaleString('es-AR')}` : '—'}
          </p>
        </div>
      </div>

      {/* Horas programadas vs reales + Eficiencia mensual + Lead time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Horas programadas vs reales</p>
          <p className="text-2xl font-semibold text-slate-800 mt-1">
            {totalRealHours}h <span className="text-base font-normal text-slate-400">/ {totalProgHours}h</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Eficiencia mensual</p>
          <p className={`text-3xl font-semibold mt-1 ${eficienciaColor(eficienciaMensual)}`}>
            {eficienciaMensual != null ? `${eficienciaMensual}%` : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Lead time promedio</p>
          <p className="text-2xl font-semibold text-slate-800 mt-1">
            {leadTimeAvg != null ? `${leadTimeAvg} días` : '—'}
          </p>
          {leadTimeCount > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">sobre {leadTimeCount} OP{leadTimeCount !== 1 ? 's' : ''} completada{leadTimeCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {sectorHoursSorted.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-8">
          <p className="text-sm font-semibold text-slate-700 mb-3">Horas por sector — programadas vs reales</p>
          <div className="space-y-2">
            {sectorHoursSorted.map((h) => {
              const pct = h.prog > 0 ? Math.round((h.real / h.prog) * 1000) / 10 : null
              return (
                <div key={h.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 w-40 shrink-0 truncate">{h.name}</span>
                  <span className="text-slate-500 flex-1 text-right">
                    {Math.round(h.real * 10) / 10}h <span className="text-slate-300">/</span> {Math.round(h.prog * 10) / 10}h
                  </span>
                  <span className={`w-14 text-right font-medium ${eficienciaColor(pct)}`}>{pct != null ? `${pct}%` : '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {completedOrders.length === 0 && serviceRows.length === 0 ? (
        <p className="text-slate-500">No hay actividad registrada este mes todavía.</p>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const info = byCategory[cat]
            const productNames = Object.keys(info.products).sort((a, b) => info.products[b] - info.products[a])
            return (
              <div key={cat} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTROS}`}>
                    {cat}
                  </span>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-800">{info.qty} unidades</p>
                    {info.hasPrice && (
                      <p className="text-sm text-emerald-700">${info.revenue.toLocaleString('es-AR')}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {productNames.map((name) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{name}</span>
                      <span className="text-slate-500">{info.products[name]} u.</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Categoría SERVICIOS — horas, no unidades */}
          {serviceOnlyRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                  SERVICIOS
                </span>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-800">{Math.round(totalServiceHours * 10) / 10} hs</p>
                  {totalServiceQty > 0 && <p className="text-sm text-slate-500">{totalServiceQty} servicios</p>}
                </div>
              </div>
              <div className="space-y-1">
                {Object.entries(bySectorServices).map(([sector, info]) => (
                  <div key={sector} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{sector}</span>
                    <span className="text-slate-500">{Math.round(info.hours * 10) / 10} hs{info.qty > 0 ? ` — ${info.qty} servicios` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Categoría 5S — horas dedicadas a mejora continua */}
          {fiveSRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  5S
                </span>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-800">{Math.round(total5SHours * 10) / 10} hs</p>
                </div>
              </div>
              <div className="space-y-1">
                {Object.entries(bySector5S).map(([sector, hours]) => (
                  <div key={sector} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{sector}</span>
                    <span className="text-slate-500">{Math.round(hours * 10) / 10} hs</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}