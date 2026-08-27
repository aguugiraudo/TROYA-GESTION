'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

function isLaserSectorName(name: string) {
  const n = name.toLowerCase()
  return n.includes('láser') || n.includes('laser')
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0]
}

function getMondayOfWeek(offsetWeeks: number) {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function weekDates(monday: Date) {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISO(d)
  })
}

function saturdayOf(monday: Date) {
  const d = new Date(monday)
  d.setDate(monday.getDate() + 5)
  return toISO(d)
}

function shortDate(iso: string) {
  return iso.split('-').reverse().slice(0, 2).join('/')
}

export default function PlanDiarioPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [orders, setOrders] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [weightByOrder, setWeightByOrder] = useState<Record<string, number>>({})
  const [progressDetailRows, setProgressDetailRows] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [laserServiceTasks, setLaserServiceTasks] = useState<any[]>([])
  const [allServiceTasks, setAllServiceTasks] = useState<any[]>([])
  const [allTasksByOrder, setAllTasksByOrder] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [orderDetailModal, setOrderDetailModal] = useState<{ order: any; date: string } | null>(null)

  const monday = getMondayOfWeek(weekOffset)
  const weekdayDates = weekDates(monday)
  const satDate = saturdayOf(monday)
  const todayISO = toISO(new Date())

  async function fetchAll() {
    setLoading(true)

    const { data: sectorsData } = await supabase.from('sectors').select('*').order('sequence_no')
    setSectors(sectorsData || [])

    const { data: taskData } = await supabase
      .from('operator_daily_tasks')
      .select('*')
      .gte('plan_date', weekdayDates[0])
      .lte('plan_date', satDate)
    setTasks(taskData || [])

    // Servicios (no 5S) de la semana, para la fila de Servicios en Láser
    const { data: serviceData } = await supabase
      .from('service_tasks')
      .select('*, sectors(name)')
      .eq('category', 'servicio')
      .gte('plan_date', weekdayDates[0])
      .lte('plan_date', satDate)
    const laserOnly = (serviceData || []).filter((s: any) => s.sectors?.name && isLaserSectorName(s.sectors.name))
    setLaserServiceTasks(laserOnly)
    setAllServiceTasks(serviceData || [])

    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, completed_at, lot_quantity, products(name)')
      .in('status', ['pending', 'in_progress'])
      .order('priority_rank', { ascending: true, nullsFirst: false })

    const orderIdsWithTasks = Array.from(new Set((taskData || []).map((t: any) => t.order_id)))
    const activeIds = new Set((activeOrders || []).map((o: any) => o.id))
    const missingIds = orderIdsWithTasks.filter((id) => !activeIds.has(id))

    let completedWithTasks: any[] = []
    if (missingIds.length > 0) {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, completed_at, lot_quantity, products(name)')
        .in('id', missingIds)
      completedWithTasks = (data || []).sort((a: any, b: any) =>
        new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
      )
    }

    const allOrders = [...completedWithTasks, ...(activeOrders || [])]
    setOrders(allOrders)

    const orderIds = allOrders.map((o: any) => o.id)
    if (orderIds.length > 0) {
      const { data: progressData } = await supabase
        .from('order_progress_detail')
        .select('order_id, sector_id, minutes_required, quantity_required, quantity_completed, standard_time_minutes, target_type, component_id, component_name')
        .in('order_id', orderIds)
      setProgressDetailRows(progressData || [])

      const weights: Record<string, number> = {}
      ;(progressData || []).forEach((r: any) => {
        weights[r.order_id] = (weights[r.order_id] || 0) + r.minutes_required
      })
      setWeightByOrder(weights)

      const { data: allTaskData } = await supabase
        .from('operator_daily_tasks')
        .select('order_id, sector_id, component_id, plan_date, target_quantity, actual_quantity, standard_time_minutes')
        .in('order_id', orderIds)

      const grouped: Record<string, any[]> = {}
      ;(allTaskData || []).forEach((t: any) => {
        if (!grouped[t.order_id]) grouped[t.order_id] = []
        grouped[t.order_id].push(t)
      })
      setAllTasksByOrder(grouped)
    } else {
      setProgressDetailRows([])
      setAllTasksByOrder({})
    }

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [weekOffset])

  const hasSaturdayTasks = tasks.some((t) => t.plan_date === satDate)
  const dates = hasSaturdayTasks ? [...weekdayDates, satDate] : weekdayDates

  function maxTaskDateFor(orderId: string) {
    const all = allTasksByOrder[orderId] || []
    if (all.length === 0) return null
    return all.reduce((max, t) => (t.plan_date > max ? t.plan_date : max), all[0].plan_date)
  }

  // Real acumulado (%) de una orden hasta una fecha dada (inclusive o estrictamente anterior)
  function cumulativeRealUpTo(orderId: string, date: string, inclusive: boolean) {
    const totalWeight = weightByOrder[orderId]
    const all = allTasksByOrder[orderId] || []
    const relevant = all.filter((t) => inclusive ? t.plan_date <= date : t.plan_date < date)
    if (!totalWeight || relevant.length === 0) return { real: null as number | null, hasAny: false }

    const closed = relevant.filter((t) => t.actual_quantity != null)
    const realMin = closed.reduce((s, t) => s + t.actual_quantity * (t.standard_time_minutes || 0), 0)

    return {
      real: closed.length > 0 ? Math.round((realMin / totalWeight) * 1000) / 10 : null,
      hasAny: true,
    }
  }

  function dayResult(orderId: string, date: string) {
    // No mostrar nada más allá de la última fecha con una tarea real cargada para esta OP
    const maxTaskDate = maxTaskDateFor(orderId)
    if (!maxTaskDate || date > maxTaskDate) return null

    // Si este día puntual no tiene NINGUNA tarea asignada para esta OP, no mostrar nada
    const todaysTasks = (allTasksByOrder[orderId] || []).filter((t) => t.plan_date === date)
    if (todaysTasks.length === 0) return null

    const totalWeight = weightByOrder[orderId]
    const upToToday = cumulativeRealUpTo(orderId, date, true)
    if (!upToToday.hasAny) return null

    const beforeToday = cumulativeRealUpTo(orderId, date, false)
    const allClosedToday = todaysTasks.every((t) => t.actual_quantity != null)

    const todayTargetMin = todaysTasks.reduce((s, t) => s + t.target_quantity * (t.standard_time_minutes || 0), 0)
    const todayTargetPct = totalWeight ? (todayTargetMin / totalWeight) * 100 : 0

    const baseRealPct = beforeToday.real ?? 0
    const progPct = Math.round((baseRealPct + todayTargetPct) * 10) / 10

    let cumplimiento: number | null = null
    if (allClosedToday) {
      const realIncrement = (upToToday.real ?? 0) - (beforeToday.real ?? 0)
      cumplimiento = todayTargetPct > 0 ? Math.round((realIncrement / todayTargetPct) * 1000) / 10 : null
    }

    return { progPct, realPct: upToToday.real, cumplimiento }
  }

  function plantDayResult(date: string) {
    const dayTasks = tasks.filter((t) => t.plan_date === date)
    const dayServices = allServiceTasks.filter((s) => s.plan_date === date)
    if (dayTasks.length === 0 && dayServices.length === 0) return null

    // Producción (tareas de OP)
    const taskProgMinutes = dayTasks.reduce((sum, t) => sum + t.target_quantity * (t.standard_time_minutes || 0), 0)
    const hasAnyTaskActual = dayTasks.some((t) => t.actual_quantity != null)
    const taskRealMinutes = dayTasks.reduce((sum, t) => sum + (t.actual_quantity != null ? t.actual_quantity * (t.standard_time_minutes || 0) : 0), 0)

    // Servicios: el objetivo es cada servicio programado (sus minutos); el real se prorratea según la cantidad ya cerrada
    const serviceProgMinutes = dayServices.reduce((sum, s) => sum + Number(s.hours_assigned || 0) * 60, 0)
    const hasAnyServiceActual = dayServices.some((s) => s.actual_quantity != null)
    const serviceRealMinutes = dayServices.reduce((sum, s) => {
      if (s.actual_quantity == null) return sum
      const target = s.quantity_services ?? 1
      const ratio = target > 0 ? s.actual_quantity / target : 0
      return sum + Number(s.hours_assigned || 0) * 60 * ratio
    }, 0)

    const progMinutes = taskProgMinutes + serviceProgMinutes
    const realMinutes = taskRealMinutes + serviceRealMinutes
    const hasAnyActual = hasAnyTaskActual || hasAnyServiceActual

    const progHoras = Math.round((progMinutes / 60) * 10) / 10
    const realHoras = hasAnyActual ? Math.round((realMinutes / 60) * 10) / 10 : null
    const cumplimiento = hasAnyActual && progMinutes > 0 ? Math.round((realMinutes / progMinutes) * 1000) / 10 : null

    return { progHoras, realHoras, cumplimiento }
  }

  // Servicios en Láser del día: Obj. = cuántos se programaron (cada renglón cargado en Turnos y Operarios),
  // Real = cuántos ya se marcaron como completados ahí mismo. Se muestra en cantidad de servicios, no en %.
  function laserServiceDayResult(date: string) {
    const dayServices = laserServiceTasks.filter((s) => s.plan_date === date)
    if (dayServices.length === 0) return null
    const obj = dayServices.reduce((s, sv) => s + (sv.quantity_services ?? 1), 0)
    const hasAnyReal = dayServices.some((sv) => sv.actual_quantity != null)
    const real = dayServices.reduce((s, sv) => s + (sv.actual_quantity ?? 0), 0)
    const cumplimiento = hasAnyReal && obj > 0 ? Math.round((real / obj) * 1000) / 10 : null
    return { obj, real: hasAnyReal ? real : null, cumplimiento }
  }

  function weekResult() {
    const weekTasks = tasks
    const weekServices = allServiceTasks
    if (weekTasks.length === 0 && weekServices.length === 0) return null

    const taskProgMinutes = weekTasks.reduce((s, t) => s + t.target_quantity * (t.standard_time_minutes || 0), 0)
    const hasAnyTaskActual = weekTasks.some((t) => t.actual_quantity != null)
    const taskRealMinutes = weekTasks.reduce((s, t) => s + (t.actual_quantity != null ? t.actual_quantity * (t.standard_time_minutes || 0) : 0), 0)

    const serviceProgMinutes = weekServices.reduce((s, sv) => s + Number(sv.hours_assigned || 0) * 60, 0)
    const hasAnyServiceActual = weekServices.some((sv) => sv.actual_quantity != null)
    const serviceRealMinutes = weekServices.reduce((s, sv) => {
      if (sv.actual_quantity == null) return s
      const target = sv.quantity_services ?? 1
      const ratio = target > 0 ? sv.actual_quantity / target : 0
      return s + Number(sv.hours_assigned || 0) * 60 * ratio
    }, 0)

    const progMinutes = taskProgMinutes + serviceProgMinutes
    const realMinutes = taskRealMinutes + serviceRealMinutes
    const hasAnyActual = hasAnyTaskActual || hasAnyServiceActual

    if (!hasAnyActual || progMinutes === 0) return null
    return Math.round((realMinutes / progMinutes) * 1000) / 10
  }

  function cumplimientoColor(c: number | null) {
    if (c == null) return 'text-slate-300'
    if (c >= 100) return 'text-emerald-600 font-semibold'
    if (c >= 70) return 'text-amber-600 font-semibold'
    return 'text-rose-600 font-semibold'
  }

  // Desglose por sector de una orden, tal como estaba a una fecha puntual
  function sectorBreakdownFor(orderId: string, date: string) {
    const allRows = progressDetailRows.filter((r) => r.order_id === orderId)
    const orderTasks = allTasksByOrder[orderId] || []

    const bySector: Record<string, { sectorId: string; sectorName: string; sequenceNo: number; requiredQty: number }> = {}
    allRows.forEach((r) => {
      const sector = sectors.find((s) => s.id === r.sector_id)
      const sectorName = sector?.name || 'Sin sector'
      const sequenceNo = sector?.sequence_no ?? 999
      if (!bySector[r.sector_id]) bySector[r.sector_id] = { sectorId: r.sector_id, sectorName, sequenceNo, requiredQty: 0 }
      bySector[r.sector_id].requiredQty += r.quantity_required
    })

    return Object.values(bySector)
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((s) => {
        const beforeToday = orderTasks
          .filter((t) => t.sector_id === s.sectorId && t.plan_date < date && t.actual_quantity != null)
          .reduce((sum, t) => sum + t.actual_quantity, 0)

        const todayTasks = orderTasks.filter((t) => t.sector_id === s.sectorId && t.plan_date === date)
        const programmedTodayQty = todayTasks.reduce((sum, t) => sum + t.target_quantity, 0)
        const realTodayClosed = todayTasks.filter((t) => t.actual_quantity != null).reduce((sum, t) => sum + t.actual_quantity, 0)
        const allTodayClosed = todayTasks.length > 0 && todayTasks.every((t) => t.actual_quantity != null)

        const realActual = beforeToday + realTodayClosed
        const targetEndOfDay = beforeToday + programmedTodayQty
        const pendingQty = Math.max(0, s.requiredQty - realActual)

        return {
          ...s,
          beforeToday,
          programmedTodayQty,
          realActual,
          targetEndOfDay,
          pendingQty,
          allTodayClosed,
          hasActivityToday: todayTasks.length > 0,
        }
      })
  }

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  const weekCumplimiento = weekResult()
  const modalBreakdown = orderDetailModal ? sectorBreakdownFor(orderDetailModal.order.id, orderDetailModal.date) : []
  const modalDayResult = orderDetailModal ? dayResult(orderDetailModal.order.id, orderDetailModal.date) : null

  return (
    <main className="p-6 max-w-full mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Plan Diario</h1>
      <p className="text-sm text-slate-500 mb-4">Avance acumulado de cada orden, y cumplimiento del objetivo de cada día.</p>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">
          ← Semana anterior
        </button>
        <span className="text-sm font-medium text-slate-700">
          Semana del {shortDate(weekdayDates[0])} al {shortDate(weekdayDates[4])}
        </span>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">
          Semana siguiente →
        </button>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 underline">Volver a esta semana</button>
        )}
        {hasSaturdayTasks && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">+ Sábado {shortDate(satDate)} (extra)</span>
        )}
        {weekCumplimiento != null && (
          <span className={`text-xs px-2 py-1 rounded-full bg-slate-100 ${cumplimientoColor(weekCumplimiento)}`}>
            Cumplimiento de la semana: {weekCumplimiento}%
          </span>
        )}
      </div>

      {orders.length === 0 ? (
        <p className="text-slate-500">No hay órdenes activas todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="text-sm border-collapse table-fixed w-full">
            <colgroup>
              <col style={{ width: '150px' }} />
              {dates.map((d) => <col key={d} style={{ width: '150px' }} />)}
            </colgroup>
            <thead>
              <tr className="bg-slate-900 text-white text-left">
                <th className="p-2 font-medium">OP / Producto</th>
                {dates.map((d, i) => {
                  const isToday = d === todayISO
                  return (
                    <th key={d} className={`p-2 font-medium text-center border-l ${
                      d === satDate ? 'bg-amber-900/40 border-amber-700' :
                      isToday ? 'bg-slate-700 border-slate-600' : 'border-slate-700'
                    }`}>
                      {i < 5 ? DAY_NAMES[i] : 'Sábado extra'}
                      <div className="text-[10px] font-normal text-slate-300">{shortDate(d)}{isToday ? ' • hoy' : ''}</div>
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-slate-800 text-slate-300 text-[11px]">
                <th className="p-1"></th>
                {dates.map((d) => {
                  const isToday = d === todayISO
                  return (
                    <th key={d} className={`p-0 border-l ${d === satDate ? 'border-amber-700' : isToday ? 'border-slate-600' : 'border-slate-700'}`}>
                      <div className="grid grid-cols-3">
                        <span className="text-center py-1">Obj.</span>
                        <span className="text-center py-1">Real</span>
                        <span className="text-center py-1">Cum.</span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-100 border-t-2 border-b-2 border-slate-300">
                <td className="p-2 font-bold text-slate-800 text-sm">Cumplimiento de planta</td>
                {dates.map((d) => {
                  const r = plantDayResult(d)
                  const isToday = d === todayISO
                  return (
                    <td key={d} className={`p-0 border-l border-slate-200 ${isToday ? 'bg-slate-200/60' : ''}`}>
                      <div className="grid grid-cols-3">
                        <span className="text-center py-2 text-slate-600 text-xs font-medium">{r ? `${r.progHoras}h` : '—'}</span>
                        <span className="text-center py-2 text-slate-600 text-xs font-medium">{r?.realHoras != null ? `${r.realHoras}h` : '—'}</span>
                        <span className={`text-center py-2 text-xs ${cumplimientoColor(r?.cumplimiento ?? null)}`}>
                          {r?.cumplimiento != null ? `${r.cumplimiento}%` : '—'}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>

              <tr className="border-b border-slate-100">
                <td className="p-2 leading-tight">
                  <div className="text-slate-700 text-xs font-medium">Servicios en Láser</div>
                </td>
                {dates.map((d) => {
                  const r = laserServiceDayResult(d)
                  const isToday = d === todayISO
                  return (
                    <td key={d} className={`p-0 border-l ${isToday ? 'border-slate-100 bg-slate-50/60' : 'border-slate-100'}`}>
                      <div className="grid grid-cols-3">
                        <span className="text-center py-2 text-slate-600 text-xs">{r ? r.obj : '—'}</span>
                        <span className="text-center py-2 text-slate-600 text-xs">{r?.real != null ? r.real : '—'}</span>
                        <span className={`text-center py-2 text-xs ${cumplimientoColor(r?.cumplimiento ?? null)}`}>
                          {r?.cumplimiento != null ? `${r.cumplimiento}%` : '—'}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>

              {orders.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="p-2 leading-tight">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      #{order.order_number}
                      {order.status === 'completed' && (
                        <span className="text-emerald-600 text-[10px] bg-emerald-50 px-1 rounded">completada</span>
                      )}
                    </div>
                    <div className="text-slate-700 text-xs">
                      {order.products?.name}
                      {order.lot_quantity != null && <span className="text-slate-400"> ({order.lot_quantity})</span>}
                    </div>
                  </td>
                  {dates.map((d) => {
                    const r = dayResult(order.id, d)
                    const isToday = d === todayISO
                    return (
                      <td key={d} className={`p-0 border-l ${
                        d === satDate ? 'border-amber-100 bg-amber-50/40' :
                        isToday ? 'border-slate-100 bg-slate-50/60' : 'border-slate-100'
                      }`}>
                        <div className="grid grid-cols-3">
                          {r?.progPct != null ? (
                            <button
                              onClick={() => setOrderDetailModal({ order, date: d })}
                              className="text-center py-2 text-slate-600 text-xs hover:bg-slate-100 hover:text-blue-700 hover:underline decoration-dotted transition-colors"
                              title="Ver desglose por sector"
                            >
                              {r.progPct}%
                            </button>
                          ) : (
                            <span className="text-center py-2 text-slate-600 text-xs">—</span>
                          )}
                          <span className="text-center py-2 text-slate-600 text-xs">{r?.realPct != null ? `${r.realPct}%` : '—'}</span>
                          <span className={`text-center py-2 text-xs ${cumplimientoColor(r?.cumplimiento ?? null)}`}>
                            {r?.cumplimiento != null ? `${r.cumplimiento}%` : '—'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: desglose por sector de la OP, tal como estaba en la fecha clickeada */}
      {orderDetailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOrderDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">
                  #{orderDetailModal.order.order_number} — {orderDetailModal.order.products?.name}
                </h3>
                <p className="text-sm text-slate-500">Estado al {shortDate(orderDetailModal.date)}</p>
              </div>
              <button onClick={() => setOrderDetailModal(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>

            {modalDayResult && (
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Objetivo</p>
                  <p className="text-lg font-semibold text-slate-700">{modalDayResult.progPct != null ? `${modalDayResult.progPct}%` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Real</p>
                  <p className="text-lg font-semibold text-slate-700">{modalDayResult.realPct != null ? `${modalDayResult.realPct}%` : '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400">Cumplimiento del día</p>
                  <p className={`text-lg font-semibold ${cumplimientoColor(modalDayResult.cumplimiento)}`}>
                    {modalDayResult.cumplimiento != null ? `${modalDayResult.cumplimiento}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 mb-3">
              Estado actual / estado programado para terminar hoy, por sector (viene de Turnos y Operarios):
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    {modalBreakdown.map((s) => (
                      <th key={s.sectorId} className="p-2 font-medium text-center whitespace-nowrap">{s.sectorName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {modalBreakdown.map((s) => {
                      const pillClass =
                        s.realActual > s.targetEndOfDay ? 'bg-rose-200 text-rose-800' :
                        s.realActual === s.targetEndOfDay && s.targetEndOfDay > 0 ? 'bg-emerald-200 text-emerald-800' :
                        s.realActual > 0 ? 'bg-amber-200 text-amber-800' :
                        'bg-slate-100 text-slate-400'
                      return (
                        <td key={s.sectorId} className="p-3 text-center">
                          <span className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 font-semibold whitespace-nowrap ${pillClass}`}>
                            {s.realActual} / {s.targetEndOfDay}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <button onClick={() => setOrderDetailModal(null)} className="mt-4 w-full bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
