'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tab = 'afuera' | 'nueva' | 'reporte'

function today() {
  return new Date().toISOString().split('T')[0]
}

function shortDate(iso: string) {
  return iso.split('-').reverse().join('/')
}

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TerciarizacionPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'

  const [tab, setTab] = useState<Tab>('afuera')

  const [sectors, setSectors] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [progressRows, setProgressRows] = useState<any[]>([])
  const [tercerizaciones, setTercerizaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // --- Formulario nueva terciarización ---
  const [fOrderSearch, setFOrderSearch] = useState('')
  const [fOrderShowList, setFOrderShowList] = useState(false)
  const [fOrder, setFOrder] = useState<any | null>(null)
  const [fSector, setFSector] = useState('')
  const [fComponent, setFComponent] = useState('')
  const [fProveedor, setFProveedor] = useState('')
  const [fCantidad, setFCantidad] = useState('')
  const [fPrecioUnitario, setFPrecioUnitario] = useState('')
  const [fFecha, setFFecha] = useState(today())
  const [fNotas, setFNotas] = useState('')

  // --- Marcar recibido ---
  const [recibirModal, setRecibirModal] = useState<any | null>(null)
  const [recibirCantidad, setRecibirCantidad] = useState('')
  const [recibirFecha, setRecibirFecha] = useState(today())

  // --- Reporte mensual ---
  const [reporteMonth, setReporteMonth] = useState(currentMonthValue())

  async function fetchAll() {
    setLoading(true)
    const { data: sectorsData } = await supabase.from('sectors').select('*').order('sequence_no')
    setSectors(sectorsData || [])

    const { data: ordersData } = await supabase
      .from('orders').select('id, order_number, product_id, lot_quantity, products(name)')
      .in('status', ['pending', 'in_progress'])
      .order('priority_rank', { ascending: true, nullsFirst: false })
    setOrders(ordersData || [])

    const orderIds = (ordersData || []).map((o: any) => o.id)
    if (orderIds.length > 0) {
      const { data: progressData } = await supabase.from('order_progress_detail').select('*').in('order_id', orderIds)
      setProgressRows(progressData || [])
    } else {
      setProgressRows([])
    }

    const { data: tercData } = await supabase
      .from('tercerizaciones')
      .select('*, orders(order_number, products(name)), sectors(name), components(name)')
      .order('fecha_envio', { ascending: false })
    setTercerizaciones(tercData || [])

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const filteredOrders = fOrderSearch.length > 0
    ? orders.filter((o) => o.order_number.toLowerCase().includes(fOrderSearch.toLowerCase()) || o.products?.name?.toLowerCase().includes(fOrderSearch.toLowerCase()))
    : orders

  function pickOrder(o: any) {
    setFOrder(o); setFOrderSearch(`#${o.order_number} — ${o.products?.name}`); setFOrderShowList(false)
    setFSector(''); setFComponent('')
  }

  const rowsForOrderSector = (fOrder && fSector)
    ? progressRows.filter((r) => r.order_id === fOrder.id && r.sector_id === fSector)
    : []
  const needsComponent = rowsForOrderSector.length > 1 || (rowsForOrderSector[0]?.target_type === 'component')
  const selectedRow = needsComponent
    ? rowsForOrderSector.find((r) => r.component_id === fComponent)
    : rowsForOrderSector[0]

  // Pendiente real = lo que falta - lo que ya está afuera sin recibir (para no mandar dos veces lo mismo)
  const yaAfueraEnEsteRow = selectedRow
    ? tercerizaciones
        .filter((t) => t.estado === 'pendiente' && t.order_id === fOrder?.id && t.sector_id === fSector && (t.component_id || null) === (fComponent || null))
        .reduce((sum, t) => sum + Number(t.cantidad_enviada), 0)
    : 0
  const pendienteReal = selectedRow
    ? Math.max(0, selectedRow.quantity_required - selectedRow.quantity_completed - yaAfueraEnEsteRow)
    : null

  function resetForm() {
    setFOrderSearch(''); setFOrder(null); setFSector(''); setFComponent('')
    setFProveedor(''); setFCantidad(''); setFPrecioUnitario(''); setFFecha(today()); setFNotas('')
  }

  async function crearTercerizacion() {
    if (!fOrder || !fSector || !fProveedor.trim() || !fCantidad) {
      alert('Completá OP, sector, proveedor y cantidad.')
      return
    }
    if (needsComponent && !fComponent) {
      alert('Este sector tiene componentes — elegí cuál.')
      return
    }
    const cantidad = parseFloat(fCantidad)
    if (pendienteReal != null && cantidad > pendienteReal) {
      const proceed = confirm(`Esa OP solo tiene ${pendienteReal} unidades pendientes en este sector (contando lo que ya está afuera). ¿Enviar igual ${cantidad}?`)
      if (!proceed) return
    }
    const { error } = await supabase.from('tercerizaciones').insert({
      order_id: fOrder.id,
      sector_id: fSector,
      component_id: needsComponent ? fComponent : null,
      proveedor_nombre: fProveedor.trim(),
      cantidad_enviada: cantidad,
      precio_unitario: fPrecioUnitario ? parseFloat(fPrecioUnitario) : null,
      fecha_envio: fFecha,
      notas: fNotas || null,
    })
    if (error) { alert('Error al registrar: ' + error.message); return }
    resetForm()
    setTab('afuera')
    fetchAll()
  }

  function openRecibir(t: any) {
    setRecibirModal(t)
    setRecibirCantidad(String(t.cantidad_enviada))
    setRecibirFecha(today())
  }

  async function confirmarRecibido() {
    if (!recibirModal) return
    const cantidadRecibida = parseFloat(recibirCantidad || '0')
    if (!cantidadRecibida || cantidadRecibida <= 0) { alert('Ingresá una cantidad válida.'); return }

    // 1) Cerrar la terciarización
    const { error: e1 } = await supabase.from('tercerizaciones').update({
      estado: 'recibido', fecha_recibido: recibirFecha, cantidad_recibida: cantidadRecibida,
    }).eq('id', recibirModal.id)
    if (e1) { alert('Error al marcar como recibido: ' + e1.message); return }

    // 2) Sumar esa cantidad al avance real de la OP en ese sector/componente (mismo mecanismo que Avance de Producción)
    const { data: progressRow } = await supabase
      .from('order_component_progress')
      .select('id, quantity_completed')
      .eq('order_id', recibirModal.order_id)
      .eq('sector_id', recibirModal.sector_id)
      .eq('component_id', recibirModal.component_id ?? null)
      .maybeSingle()

    if (progressRow) {
      await supabase.from('order_component_progress')
        .update({ quantity_completed: progressRow.quantity_completed + cantidadRecibida })
        .eq('id', progressRow.id)
    }

    setRecibirModal(null)
    fetchAll()
  }

  async function eliminarTercerizacion(id: string) {
    if (!confirm('¿Eliminar este registro? Si ya estaba marcado como recibido, esto NO revierte el avance que ya se sumó a la OP.')) return
    await supabase.from('tercerizaciones').delete().eq('id', id)
    fetchAll()
  }

  const afuera = tercerizaciones.filter((t) => t.estado === 'pendiente')
  const totalAfueraValor = afuera.reduce((s, t) => s + Number(t.cantidad_enviada) * Number(t.precio_unitario || 0), 0)

  const [ry, rm] = reporteMonth.split('-').map(Number)
  const reporteStart = `${reporteMonth}-01`
  const reporteEnd = new Date(ry, rm, 1).toISOString().split('T')[0]
  const enviosDelMes = tercerizaciones.filter((t) => t.fecha_envio >= reporteStart && t.fecha_envio < reporteEnd)
  const totalMesCantidad = enviosDelMes.reduce((s, t) => s + Number(t.cantidad_enviada), 0)
  const totalMesValor = enviosDelMes.reduce((s, t) => s + Number(t.cantidad_enviada) * Number(t.precio_unitario || 0), 0)
  const porProveedorMes: Record<string, { cantidad: number; valor: number }> = {}
  enviosDelMes.forEach((t) => {
    if (!porProveedorMes[t.proveedor_nombre]) porProveedorMes[t.proveedor_nombre] = { cantidad: 0, valor: 0 }
    porProveedorMes[t.proveedor_nombre].cantidad += Number(t.cantidad_enviada)
    porProveedorMes[t.proveedor_nombre].valor += Number(t.cantidad_enviada) * Number(t.precio_unitario || 0)
  })

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Terciarización</h1>
      <p className="text-sm text-slate-500 mb-6">Producción enviada afuera: quién la tiene, a qué costo, y control mensual. No afecta el objetivo diario de nadie.</p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — no tenés permisos para editar este módulo.
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          ['afuera', 'Actualmente afuera'],
          ['nueva', 'Nuevo envío'],
          ['reporte', 'Reporte mensual'],
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

      {/* ===================== ACTUALMENTE AFUERA ===================== */}
      {tab === 'afuera' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Envíos pendientes de recibir</p>
              <p className="text-3xl font-semibold text-slate-800 mt-1">{afuera.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Valor total afuera</p>
              <p className="text-3xl font-semibold text-emerald-700 mt-1">${totalAfueraValor.toLocaleString('es-AR')}</p>
            </div>
          </div>

          {afuera.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay nada afuera en este momento.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">OP / Producto</th>
                    <th className="p-3 font-medium">Sector</th>
                    <th className="p-3 font-medium">Proveedor</th>
                    <th className="p-3 font-medium text-center">Cantidad</th>
                    <th className="p-3 font-medium text-right">Valor</th>
                    <th className="p-3 font-medium text-center">Enviado</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {afuera.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="p-3 text-slate-700">
                        <div className="text-xs text-slate-400">#{t.orders?.order_number}</div>
                        {t.orders?.products?.name}
                      </td>
                      <td className="p-3 text-slate-600">{t.sectors?.name}{t.components?.name ? ` — ${t.components.name}` : ''}</td>
                      <td className="p-3 text-slate-600">{t.proveedor_nombre}</td>
                      <td className="p-3 text-center text-slate-700 font-medium">{t.cantidad_enviada}</td>
                      <td className="p-3 text-right text-slate-500">
                        {t.precio_unitario != null ? `$${(t.cantidad_enviada * t.precio_unitario).toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="p-3 text-center text-slate-500 text-xs">{shortDate(t.fecha_envio)}</td>
                      <td className="p-3 text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => openRecibir(t)} className="text-xs text-emerald-600 hover:underline font-medium">Recibido</button>
                            <button onClick={() => eliminarTercerizacion(t.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== NUEVO ENVÍO ===================== */}
      {tab === 'nueva' && canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 max-w-2xl">
          <div className="relative min-w-0 mb-3">
            <label className="text-xs text-slate-500">OP</label>
            <input
              placeholder="Buscar por N° OP o producto..."
              value={fOrderSearch}
              onChange={(e) => { setFOrderSearch(e.target.value); setFOrder(null); setFOrderShowList(true) }}
              onFocus={() => setFOrderShowList(true)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1"
            />
            {fOrderShowList && fOrderSearch.length > 0 && !fOrder && (
              <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                {filteredOrders.length === 0 ? (
                  <div className="p-2 text-xs text-slate-400">Sin resultados</div>
                ) : filteredOrders.map((o) => (
                  <div key={o.id} onClick={() => pickOrder(o)} className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer">
                    #{o.order_number} — {o.products?.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Sector</label>
              <select value={fSector} onChange={(e) => { setFSector(e.target.value); setFComponent('') }} disabled={!fOrder}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1 disabled:bg-slate-50">
                <option value="">Elegí sector...</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {needsComponent ? (
              <div>
                <label className="text-xs text-slate-500">Componente</label>
                <select value={fComponent} onChange={(e) => setFComponent(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                  <option value="">Elegí componente...</option>
                  {rowsForOrderSector.map((r) => <option key={r.component_id} value={r.component_id}>{r.component_name}</option>)}
                </select>
              </div>
            ) : <div />}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Proveedor</label>
              <input value={fProveedor} onChange={(e) => setFProveedor(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">
                Cantidad {pendienteReal != null && <span className="text-slate-400">(pendiente: {pendienteReal} u.)</span>}
              </label>
              <input type="number" value={fCantidad} onChange={(e) => setFCantidad(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Precio por unidad (opcional)</label>
              <input type="number" value={fPrecioUnitario} onChange={(e) => setFPrecioUnitario(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Fecha de envío</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500">Notas (opcional)</label>
            <input value={fNotas} onChange={(e) => setFNotas(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
          </div>

          {fCantidad && fPrecioUnitario && (
            <p className="text-xs text-slate-500 mb-3">
              Total del envío: <strong className="text-slate-700">${(parseFloat(fCantidad) * parseFloat(fPrecioUnitario)).toLocaleString('es-AR')}</strong>
            </p>
          )}

          <button onClick={crearTercerizacion} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            Registrar envío
          </button>
        </div>
      )}

      {/* ===================== REPORTE MENSUAL ===================== */}
      {tab === 'reporte' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium text-slate-700">Mes</label>
            <input type="month" value={reporteMonth} onChange={(e) => setReporteMonth(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Unidades enviadas afuera este mes</p>
              <p className="text-3xl font-semibold text-slate-800 mt-1">{totalMesCantidad}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Costo total del mes</p>
              <p className="text-3xl font-semibold text-emerald-700 mt-1">${totalMesValor.toLocaleString('es-AR')}</p>
            </div>
          </div>

          {Object.keys(porProveedorMes).length === 0 ? (
            <p className="text-slate-400 text-sm">No hubo envíos este mes.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Por proveedor</p>
              <div className="space-y-2">
                {Object.entries(porProveedorMes).sort((a, b) => b[1].valor - a[1].valor).map(([prov, info]) => (
                  <div key={prov} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{prov}</span>
                    <span className="text-slate-700">{info.cantidad} u. — <strong>${info.valor.toLocaleString('es-AR')}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {enviosDelMes.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">OP / Producto</th>
                    <th className="p-3 font-medium">Proveedor</th>
                    <th className="p-3 font-medium text-center">Enviado</th>
                    <th className="p-3 font-medium text-center">Recibido</th>
                    <th className="p-3 font-medium text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {enviosDelMes.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="p-3 text-slate-500">{shortDate(t.fecha_envio)}</td>
                      <td className="p-3 text-slate-700">#{t.orders?.order_number} — {t.orders?.products?.name}</td>
                      <td className="p-3 text-slate-600">{t.proveedor_nombre}</td>
                      <td className="p-3 text-center">{t.cantidad_enviada}</td>
                      <td className="p-3 text-center">{t.cantidad_recibida ?? '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.estado === 'recibido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {t.estado === 'recibido' ? 'Recibido' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL: marcar como recibido */}
      {recibirModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRecibirModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg mb-1">¿Recibido de {recibirModal.proveedor_nombre}?</h3>
            <p className="text-sm text-slate-500 mb-4">
              #{recibirModal.orders?.order_number} — {recibirModal.orders?.products?.name} — {recibirModal.sectors?.name}
            </p>
            <div className="mb-3">
              <label className="text-xs text-slate-500">Cantidad recibida (enviaste {recibirModal.cantidad_enviada})</label>
              <input type="number" value={recibirCantidad} onChange={(e) => setRecibirCantidad(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div className="mb-4">
              <label className="text-xs text-slate-500">Fecha</label>
              <input type="date" value={recibirFecha} onChange={(e) => setRecibirFecha(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5 mb-4">
              Esto suma la cantidad recibida al avance de la OP en Avance de Producción — no hace falta que la cargues ahí también.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRecibirModal(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={confirmarRecibido} className="flex-1 bg-emerald-600 text-white rounded-md py-2 text-sm font-medium hover:bg-emerald-700">
                Confirmar recibido
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}