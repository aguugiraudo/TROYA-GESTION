'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tab = 'composicion' | 'calculadora'

export default function MateriaPrimaPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1'

  const [tab, setTab] = useState<Tab>('calculadora')

  const [products, setProducts] = useState<any[]>([])
  const [materiales, setMateriales] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // --- Composición ---
  const [compSearch, setCompSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [productMaterials, setProductMaterials] = useState<any[]>([])
  const [newMatName, setNewMatName] = useState('')
  const [newMatUnidad, setNewMatUnidad] = useState('u.')
  const [addMatId, setAddMatId] = useState('')
  const [addMatQty, setAddMatQty] = useState('')
  const [addMatSector, setAddMatSector] = useState('')

  // --- Calculadora ---
  const [calcSearch, setCalcSearch] = useState('')
  const [calcShowList, setCalcShowList] = useState(false)
  const [calcRows, setCalcRows] = useState<{ productId: string; productName: string; qty: string }[]>([])
  const [allProductMaterials, setAllProductMaterials] = useState<any[]>([])

  async function fetchAll() {
    setLoading(true)
    const { data: productsData } = await supabase.from('products').select('id, code, name').order('name')
    setProducts(productsData || [])
    const { data: matData } = await supabase.from('materiales').select('*').order('nombre')
    setMateriales(matData || [])
    const { data: sectorsData } = await supabase.from('sectors').select('*').order('sequence_no')
    setSectors(sectorsData || [])
    const { data: pmData } = await supabase.from('producto_materiales').select('*, materiales(nombre, unidad_medida), sectors(name)')
    setAllProductMaterials(pmData || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  async function fetchProductMaterials(productId: string) {
    const { data } = await supabase
      .from('producto_materiales').select('*, materiales(nombre, unidad_medida), sectors(name)').eq('product_id', productId)
    setProductMaterials(data || [])
  }

  async function selectProductForComp(p: any) {
    setSelectedProduct(p)
    setCompSearch('')
    await fetchProductMaterials(p.id)
  }

  async function addMaterialGlobal() {
    if (!newMatName.trim()) return
    const { error } = await supabase.from('materiales').insert({ nombre: newMatName.trim(), unidad_medida: newMatUnidad.trim() || 'u.' })
    if (error) { alert('Error al crear el material: ' + error.message); return }
    setNewMatName(''); setNewMatUnidad('u.')
    fetchAll()
  }

  async function addMaterialToProduct() {
    if (!selectedProduct || !addMatId || !addMatQty) { alert('Elegí un material y una cantidad.'); return }
    const { error } = await supabase.from('producto_materiales').insert({
      product_id: selectedProduct.id, material_id: addMatId, cantidad_por_unidad: parseFloat(addMatQty),
      sector_id: addMatSector || null,
    })
    if (error) { alert('Error al agregar: ' + error.message); return }
    setAddMatId(''); setAddMatQty(''); setAddMatSector('')
    fetchProductMaterials(selectedProduct.id)
    fetchAll()
  }

  async function saveProductMaterialQty(id: string, qty: number) {
    await supabase.from('producto_materiales').update({ cantidad_por_unidad: qty }).eq('id', id)
    if (selectedProduct) fetchProductMaterials(selectedProduct.id)
    fetchAll()
  }

  async function saveProductMaterialSector(id: string, sectorId: string) {
    await supabase.from('producto_materiales').update({ sector_id: sectorId || null }).eq('id', id)
    if (selectedProduct) fetchProductMaterials(selectedProduct.id)
    fetchAll()
  }

  async function removeProductMaterial(id: string) {
    if (!confirm('¿Quitar este material de la composición del producto?')) return
    await supabase.from('producto_materiales').delete().eq('id', id)
    if (selectedProduct) fetchProductMaterials(selectedProduct.id)
    fetchAll()
  }

  const filteredCompProducts = compSearch.length > 0
    ? products.filter((p) => p.name.toLowerCase().includes(compSearch.toLowerCase()) || p.code.includes(compSearch))
    : products

  // --- Calculadora ---
  const filteredCalcProducts = calcSearch.length > 0
    ? products.filter((p) => p.name.toLowerCase().includes(calcSearch.toLowerCase()) || p.code.includes(calcSearch))
    : products

  function addCalcRow(p: any) {
    if (calcRows.some((r) => r.productId === p.id)) { setCalcSearch(''); setCalcShowList(false); return }
    setCalcRows((prev) => [...prev, { productId: p.id, productName: p.name, qty: '' }])
    setCalcSearch(''); setCalcShowList(false)
  }

  function updateCalcQty(productId: string, qty: string) {
    setCalcRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, qty } : r)))
  }

  function removeCalcRow(productId: string) {
    setCalcRows((prev) => prev.filter((r) => r.productId !== productId))
  }

  function clearCalc() {
    if (calcRows.length > 0 && !confirm('¿Vaciar la calculadora?')) return
    setCalcRows([])
  }

  // Total de materiales necesarios según las cantidades cargadas
  const materialTotals: Record<string, { nombre: string; unidad: string; total: number }> = {}
  calcRows.forEach((row) => {
    const qty = parseFloat(row.qty || '0')
    if (!qty) return
    const rows = allProductMaterials.filter((pm) => pm.product_id === row.productId)
    rows.forEach((pm) => {
      const key = pm.material_id
      if (!materialTotals[key]) {
        materialTotals[key] = { nombre: pm.materiales?.nombre || 'Material', unidad: pm.materiales?.unidad_medida || 'u.', total: 0 }
      }
      materialTotals[key].total += qty * pm.cantidad_por_unidad
    })
  })
  const materialTotalsSorted = Object.values(materialTotals).sort((a, b) => a.nombre.localeCompare(b.nombre))

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Materia Prima</h1>
      <p className="text-sm text-slate-500 mb-6">Composición por producto, y calculadora de necesidad para compras.</p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — no tenés permisos para editar la composición.
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          ['calculadora', 'Calculadora de compras'],
          ['composicion', 'Composición por producto'],
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

      {/* ===================== CALCULADORA ===================== */}
      {tab === 'calculadora' && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700">Productos a producir</h2>
              {calcRows.length > 0 && (
                <button onClick={clearCalc} className="text-xs text-rose-500 hover:underline">Vaciar todo</button>
              )}
            </div>

            <div className="relative min-w-0 mb-3">
              <input
                placeholder="Buscar producto para agregar..."
                value={calcSearch}
                onChange={(e) => { setCalcSearch(e.target.value); setCalcShowList(true) }}
                onFocus={() => setCalcShowList(true)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm w-full"
              />
              {calcShowList && calcSearch.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                  {filteredCalcProducts.length === 0 ? (
                    <div className="p-2 text-xs text-slate-400">Sin resultados</div>
                  ) : filteredCalcProducts.map((p) => (
                    <div key={p.id} onClick={() => addCalcRow(p)} className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer">
                      <span className="text-xs text-slate-400 mr-2">{p.code}</span>{p.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {calcRows.length === 0 ? (
              <p className="text-sm text-slate-400">Buscá y agregá los productos que querés calcular, con la cantidad a producir de cada uno.</p>
            ) : (
              <div className="space-y-2">
                {calcRows.map((row) => {
                  const hasComposicion = allProductMaterials.some((pm) => pm.product_id === row.productId)
                  return (
                    <div key={row.productId} className="flex items-center gap-2 bg-slate-50 rounded-md px-3 py-2">
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{row.productName}</span>
                      {!hasComposicion && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">sin composición cargada</span>
                      )}
                      <input
                        type="number" placeholder="Cantidad"
                        value={row.qty}
                        onChange={(e) => updateCalcQty(row.productId, e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-28 shrink-0"
                      />
                      <button onClick={() => removeCalcRow(row.productId)} className="text-xs text-rose-500 hover:underline shrink-0">Quitar</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <h2 className="font-semibold text-slate-700 mb-3">Materia prima necesaria</h2>
          {materialTotalsSorted.length === 0 ? (
            <p className="text-slate-400 text-sm">Cargá productos y cantidades arriba para ver el total.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">Material</th>
                    <th className="p-3 font-medium text-right">Cantidad necesaria</th>
                  </tr>
                </thead>
                <tbody>
                  {materialTotalsSorted.map((m) => (
                    <tr key={m.nombre} className="border-t border-slate-100">
                      <td className="p-3 text-slate-700 font-medium">{m.nombre}</td>
                      <td className="p-3 text-right text-slate-700">{Math.round(m.total * 100) / 100} {m.unidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== COMPOSICIÓN ===================== */}
      {tab === 'composicion' && (
        <>
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
              <h2 className="font-semibold text-slate-700 text-sm mb-2">Materiales (catálogo general)</h2>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {materiales.map((m) => (
                  <span key={m.id} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{m.nombre} ({m.unidad_medida})</span>
                ))}
              </div>
              <div className="flex gap-2">
                <input placeholder="Nombre del material" value={newMatName} onChange={(e) => setNewMatName(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm flex-1 min-w-0" />
                <input placeholder="Unidad (kg, m, u.)" value={newMatUnidad} onChange={(e) => setNewMatUnidad(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-32" />
                <button onClick={addMaterialGlobal} className="text-xs bg-slate-700 text-white px-3 rounded-md hover:bg-slate-800 shrink-0">
                  + Agregar
                </button>
              </div>
            </div>
          )}

          {!selectedProduct ? (
            <>
              <input
                placeholder="Buscar producto por nombre o código..."
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm w-full sm:w-80 mb-4"
              />
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-left">
                      <th className="p-3 font-medium">Producto</th>
                      <th className="p-3 font-medium text-center">Materiales cargados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompProducts.map((p) => {
                      const count = allProductMaterials.filter((pm) => pm.product_id === p.id).length
                      return (
                        <tr key={p.id} onClick={() => selectProductForComp(p)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                          <td className="p-3 text-slate-700">
                            <span className="text-xs text-slate-400 mr-2">{p.code}</span>{p.name}
                          </td>
                          <td className="p-3 text-center text-slate-500">{count > 0 ? `${count} material(es)` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <button onClick={() => setSelectedProduct(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700 mb-3">
                ← Volver al listado
              </button>
              <h2 className="font-semibold text-slate-700 mb-4">{selectedProduct.name}</h2>

              {productMaterials.length === 0 ? (
                <p className="text-sm text-slate-400 mb-4">Todavía no tiene materiales cargados.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {productMaterials.map((pm) => (
                    <div key={pm.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-md px-3 py-2 flex-wrap">
                      <span className="text-sm text-slate-700 flex-1 min-w-[120px]">{pm.materiales?.nombre}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          defaultValue={pm.cantidad_por_unidad}
                          onBlur={(e) => saveProductMaterialQty(pm.id, parseFloat(e.target.value || '0'))}
                          disabled={!canEdit}
                          className="w-20 text-center rounded-md border border-slate-300 py-1 text-sm disabled:bg-slate-100"
                        />
                        <span className="text-xs text-slate-400">{pm.materiales?.unidad_medida} / u.</span>
                      </div>
                      <select
                        defaultValue={pm.sector_id || ''}
                        onChange={(e) => saveProductMaterialSector(pm.id, e.target.value)}
                        disabled={!canEdit}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs disabled:bg-slate-100"
                      >
                        <option value="">Sector de consumo...</option>
                        {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {canEdit && (
                        <button onClick={() => removeProductMaterial(pm.id)} className="text-xs text-rose-500 hover:underline">Quitar</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-xs font-medium text-slate-600 mb-2">Agregar material a este producto</p>
                  <div className="flex gap-2 flex-wrap">
                    <select value={addMatId} onChange={(e) => setAddMatId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm flex-1 min-w-[160px]">
                      <option value="">Elegí un material...</option>
                      {materiales.filter((m) => !productMaterials.some((pm) => pm.material_id === m.id)).map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre} ({m.unidad_medida})</option>
                      ))}
                    </select>
                    <input placeholder="Cant./u." type="number" value={addMatQty} onChange={(e) => setAddMatQty(e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-24" />
                    <select value={addMatSector} onChange={(e) => setAddMatSector(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                      <option value="">Sector (opcional)...</option>
                      {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={addMaterialToProduct} className="text-xs bg-emerald-600 text-white px-3 rounded-md hover:bg-emerald-700 shrink-0">
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}