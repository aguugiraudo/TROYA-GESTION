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

export default function InsumosPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'

  const [categorias, setCategorias] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({})
  const [operators, setOperators] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [newCategoriaName, setNewCategoriaName] = useState('')

  const [showNewItem, setShowNewItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategoriaId, setNewItemCategoriaId] = useState('')
  const [newItemUnidad, setNewItemUnidad] = useState('u.')
  const [newItemStockMinimo, setNewItemStockMinimo] = useState('0')

  const [movModalItem, setMovModalItem] = useState<any | null>(null)
  const [movTipo, setMovTipo] = useState<'ingreso' | 'egreso'>('ingreso')
  const [movCantidad, setMovCantidad] = useState('')
  const [movOperatorId, setMovOperatorId] = useState('')
  const [movMotivo, setMovMotivo] = useState('')
  const [movFecha, setMovFecha] = useState(today())

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
      .select('*, insumos(nombre, unidad_medida), operators(full_name)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
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

  function openNewItem() {
    setNewItemName(''); setNewItemCategoriaId(categorias[0]?.id || ''); setNewItemUnidad('u.'); setNewItemStockMinimo('0')
    setShowNewItem(true)
  }

  async function createItem() {
    if (!newItemName.trim()) { alert('Completá el nombre del ítem.'); return }
    const { error } = await supabase.from('insumos').insert({
      nombre: newItemName.trim(),
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

  function openMovModal(item: any) {
    setMovModalItem(item)
    setMovTipo('ingreso')
    setMovCantidad('')
    setMovOperatorId('')
    setMovMotivo('')
    setMovFecha(today())
  }

  async function saveMovimiento() {
    if (!movModalItem) return
    const cantidad = parseFloat(movCantidad || '0')
    if (!cantidad || cantidad <= 0) { alert('Ingresá una cantidad válida.'); return }
    if (movTipo === 'egreso') {
      if (!movOperatorId) { alert('Elegí qué operario retira esto.'); return }
      const stockActual = stockByItem[movModalItem.id] || 0
      if (cantidad > stockActual) {
        const proceed = confirm(`Solo quedan ${stockActual} ${movModalItem.unidad_medida} en stock. ¿Registrar igual el egreso de ${cantidad}?`)
        if (!proceed) return
      }
    }
    const { error } = await supabase.from('insumo_movimientos').insert({
      insumo_id: movModalItem.id,
      tipo: movTipo,
      cantidad,
      operator_id: movOperatorId || null,
      motivo: movMotivo || null,
      fecha: movFecha,
    })
    if (error) { alert('Error al registrar el movimiento: ' + error.message); return }
    setMovModalItem(null)
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

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Insumos, Consumibles y EPP</h1>
      <p className="text-sm text-slate-500 mb-6">Stock, ingresos y egresos. El saldo se calcula solo — no se edita a mano.</p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — no tenés permisos para editar este módulo.
        </div>
      )}

      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
          <h2 className="font-semibold text-slate-700 text-sm mb-2">Categorías</h2>
          <div className="flex flex-wrap items-center gap-2">
            {categorias.map((c) => (
              <span key={c.id} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{c.nombre}</span>
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
        <h2 className="font-semibold text-slate-700">Catálogo de ítems</h2>
        {canEdit && (
          <button onClick={openNewItem} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
            + Nuevo ítem
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-slate-400 text-sm mb-8">Todavía no cargaste ningún ítem.</p>
      ) : (
        <div className="space-y-5 mb-8">
          {categorias.filter((c) => itemsByCategoria[c.id]?.length > 0).map((c) => (
            <div key={c.id}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{c.nombre}</p>
              <ItemsTable items={itemsByCategoria[c.id]} stockByItem={stockByItem} canEdit={canEdit}
                onMov={openMovModal} onDelete={deleteItem} />
            </div>
          ))}
          {sinCategoria.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sin categoría</p>
              <ItemsTable items={sinCategoria} stockByItem={stockByItem} canEdit={canEdit}
                onMov={openMovModal} onDelete={deleteItem} />
            </div>
          )}
        </div>
      )}

      <h2 className="font-semibold text-slate-700 mb-3">Últimos movimientos</h2>
      {movimientos.length === 0 ? (
        <p className="text-slate-400 text-sm">Todavía no hay movimientos registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-left">
                <th className="p-3 font-medium">Fecha</th>
                <th className="p-3 font-medium">Ítem</th>
                <th className="p-3 font-medium text-center">Tipo</th>
                <th className="p-3 font-medium text-center">Cantidad</th>
                <th className="p-3 font-medium">Operario</th>
                <th className="p-3 font-medium">Motivo</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m: any) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="p-3 text-slate-500">{shortDate(m.fecha)}</td>
                  <td className="p-3 text-slate-700">{m.insumos?.nombre}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      m.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </td>
                  <td className="p-3 text-center font-medium text-slate-700">
                    {m.tipo === 'ingreso' ? '+' : '-'}{m.cantidad} {m.insumos?.unidad_medida}
                  </td>
                  <td className="p-3 text-slate-600">{m.operators?.full_name || '—'}</td>
                  <td className="p-3 text-slate-500 italic">{m.motivo || '—'}</td>
                  <td className="p-3 text-right">
                    {canEdit && (
                      <button onClick={() => deleteMovimiento(m.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      {/* MODAL registrar movimiento */}
      {movModalItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMovModalItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">{movModalItem.nombre}</h3>
            <p className="text-xs text-slate-400 mb-4">
              Stock actual: <strong className="text-slate-600">{stockByItem[movModalItem.id] || 0} {movModalItem.unidad_medida}</strong>
            </p>

            <div className="flex gap-2 mb-3">
              <button onClick={() => setMovTipo('ingreso')}
                className={`flex-1 text-sm py-1.5 rounded-md border font-medium ${movTipo === 'ingreso' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-600'}`}>
                Ingreso
              </button>
              <button onClick={() => setMovTipo('egreso')}
                className={`flex-1 text-sm py-1.5 rounded-md border font-medium ${movTipo === 'egreso' ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-300 text-slate-600'}`}>
                Egreso
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Cantidad ({movModalItem.unidad_medida})</label>
                <input type="number" value={movCantidad} onChange={(e) => setMovCantidad(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500">
                  Operario {movTipo === 'egreso' ? '(obligatorio)' : '(opcional)'}
                </label>
                <select value={movOperatorId} onChange={(e) => setMovOperatorId(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full">
                  <option value="">Elegí un operario...</option>
                  {operators.map((op) => <option key={op.id} value={op.id}>{op.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Fecha</label>
                <input type="date" value={movFecha} onChange={(e) => setMovFecha(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Motivo (opcional)</label>
                <input placeholder="Ej: compra proveedor X, retiro para OP #492" value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setMovModalItem(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveMovimiento} className={`flex-1 text-white rounded-md py-2 text-sm font-medium ${
                movTipo === 'ingreso' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}>
                Registrar {movTipo === 'ingreso' ? 'ingreso' : 'egreso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ItemsTable({ items, stockByItem, canEdit, onMov, onDelete }: {
  items: any[]; stockByItem: Record<string, number>; canEdit: boolean
  onMov: (item: any) => void; onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white text-left">
            <th className="p-3 font-medium">Ítem</th>
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
                <td className="p-3 text-slate-700 font-medium">{it.nombre}</td>
                <td className="p-3 text-center text-slate-600">{stock} {it.unidad_medida}</td>
                <td className="p-3 text-center text-slate-400">{it.stock_minimo} {it.unidad_medida}</td>
                <td className="p-3 text-center">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    bajo ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {bajo ? '⚠ Stock bajo' : 'OK'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {canEdit && (
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => onMov(it)} className="text-xs text-blue-600 hover:underline">Movimiento</button>
                      <button onClick={() => onDelete(it.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                    </div>
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