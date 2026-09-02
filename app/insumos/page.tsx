'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function today() {
  return new Date().toISOString().split('T')[0]
}

function shortDate(iso: string) {
  return iso.split('-').reverse().join('/')
}

type Tab = 'stock' | 'ingresos' | 'egresos'

export default function InsumosPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'

  const [tab, setTab] = useState<Tab>('stock')

  const [categorias, setCategorias] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({})
  const [operators, setOperators] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [newCategoriaName, setNewCategoriaName] = useState('')
  const [editingCategoriaId, setEditingCategoriaId] = useState<string | null>(null)

  const [showNewItem, setShowNewItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCodigo, setNewItemCodigo] = useState('')
  const [newItemCategoriaId, setNewItemCategoriaId] = useState('')
  const [newItemUnidad, setNewItemUnidad] = useState('u.')
  const [newItemStockMinimo, setNewItemStockMinimo] = useState('0')

  // --- Formulario de Ingreso ---
  const [inSearch, setInSearch] = useState('')
  const [inShowList, setInShowList] = useState(false)
  const [inItem, setInItem] = useState<any | null>(null)
  const [inCantidad, setInCantidad] = useState('')
  const [inOperatorId, setInOperatorId] = useState('')
  const [inFecha, setInFecha] = useState(today())
  const [inMotivo, setInMotivo] = useState('')

  // --- Formulario de Egreso ---
  const [outSearch, setOutSearch] = useState('')
  const [outShowList, setOutShowList] = useState(false)
  const [outItem, setOutItem] = useState<any | null>(null)
  const [outCantidad, setOutCantidad] = useState('')
  const [outOperatorId, setOutOperatorId] = useState('')
  const [outFecha, setOutFecha] = useState(today())
  const [outMotivo, setOutMotivo] = useState('')

  // --- Historial por ítem (modal) ---
  const [historyItem, setHistoryItem] = useState<any | null>(null)
  const [historyRows, setHistoryRows] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  async function openItemHistory(item: any) {
    setHistoryItem(item)
    setHistoryLoading(true)
    const { data } = await supabase
      .from('insumo_movimientos')
      .select('*, operators(full_name)')
      .eq('insumo_id', item.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setHistoryRows(data || [])
    setHistoryLoading(false)
  }

  async function fetchAll() {
    setLoading(true)
    const { data: catData } = await supabase.from('insumo_categorias').select('*').order('nombre')
    setCategorias(catData || [])

    const { data: itemsData } = await supabase.from('insumos').select('*').order('nombre')
    setItems(itemsData || [])

    const { data: stockData } = await supabase.from('insumo_stock').select('*')
    const stockMap: Record<string, number> = {}
    ;(stockData || []).forEach((r: any) => { stockMap[r.insumo_id] = Number(r.stock_actual) })
    setStockByItem(stockMap)

    const { data: opsData } = await supabase.from('operators').select('*').eq('active', true).order('full_name')
    setOperators(opsData || [])

    const { data: movData } = await supabase
      .from('insumo_movimientos')
      .select('*, insumos(nombre, unidad_medida, codigo), operators(full_name)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)
    setMovimientos(movData || [])

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function addCategoria() {
    if (!newCategoriaName.trim()) return
    const { error } = await supabase.from('insumo_categorias').insert({ nombre: newCategoriaName.trim() })
    if (error) { alert('Error al crear la categoría: ' + error.message); return }
    setNewCategoriaName('')
    fetchAll()
  }

  async function saveCategoriaName(id: string, value: string) {
    if (!value.trim()) { setEditingCategoriaId(null); return }
    const { error } = await supabase.from('insumo_categorias').update({ nombre: value.trim() }).eq('id', id)
    if (error) { alert('Error al renombrar: ' + error.message); return }
    setEditingCategoriaId(null)
    fetchAll()
  }

  async function deleteCategoria(id: string, nombre: string) {
    const itemsEnCategoria = items.filter((it) => it.categoria_id === id).length
    const msg = itemsEnCategoria > 0
      ? `"${nombre}" tiene ${itemsEnCategoria} ítem(s) cargado(s). Si la eliminás, esos ítems quedan como "Sin categoría" (no se borran). ¿Continuar?`
      : `¿Eliminar la categoría "${nombre}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('insumo_categorias').delete().eq('id', id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    fetchAll()
  }

  function openNewItem() {
    setNewItemName(''); setNewItemCodigo(''); setNewItemCategoriaId(categorias[0]?.id || ''); setNewItemUnidad('u.'); setNewItemStockMinimo('0')
    setShowNewItem(true)
  }

  async function createItem() {
    if (!newItemName.trim()) { alert('Completá el nombre del ítem.'); return }
    const { error } = await supabase.from('insumos').insert({
      nombre: newItemName.trim(),
      codigo: newItemCodigo.trim() || null,
      categoria_id: newItemCategoriaId || null,
      unidad_medida: newItemUnidad.trim() || 'u.',
      stock_minimo: parseFloat(newItemStockMinimo || '0'),
    })
    if (error) { alert('Error al crear el ítem: ' + error.message); return }
    setShowNewItem(false)
    fetchAll()
  }

  async function deleteItem(id: string) {
    if (!confirm('¿Eliminar este ítem? También se borran todos sus movimientos.')) return
    const { error } = await supabase.from('insumos').delete().eq('id', id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    fetchAll()
  }

  async function saveItemCodigo(id: string, value: string) {
    const { error } = await supabase.from('insumos').update({ codigo: value.trim() || null }).eq('id', id)
    if (error) { alert('Error al actualizar el código: ' + error.message); return }
    fetchAll()
  }

  async function saveItemNombre(id: string, value: string) {
    if (!value.trim()) return
    const { error } = await supabase.from('insumos').update({ nombre: value.trim() }).eq('id', id)
    if (error) { alert('Error al renombrar: ' + error.message); return }
    fetchAll()
  }

  async function saveItemUnidad(id: string, value: string) {
    if (!value.trim()) return
    const { error } = await supabase.from('insumos').update({ unidad_medida: value.trim() }).eq('id', id)
    if (error) { alert('Error al actualizar la unidad: ' + error.message); return }
    fetchAll()
  }

  async function saveItemStockMinimo(id: string, value: string) {
    const val = Math.max(0, parseFloat(value || '0'))
    const { error } = await supabase.from('insumos').update({ stock_minimo: val }).eq('id', id)
    if (error) { alert('Error al actualizar el stock mínimo: ' + error.message); return }
    fetchAll()
  }

  function matchesSearch(it: any, search: string) {
    const s = search.toLowerCase()
    return it.nombre.toLowerCase().includes(s) || (it.codigo || '').toLowerCase().includes(s)
  }

  const inFiltered = inSearch.length > 0 ? items.filter((it) => matchesSearch(it, inSearch)) : items
  const outFiltered = outSearch.length > 0 ? items.filter((it) => matchesSearch(it, outSearch)) : items

  function pickInItem(it: any) {
    setInItem(it); setInSearch(`${it.nombre}${it.codigo ? ` (${it.codigo})` : ''}`); setInShowList(false)
  }
  function pickOutItem(it: any) {
    setOutItem(it); setOutSearch(`${it.nombre}${it.codigo ? ` (${it.codigo})` : ''}`); setOutShowList(false)
  }

  function resetIngresoForm() {
    setInSearch(''); setInItem(null); setInCantidad(''); setInOperatorId(''); setInFecha(today()); setInMotivo('')
  }
  function resetEgresoForm() {
    setOutSearch(''); setOutItem(null); setOutCantidad(''); setOutOperatorId(''); setOutFecha(today()); setOutMotivo('')
  }

  async function registrarIngreso() {
    if (!inItem) { alert('Elegí un ítem de la lista.'); return }
    if (!inOperatorId) { alert('Elegí qué operario registró el ingreso.'); return }
    const cantidad = parseFloat(inCantidad || '0')
    if (!cantidad || cantidad <= 0) { alert('Ingresá una cantidad válida.'); return }

    const { error } = await supabase.from('insumo_movimientos').insert({
      insumo_id: inItem.id, tipo: 'ingreso', cantidad,
      operator_id: inOperatorId, motivo: inMotivo || null, fecha: inFecha,
    })
    if (error) { alert('Error al registrar el ingreso: ' + error.message); return }
    resetIngresoForm()
    fetchAll()
  }

  async function registrarEgreso() {
    if (!outItem) { alert('Elegí un ítem de la lista.'); return }
    if (!outOperatorId) { alert('Elegí qué operario retira esto.'); return }
    const cantidad = parseFloat(outCantidad || '0')
    if (!cantidad || cantidad <= 0) { alert('Ingresá una cantidad válida.'); return }

    const stockActual = stockByItem[outItem.id] || 0
    if (cantidad > stockActual) {
      const proceed = confirm(`Solo quedan ${stockActual} ${outItem.unidad_medida} en stock. ¿Registrar igual el egreso de ${cantidad}?`)
      if (!proceed) return
    }

    const { error } = await supabase.from('insumo_movimientos').insert({
      insumo_id: outItem.id, tipo: 'egreso', cantidad,
      operator_id: outOperatorId, motivo: outMotivo || null, fecha: outFecha,
    })
    if (error) { alert('Error al registrar el egreso: ' + error.message); return }
    resetEgresoForm()
    fetchAll()
  }

  async function deleteMovimiento(id: string) {
    if (!confirm('¿Eliminar este movimiento? El stock se recalcula solo.')) return
    await supabase.from('insumo_movimientos').delete().eq('id', id)
    fetchAll()
  }

  const itemsByCategoria: Record<string, any[]> = {}
  const sinCategoria: any[] = []
  items.forEach((it) => {
    if (!it.categoria_id) { sinCategoria.push(it); return }
    if (!itemsByCategoria[it.categoria_id]) itemsByCategoria[it.categoria_id] = []
    itemsByCategoria[it.categoria_id].push(it)
  })

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso')
  const egresos = movimientos.filter((m) => m.tipo === 'egreso')

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Insumos, Consumibles y EPP</h1>
      <p className="text-sm text-slate-500 mb-1">Stock, ingresos y egresos. El saldo se calcula solo — no se edita a mano.</p>
      <p className="text-xs text-slate-400 mb-5">
        Para arrancar: creá el ítem en "Stock" y después cargá su primer movimiento en "Ingresos" — ese primer ingreso es el que arranca el stock, no hace falta cargarlo aparte.
      </p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — no tenés permisos para editar este módulo.
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          ['stock', 'Stock'],
          ['ingresos', 'Ingresos'],
          ['egresos', 'Egresos'],
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

      {/* ===================== PESTAÑA STOCK ===================== */}
      {tab === 'stock' && (
        <>
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
              <h2 className="font-semibold text-slate-700 text-sm mb-2">Categorías</h2>
              <div className="flex flex-wrap items-center gap-2">
                {categorias.map((c) => (
                  editingCategoriaId === c.id ? (
                    <input
                      key={c.id}
                      autoFocus
                      defaultValue={c.nombre}
                      onBlur={(e) => saveCategoriaName(c.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="text-xs border border-blue-300 rounded-full px-2.5 py-1 w-32"
                    />
                  ) : (
                    <span key={c.id} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 pl-2.5 pr-1.5 py-1 rounded-full">
                      <button onClick={() => setEditingCategoriaId(c.id)} className="hover:underline decoration-dotted" title="Click para renombrar">
                        {c.nombre}
                      </button>
                      <button onClick={() => deleteCategoria(c.id, c.nombre)} className="text-slate-400 hover:text-rose-600 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px]" title="Eliminar categoría">
                        ✕
                      </button>
                    </span>
                  )
                ))}
                <div className="flex gap-1 ml-auto">
                  <input
                    placeholder="Nueva categoría..."
                    value={newCategoriaName}
                    onChange={(e) => setNewCategoriaName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addCategoria() }}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs w-40"
                  />
                  <button onClick={addCategoria} className="text-xs bg-slate-700 text-white px-3 rounded-md hover:bg-slate-800">
                    + Agregar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Catálogo de ítems y stock</h2>
            {canEdit && (
              <button onClick={openNewItem} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
                + Nuevo ítem
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-slate-400 text-sm mb-8">Todavía no cargaste ningún ítem. Empezá con "+ Nuevo ítem".</p>
          ) : (
            <div className="space-y-5 mb-8">
              {categorias.filter((c) => itemsByCategoria[c.id]?.length > 0).map((c) => (
                <div key={c.id}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{c.nombre}</p>
                  <ItemsTable items={itemsByCategoria[c.id]} stockByItem={stockByItem} canEdit={canEdit} onDelete={deleteItem} onSelect={openItemHistory} onSaveCodigo={saveItemCodigo} onSaveNombre={saveItemNombre} onSaveUnidad={saveItemUnidad} onSaveStockMinimo={saveItemStockMinimo} />
                </div>
              ))}
              {sinCategoria.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sin categoría</p>
                  <ItemsTable items={sinCategoria} stockByItem={stockByItem} canEdit={canEdit} onDelete={deleteItem} onSelect={openItemHistory} onSaveCodigo={saveItemCodigo} onSaveNombre={saveItemNombre} onSaveUnidad={saveItemUnidad} onSaveStockMinimo={saveItemStockMinimo} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===================== PESTAÑA INGRESOS ===================== */}
      {tab === 'ingresos' && (
        <>
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
              <h2 className="font-semibold text-slate-700 mb-3">Registrar ingreso</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="relative min-w-0">
                  <label className="text-xs text-slate-500">Ítem</label>
                  <input
                    placeholder="Buscar por nombre o código..."
                    value={inSearch}
                    onChange={(e) => { setInSearch(e.target.value); setInItem(null); setInShowList(true) }}
                    onFocus={() => setInShowList(true)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1"
                  />
                  {inShowList && !inItem && (
                    <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                      {inFiltered.length === 0 ? (
                        <div className="p-2 text-xs text-slate-400">Sin resultados</div>
                      ) : inFiltered.map((it) => (
                        <div key={it.id} onClick={() => pickInItem(it)} className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer flex justify-between gap-2">
                          <span>{it.nombre}</span>
                          {it.codigo && <span className="text-xs text-slate-400">{it.codigo}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cantidad {inItem ? `(${inItem.unidad_medida})` : ''}</label>
                  <input type="number" value={inCantidad} onChange={(e) => setInCantidad(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500">Operario</label>
                  <select value={inOperatorId} onChange={(e) => setInOperatorId(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                    <option value="">Elegí un operario...</option>
                    {operators.map((op) => <option key={op.id} value={op.id}>{op.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Fecha</label>
                  <input type="date" value={inFecha} onChange={(e) => setInFecha(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Motivo (opcional)</label>
                  <input placeholder="Ej: compra proveedor X" value={inMotivo} onChange={(e) => setInMotivo(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              {inItem && (
                <p className="text-xs text-slate-400 mb-3">
                  Stock actual de {inItem.nombre}: <strong className="text-slate-600">{stockByItem[inItem.id] || 0} {inItem.unidad_medida}</strong>
                </p>
              )}
              <button onClick={registrarIngreso} className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700">
                Registrar ingreso
              </button>
            </div>
          )}

          <h2 className="font-semibold text-slate-700 mb-3">Últimos ingresos</h2>
          <MovimientosTable rows={ingresos} canEdit={canEdit} onDelete={deleteMovimiento} />
        </>
      )}

      {/* ===================== PESTAÑA EGRESOS ===================== */}
      {tab === 'egresos' && (
        <>
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
              <h2 className="font-semibold text-slate-700 mb-3">Registrar egreso</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="relative min-w-0">
                  <label className="text-xs text-slate-500">Ítem</label>
                  <input
                    placeholder="Buscar por nombre o código..."
                    value={outSearch}
                    onChange={(e) => { setOutSearch(e.target.value); setOutItem(null); setOutShowList(true) }}
                    onFocus={() => setOutShowList(true)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1"
                  />
                  {outShowList && !outItem && (
                    <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                      {outFiltered.length === 0 ? (
                        <div className="p-2 text-xs text-slate-400">Sin resultados</div>
                      ) : outFiltered.map((it) => (
                        <div key={it.id} onClick={() => pickOutItem(it)} className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer flex justify-between gap-2">
                          <span>{it.nombre}</span>
                          {it.codigo && <span className="text-xs text-slate-400">{it.codigo}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cantidad {outItem ? `(${outItem.unidad_medida})` : ''}</label>
                  <input type="number" value={outCantidad} onChange={(e) => setOutCantidad(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500">Operario</label>
                  <select value={outOperatorId} onChange={(e) => setOutOperatorId(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                    <option value="">Elegí un operario...</option>
                    {operators.map((op) => <option key={op.id} value={op.id}>{op.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Fecha</label>
                  <input type="date" value={outFecha} onChange={(e) => setOutFecha(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Motivo (opcional)</label>
                  <input placeholder="Ej: retiro para OP #492" value={outMotivo} onChange={(e) => setOutMotivo(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              {outItem && (
                <p className="text-xs text-slate-400 mb-3">
                  Stock actual de {outItem.nombre}: <strong className="text-slate-600">{stockByItem[outItem.id] || 0} {outItem.unidad_medida}</strong>
                </p>
              )}
              <button onClick={registrarEgreso} className="bg-rose-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-rose-700">
                Registrar egreso
              </button>
            </div>
          )}

          <h2 className="font-semibold text-slate-700 mb-3">Últimos egresos</h2>
          <MovimientosTable rows={egresos} canEdit={canEdit} onDelete={deleteMovimiento} />
        </>
      )}

      {/* MODAL nuevo ítem */}
      {showNewItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewItem(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-4">Nuevo ítem</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Nombre</label>
                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Código interno (para pedidos, opcional)</label>
                <input value={newItemCodigo} onChange={(e) => setNewItemCodigo(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Categoría</label>
                <select value={newItemCategoriaId} onChange={(e) => setNewItemCategoriaId(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full">
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Unidad</label>
                  <input placeholder="u. / litro / kg / par" value={newItemUnidad} onChange={(e) => setNewItemUnidad(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Stock mínimo</label>
                  <input type="number" value={newItemStockMinimo} onChange={(e) => setNewItemStockMinimo(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Después de crearlo, andá a la pestaña "Ingresos" y cargá la cantidad que tenés hoy — ese primer movimiento arranca el stock.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNewItem(false)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={createItem} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: historial de movimientos de un ítem puntual */}
      {historyItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setHistoryItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">{historyItem.nombre}</h3>
                <p className="text-sm text-slate-500">
                  Stock actual: <strong className="text-slate-700">{stockByItem[historyItem.id] || 0} {historyItem.unidad_medida}</strong>
                </p>
              </div>
              <button onClick={() => setHistoryItem(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>

            <div className="mt-4">
              {historyLoading ? (
                <p className="text-sm text-slate-400">Cargando...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no hay movimientos para este ítem.</p>
              ) : (
                <div className="space-y-2">
                  {historyRows.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700">
                          {shortDate(m.fecha)} — <strong className={m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.tipo === 'ingreso' ? '+' : '-'}{m.cantidad} {historyItem.unidad_medida}
                          </strong>
                        </p>
                        <p className="text-xs text-slate-500">
                          {m.operators?.full_name || 'Sin operario'}{m.notes ? ` — "${m.notes}"` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        m.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setHistoryItem(null)} className="mt-4 w-full bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function ItemsTable({ items, stockByItem, canEdit, onDelete, onSelect, onSaveCodigo, onSaveNombre, onSaveUnidad, onSaveStockMinimo }: {
  items: any[]; stockByItem: Record<string, number>; canEdit: boolean; onDelete: (id: string) => void; onSelect: (item: any) => void
  onSaveCodigo: (id: string, value: string) => void; onSaveNombre: (id: string, value: string) => void
  onSaveUnidad: (id: string, value: string) => void; onSaveStockMinimo: (id: string, value: string) => void
}) {
  const [editingField, setEditingField] = useState<{ id: string; field: 'codigo' | 'nombre' | 'unidad' | 'stock_minimo' } | null>(null)

  function isEditing(id: string, field: string) {
    return editingField?.id === id && editingField?.field === field
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white text-left">
            <th className="p-3 font-medium">Código</th>
            <th className="p-3 font-medium">Ítem</th>
            <th className="p-3 font-medium text-center">Unidad</th>
            <th className="p-3 font-medium text-center">Stock actual</th>
            <th className="p-3 font-medium text-center">Stock mínimo</th>
            <th className="p-3 font-medium text-center">Estado</th>
            <th className="p-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const stock = stockByItem[it.id] || 0
            const bajo = stock < it.stock_minimo
            return (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="p-3 text-slate-400 text-xs">
                  {canEdit && isEditing(it.id, 'codigo') ? (
                    <input autoFocus defaultValue={it.codigo || ''}
                      onBlur={(e) => { onSaveCodigo(it.id, e.target.value); setEditingField(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="w-20 rounded-md border border-blue-300 py-0.5 px-1 text-xs" />
                  ) : (
                    <button onClick={() => canEdit && setEditingField({ id: it.id, field: 'codigo' })} disabled={!canEdit}
                      className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                      {it.codigo || (canEdit ? '+ código' : '—')}
                    </button>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    {canEdit && isEditing(it.id, 'nombre') ? (
                      <input autoFocus defaultValue={it.nombre}
                        onBlur={(e) => { onSaveNombre(it.id, e.target.value); setEditingField(null) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className="w-full min-w-[160px] rounded-md border border-blue-300 py-0.5 px-1 text-sm" />
                    ) : (
                      <>
                        <button onClick={() => onSelect(it)} className="text-slate-700 font-medium hover:text-blue-700 hover:underline decoration-dotted text-left" title="Ver historial">
                          {it.nombre}
                        </button>
                        {canEdit && (
                          <button onClick={() => setEditingField({ id: it.id, field: 'nombre' })} title="Renombrar" className="text-slate-300 hover:text-blue-600 text-xs">✎</button>
                        )}
                      </>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center">
                  {canEdit && isEditing(it.id, 'unidad') ? (
                    <input autoFocus defaultValue={it.unidad_medida}
                      onBlur={(e) => { onSaveUnidad(it.id, e.target.value); setEditingField(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="w-16 text-center rounded-md border border-blue-300 py-0.5 text-xs" />
                  ) : (
                    <button onClick={() => canEdit && setEditingField({ id: it.id, field: 'unidad' })} disabled={!canEdit}
                      className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                      {it.unidad_medida}
                    </button>
                  )}
                </td>
                <td className="p-3 text-center text-slate-600">{stock} {it.unidad_medida}</td>
                <td className="p-3 text-center text-slate-400">
                  {canEdit && isEditing(it.id, 'stock_minimo') ? (
                    <input type="number" autoFocus defaultValue={it.stock_minimo}
                      onBlur={(e) => { onSaveStockMinimo(it.id, e.target.value); setEditingField(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="w-16 text-center rounded-md border border-blue-300 py-0.5 text-xs" />
                  ) : (
                    <button onClick={() => canEdit && setEditingField({ id: it.id, field: 'stock_minimo' })} disabled={!canEdit}
                      className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                      {it.stock_minimo} {it.unidad_medida}
                    </button>
                  )}
                </td>
                <td className="p-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    bajo ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {bajo ? '⚠ Stock bajo' : 'OK'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {canEdit && (
                    <button onClick={() => onDelete(it.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MovimientosTable({ rows, canEdit, onDelete }: { rows: any[]; canEdit: boolean; onDelete: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="text-slate-400 text-sm">Todavía no hay movimientos acá.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white text-left">
            <th className="p-3 font-medium">Fecha</th>
            <th className="p-3 font-medium">Ítem</th>
            <th className="p-3 font-medium text-center">Cantidad</th>
            <th className="p-3 font-medium">Operario</th>
            <th className="p-3 font-medium">Motivo</th>
            <th className="p-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m: any) => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="p-3 text-slate-500">{shortDate(m.fecha)}</td>
              <td className="p-3 text-slate-700">
                {m.insumos?.nombre}
                {m.insumos?.codigo && <span className="text-xs text-slate-400"> ({m.insumos.codigo})</span>}
              </td>
              <td className="p-3 text-center font-medium text-slate-700">{m.cantidad} {m.insumos?.unidad_medida}</td>
              <td className="p-3 text-slate-600">{m.operators?.full_name || '—'}</td>
              <td className="p-3 text-slate-500 italic">{m.motivo || '—'}</td>
              <td className="p-3 text-right">
                {canEdit && (
                  <button onClick={() => onDelete(m.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
