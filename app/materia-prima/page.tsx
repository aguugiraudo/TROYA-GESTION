'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tab = 'stock' | 'inventario' | 'calculadora' | 'composicion'

function formatStock(baseQty: number, material: any) {
  const pres = Number(material.presentacion || 1)
  if (pres > 1) {
    const enPresentacion = baseQty / pres
    return `${Math.round(enPresentacion * 100) / 100} u. (${Math.round(baseQty * 100) / 100} ${material.unidad_medida})`
  }
  return `${Math.round(baseQty * 100) / 100} ${material.unidad_medida}`
}

function toggleSort(current: string, dir: 1 | -1, col: string, setBy: (v: any) => void, setDir: (v: 1 | -1) => void) {
  if (current === col) setDir(dir === 1 ? -1 : 1)
  else { setBy(col); setDir(1) }
}

export default function MateriaPrimaPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'
  const [tab, setTab] = useState<Tab>('stock')

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
  const [newMatStockMinimo, setNewMatStockMinimo] = useState('0')
  const [newMatPresentacion, setNewMatPresentacion] = useState('1')
  const [newMatUbicacion, setNewMatUbicacion] = useState('')
  const [addMatId, setAddMatId] = useState('')
  const [addMatQty, setAddMatQty] = useState('')
  const [addMatSector, setAddMatSector] = useState('')

  // --- Calculadora ---
  const [calcSearch, setCalcSearch] = useState('')
  const [calcShowList, setCalcShowList] = useState(false)
  const [calcRows, setCalcRows] = useState<{ productId: string; productName: string; qty: string }[]>([])
  const [allProductMaterials, setAllProductMaterials] = useState<any[]>([])
  const [stockSortBy, setStockSortBy] = useState<'codigo' | 'nombre' | 'proveedor_nombre' | 'stock' | 'stock_minimo'>('nombre')
  const [stockSortDir, setStockSortDir] = useState<1 | -1>(1)
  const [calcGroupByProveedor, setCalcGroupByProveedor] = useState(true)
  const [calcSortBy, setCalcSortBy] = useState<'nombre' | 'codigo' | 'proveedor'>('proveedor')

  // --- Stock ---
  const [stockByMaterial, setStockByMaterial] = useState<Record<string, number>>({})
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [showNewMaterial, setShowNewMaterial] = useState(false)
  const [editingPresentacion, setEditingPresentacion] = useState<string | null>(null)
  const [editingUbicacion, setEditingUbicacion] = useState<string | null>(null)

  // --- Inventario físico ---
  const [invUbicacionFilter, setInvUbicacionFilter] = useState('')
  const [invCounts, setInvCounts] = useState<Record<string, string>>({})
  const [invSavedDiffs, setInvSavedDiffs] = useState<Record<string, number>>({})
  const [ingSearch, setIngSearch] = useState('')
  const [ingShowList, setIngShowList] = useState(false)
  const [ingMaterial, setIngMaterial] = useState<any | null>(null)
  const [ingCantidad, setIngCantidad] = useState('')
  const [ingFecha, setIngFecha] = useState(new Date().toISOString().split('T')[0])
  const [ingNotes, setIngNotes] = useState('')

  async function fetchAll() {
    setLoading(true)
    const { data: productsData } = await supabase.from('products').select('id, code, name').order('name')
    setProducts(productsData || [])
    const { data: matData } = await supabase.from('materiales').select('*').order('nombre')
    setMateriales(matData || [])
    const { data: sectorsData } = await supabase.from('sectors').select('*').order('sequence_no')
    setSectors(sectorsData || [])
    const { data: pmData } = await supabase.from('producto_materiales').select('*, materiales(nombre, unidad_medida, codigo, proveedor_nombre, presentacion), sectors(name)')
    setAllProductMaterials(pmData || [])

    const { data: stockData } = await supabase.from('material_stock').select('*')
    const stockMap: Record<string, number> = {}
    ;(stockData || []).forEach((r: any) => { stockMap[r.material_id] = Number(r.stock_actual) })
    setStockByMaterial(stockMap)

    const { data: movData } = await supabase
      .from('material_movimientos')
      .select('*, materiales(nombre, unidad_medida)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
    setMovimientos(movData || [])

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
    const presentacion = parseFloat(newMatPresentacion || '1') || 1
    const stockMinimoBase = parseFloat(newMatStockMinimo || '0') * presentacion
    const { error } = await supabase.from('materiales').insert({
      nombre: newMatName.trim(), unidad_medida: newMatUnidad.trim() || 'u.',
      presentacion, stock_minimo: stockMinimoBase, ubicacion: newMatUbicacion.trim() || null,
    })
    if (error) { alert('Error al crear el material: ' + error.message); return }
    setNewMatName(''); setNewMatUnidad('u.'); setNewMatStockMinimo('0'); setNewMatPresentacion('1'); setNewMatUbicacion('')
    setShowNewMaterial(false)
    fetchAll()
  }

  function pickIngMaterial(m: any) {
    setIngMaterial(m); setIngSearch(m.nombre); setIngShowList(false)
  }

  function resetIngresoForm() {
    setIngSearch(''); setIngMaterial(null); setIngCantidad(''); setIngFecha(new Date().toISOString().split('T')[0]); setIngNotes('')
  }

  async function registrarIngresoMaterial() {
    if (!ingMaterial) { alert('Elegí un material.'); return }
    const cantidadInput = parseFloat(ingCantidad || '0')
    if (!cantidadInput || cantidadInput <= 0) { alert('Ingresá una cantidad válida.'); return }
    const presentacion = Number(ingMaterial.presentacion || 1)
    const cantidadBase = presentacion > 1 ? cantidadInput * presentacion : cantidadInput
    const { error } = await supabase.from('material_movimientos').insert({
      material_id: ingMaterial.id, tipo: 'ingreso', cantidad: cantidadBase, origen: 'manual', fecha: ingFecha, notes: ingNotes || null,
    })
    if (error) { alert('Error al registrar el ingreso: ' + error.message); return }
    resetIngresoForm()
    fetchAll()
  }

  async function deleteMovimiento(id: string) {
    if (!confirm('¿Eliminar este movimiento? El stock se recalcula solo.')) return
    await supabase.from('material_movimientos').delete().eq('id', id)
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

  async function saveMaterialPresentacion(m: any, newPresentacionValue: string) {
    const nuevaPresentacion = parseFloat(newPresentacionValue || '1') || 1
    const presentacionAnterior = Number(m.presentacion || 1)
    // Recalculamos el stock mínimo para que la cantidad de "chapas" mínimas configuradas no cambie
    const stockMinimoEnChapas = presentacionAnterior > 0 ? m.stock_minimo / presentacionAnterior : m.stock_minimo
    const nuevoStockMinimoBase = stockMinimoEnChapas * nuevaPresentacion
    const { error } = await supabase.from('materiales').update({
      presentacion: nuevaPresentacion, stock_minimo: nuevoStockMinimoBase,
    }).eq('id', m.id)
    if (error) { alert('Error al actualizar la presentación: ' + error.message); return }
    setEditingPresentacion(null)
    fetchAll()
  }

  async function saveMaterialUbicacion(id: string, value: string) {
    await supabase.from('materiales').update({ ubicacion: value.trim() || null }).eq('id', id)
    setEditingUbicacion(null)
    fetchAll()
  }

  function updateInvCount(materialId: string, value: string) {
    setInvCounts((prev) => ({ ...prev, [materialId]: value }))
  }

  // Guarda el ajuste de UN material: calcula la diferencia contra el stock teórico y genera
  // el movimiento correspondiente (ingreso si contó de más, egreso si contó de menos)
  async function saveInventoryAdjustment(m: any) {
    const contadoInput = invCounts[m.id]
    if (contadoInput === undefined || contadoInput === '') return
    const pres = Number(m.presentacion || 1)
    const contadoBase = parseFloat(contadoInput) * pres
    const stockTeorico = stockByMaterial[m.id] || 0
    const diferencia = contadoBase - stockTeorico
    if (diferencia !== 0) {
      await supabase.from('material_movimientos').insert({
        material_id: m.id,
        tipo: diferencia > 0 ? 'ingreso' : 'egreso',
        cantidad: Math.abs(diferencia),
        origen: 'ajuste_inventario',
        notes: `Inventario físico: contado ${contadoInput} u. (${Math.round(contadoBase * 100) / 100} ${m.unidad_medida}), teórico ${Math.round((stockTeorico / (pres > 1 ? pres : 1)) * 100) / 100} u.`,
      })
    }
    setInvSavedDiffs((prev) => ({ ...prev, [m.id]: diferencia }))
    fetchAll()
  }

  async function saveAllInventoryAdjustments() {
    const toSave = materialesFiltradosInventario.filter((m) => invCounts[m.id] !== undefined && invCounts[m.id] !== '')
    if (toSave.length === 0) { alert('No cargaste ningún conteo todavía.'); return }
    if (!confirm(`¿Guardar el ajuste de ${toSave.length} material(es)?`)) return
    for (const m of toSave) {
      await saveInventoryAdjustment(m)
    }
  }

  function exportInventarioToExcel() {
    const header = ['Código', 'Material', 'Ubicación', 'Proveedor', 'Stock teórico (u.)', 'Contado (u.)', 'Diferencia (u.)']
    const rows = materialesFiltradosInventario.map((m) => {
      const pres = Number(m.presentacion || 1)
      const stockTeorico = stockByMaterial[m.id] || 0
      const stockTeoricoPres = pres > 1 ? stockTeorico / pres : stockTeorico
      const contado = invCounts[m.id] !== undefined && invCounts[m.id] !== '' ? parseFloat(invCounts[m.id]) : ''
      const diferencia = contado !== '' ? Math.round((Number(contado) - stockTeoricoPres) * 100) / 100 : ''
      return [m.codigo || '', m.nombre, m.ubicacion || '', m.proveedor_nombre || '', Math.round(stockTeoricoPres * 100) / 100, contado, diferencia]
    })
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventario_materia_prima_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportStockToExcel() {
    const header = ['Código', 'Material', 'Proveedor', 'Unidad base', 'Presentación', 'Stock actual (u. presentación)', 'Stock actual (unidad base)', 'Stock mínimo (u. presentación)', 'Estado']
    const rows = materiales.map((m) => {
      const stock = stockByMaterial[m.id] || 0
      const pres = Number(m.presentacion || 1)
      const bajo = stock < m.stock_minimo
      return [
        m.codigo || '', m.nombre, m.proveedor_nombre || '', m.unidad_medida, pres,
        pres > 1 ? Math.round((stock / pres) * 100) / 100 : Math.round(stock * 100) / 100,
        Math.round(stock * 100) / 100,
        pres > 1 ? Math.round((m.stock_minimo / pres) * 100) / 100 : m.stock_minimo,
        bajo ? 'STOCK BAJO' : 'OK',
      ]
    })
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock_materia_prima_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
  const materialTotals: Record<string, { nombre: string; codigo: string; proveedor: string; unidad: string; presentacion: number; total: number }> = {}
  calcRows.forEach((row) => {
    const qty = parseFloat(row.qty || '0')
    if (!qty) return
    const rows = allProductMaterials.filter((pm) => pm.product_id === row.productId)
    rows.forEach((pm) => {
      const key = pm.material_id
      if (!materialTotals[key]) {
        materialTotals[key] = {
          nombre: pm.materiales?.nombre || 'Material',
          codigo: pm.materiales?.codigo || '',
          proveedor: pm.materiales?.proveedor_nombre || 'Sin proveedor',
          unidad: pm.materiales?.unidad_medida || 'u.',
          presentacion: Number(pm.materiales?.presentacion || 1),
          total: 0,
        }
      }
      materialTotals[key].total += qty * pm.cantidad_por_unidad
    })
  })
  const materialTotalsList = Object.values(materialTotals)

  // --- Inventario ---
  const ubicacionesDisponibles = Array.from(new Set(materiales.map((m) => m.ubicacion).filter(Boolean))).sort()
  const materialesFiltradosInventario = invUbicacionFilter
    ? materiales.filter((m) => m.ubicacion === invUbicacionFilter)
    : materiales

  function sortMaterials(list: typeof materialTotalsList) {
    return [...list].sort((a, b) => {
      if (calcSortBy === 'codigo') return a.codigo.localeCompare(b.codigo)
      if (calcSortBy === 'proveedor') return a.proveedor.localeCompare(b.proveedor)
      return a.nombre.localeCompare(b.nombre)
    })
  }

  const materialTotalsSorted = sortMaterials(materialTotalsList)

  const materialsByProveedor: Record<string, typeof materialTotalsList> = {}
  materialTotalsList.forEach((m) => {
    if (!materialsByProveedor[m.proveedor]) materialsByProveedor[m.proveedor] = []
    materialsByProveedor[m.proveedor].push(m)
  })
  const proveedoresSorted = Object.keys(materialsByProveedor).sort((a, b) => a.localeCompare(b))

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
          ['stock', 'Stock'],
          ['inventario', 'Inventario'],
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

      {/* ===================== STOCK ===================== */}
      {tab === 'stock' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Materiales</h2>
            <div className="flex items-center gap-2">
              {materiales.length > 0 && (
                <button onClick={exportStockToExcel} className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-50">
                  ⬇ Exportar a Excel
                </button>
              )}
              {canEdit && (
                <button onClick={() => setShowNewMaterial(true)} className="text-xs bg-slate-700 text-white px-3 py-1.5 rounded-md hover:bg-slate-800">
                  + Nuevo material
                </button>
              )}
            </div>
          </div>

          {materiales.length === 0 ? (
            <p className="text-slate-400 text-sm mb-8">Todavía no cargaste ningún material.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white mb-8">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    {([
                      ['codigo', 'Código'],
                      ['nombre', 'Material'],
                      ['proveedor_nombre', 'Proveedor'],
                    ] as [string, string][]).map(([key, label]) => (
                      <th key={key} onClick={() => toggleSort(stockSortBy, stockSortDir, key, setStockSortBy, setStockSortDir)}
                        className="p-1.5 font-medium cursor-pointer select-none hover:bg-slate-800 whitespace-nowrap">
                        {label} {stockSortBy === key ? (stockSortDir === 1 ? '▲' : '▼') : ''}
                      </th>
                    ))}
                    <th onClick={() => toggleSort(stockSortBy, stockSortDir, 'stock', setStockSortBy, setStockSortDir)}
                      className="p-1.5 font-medium text-center cursor-pointer select-none hover:bg-slate-800 whitespace-nowrap">
                      Stock actual {stockSortBy === 'stock' ? (stockSortDir === 1 ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => toggleSort(stockSortBy, stockSortDir, 'stock_minimo', setStockSortBy, setStockSortDir)}
                      className="p-1.5 font-medium text-center cursor-pointer select-none hover:bg-slate-800 whitespace-nowrap">
                      Stock mínimo {stockSortBy === 'stock_minimo' ? (stockSortDir === 1 ? '▲' : '▼') : ''}
                    </th>
                    <th className="p-1.5 font-medium text-center whitespace-nowrap">Presentación</th>
                    <th className="p-1.5 font-medium text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {[...materiales].sort((a, b) => {
                    let av: any, bv: any
                    if (stockSortBy === 'stock') { av = stockByMaterial[a.id] || 0; bv = stockByMaterial[b.id] || 0 }
                    else if (stockSortBy === 'stock_minimo') { av = a.stock_minimo; bv = b.stock_minimo }
                    else { av = (a[stockSortBy] || '').toString().toLowerCase(); bv = (b[stockSortBy] || '').toString().toLowerCase() }
                    if (av < bv) return -1 * stockSortDir
                    if (av > bv) return 1 * stockSortDir
                    return 0
                  }).map((m) => {
                    const stock = stockByMaterial[m.id] || 0
                    const bajo = stock < m.stock_minimo
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="p-1.5 text-slate-400">{m.codigo || '—'}</td>
                        <td className="p-1.5 text-slate-700 font-medium">{m.nombre}</td>
                        <td className="p-1.5 text-slate-500">{m.proveedor_nombre || '—'}</td>
                        <td className="p-1.5 text-center text-slate-600 whitespace-nowrap">{formatStock(stock, m)}</td>
                        <td className="p-1.5 text-center text-slate-400 whitespace-nowrap">{formatStock(m.stock_minimo, m)}</td>
                        <td className="p-1.5 text-center whitespace-nowrap">
                          {canEdit && editingPresentacion === m.id ? (
                            <input
                              type="number" autoFocus defaultValue={m.presentacion || 1}
                              onBlur={(e) => saveMaterialPresentacion(m, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              className="w-16 text-center rounded-md border border-blue-300 py-0.5 text-xs"
                            />
                          ) : (
                            <button
                              onClick={() => canEdit && setEditingPresentacion(m.id)}
                              disabled={!canEdit}
                              title={canEdit ? 'Click para editar' : undefined}
                              className={canEdit ? 'hover:underline decoration-dotted' : ''}
                            >
                              {m.presentacion || 1} {m.unidad_medida}
                            </button>
                          )}
                        </td>
                        <td className="p-1.5 text-center">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            bajo ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {bajo ? '⚠ Bajo' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
              <h2 className="font-semibold text-slate-700 mb-3">Registrar ingreso (compra)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="relative min-w-0">
                  <label className="text-xs text-slate-500">Material</label>
                  <input
                    placeholder="Buscar material..."
                    value={ingSearch}
                    onChange={(e) => { setIngSearch(e.target.value); setIngMaterial(null); setIngShowList(true) }}
                    onFocus={() => setIngShowList(true)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1"
                  />
                  {ingShowList && !ingMaterial && ingSearch.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                      {materiales.filter((m) => m.nombre.toLowerCase().includes(ingSearch.toLowerCase())).map((m) => (
                        <div key={m.id} onClick={() => pickIngMaterial(m)} className="px-3 py-1.5 text-sm hover:bg-slate-100 cursor-pointer">
                          {m.nombre} ({m.unidad_medida})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500">
                    Cantidad {ingMaterial ? (Number(ingMaterial.presentacion || 1) > 1
                      ? `(en unidades de presentación — 1 = ${ingMaterial.presentacion} ${ingMaterial.unidad_medida})`
                      : `(${ingMaterial.unidad_medida})`) : ''}
                  </label>
                  <input type="number" value={ingCantidad} onChange={(e) => setIngCantidad(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-500">Fecha</label>
                  <input type="date" value={ingFecha} onChange={(e) => setIngFecha(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Notas (opcional)</label>
                  <input placeholder="Ej: compra proveedor X" value={ingNotes} onChange={(e) => setIngNotes(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
                </div>
              </div>
              <button onClick={registrarIngresoMaterial} className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700">
                Registrar ingreso
              </button>
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
                    <th className="p-3 font-medium">Material</th>
                    <th className="p-3 font-medium text-center">Tipo</th>
                    <th className="p-3 font-medium text-center">Cantidad</th>
                    <th className="p-3 font-medium">Origen</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m: any) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="p-3 text-slate-500">{m.fecha.split('-').reverse().join('/')}</td>
                      <td className="p-3 text-slate-700">{m.materiales?.nombre}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          m.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-medium text-slate-700">
                        {m.tipo === 'ingreso' ? '+' : '-'}{Math.round(m.cantidad * 100) / 100} {m.materiales?.unidad_medida}
                      </td>
                      <td className="p-3 text-slate-500 text-xs">
                        {m.origen === 'consumo_automatico' ? '🤖 Automático (producción)' : m.origen === 'ajuste_inventario' ? '📋 Ajuste inventario' : '✍️ Manual'}
                        {m.notes && <span className="italic"> — "{m.notes}"</span>}
                      </td>
                      <td className="p-3 text-right">
                        {canEdit && m.origen === 'manual' && (
                          <button onClick={() => deleteMovimiento(m.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
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

      {/* ===================== INVENTARIO ===================== */}
      {tab === 'inventario' && (
        <>
          <p className="text-xs text-slate-400 mb-4">
            Contá materiales de a una ubicación por vez: filtrá por dónde están parados físicamente, tipeá lo que contaste
            (en unidades de presentación, ej. chapas) y guardá — la diferencia contra el stock teórico queda registrada como ajuste.
          </p>

          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <select value={invUbicacionFilter} onChange={(e) => setInvUbicacionFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Todas las ubicaciones</option>
              {ubicacionesDisponibles.map((u) => <option key={u} value={u}>{u}</option>)}
              <option value="__sin__">(Sin ubicación asignada)</option>
            </select>
            <div className="flex items-center gap-2">
              <button onClick={exportInventarioToExcel} className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-50">
                ⬇ Exportar a Excel
              </button>
              {canEdit && (
                <button onClick={saveAllInventoryAdjustments} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700">
                  Guardar todos los conteos
                </button>
              )}
            </div>
          </div>

          {materialesFiltradosInventario.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay materiales para esta ubicación.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-1.5 font-medium">Código</th>
                    <th className="p-1.5 font-medium">Material</th>
                    <th className="p-1.5 font-medium">Ubicación</th>
                    <th className="p-1.5 font-medium text-center">Stock teórico</th>
                    <th className="p-1.5 font-medium text-center">Contado</th>
                    <th className="p-1.5 font-medium text-center">Diferencia</th>
                    <th className="p-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {(invUbicacionFilter === '__sin__'
                    ? materiales.filter((m) => !m.ubicacion)
                    : materialesFiltradosInventario
                  ).map((m) => {
                    const pres = Number(m.presentacion || 1)
                    const stockTeorico = stockByMaterial[m.id] || 0
                    const stockTeoricoPres = pres > 1 ? stockTeorico / pres : stockTeorico
                    const contadoInput = invCounts[m.id] ?? ''
                    const contadoNum = contadoInput !== '' ? parseFloat(contadoInput) : null
                    const diferencia = contadoNum != null ? Math.round((contadoNum - stockTeoricoPres) * 100) / 100 : null
                    const yaGuardado = invSavedDiffs[m.id] !== undefined
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="p-1.5 text-slate-400">{m.codigo || '—'}</td>
                        <td className="p-1.5 text-slate-700 font-medium">{m.nombre}</td>
                        <td className="p-1.5">
                          {canEdit && editingUbicacion === m.id ? (
                            <input
                              autoFocus defaultValue={m.ubicacion || ''}
                              placeholder="Ej: Estantería chapa"
                              onBlur={(e) => saveMaterialUbicacion(m.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              className="w-32 rounded-md border border-blue-300 py-0.5 px-1 text-xs"
                            />
                          ) : (
                            <button
                              onClick={() => canEdit && setEditingUbicacion(m.id)}
                              disabled={!canEdit}
                              className={`text-slate-500 ${canEdit ? 'hover:underline decoration-dotted' : ''}`}
                            >
                              {m.ubicacion || (canEdit ? '+ asignar' : '—')}
                            </button>
                          )}
                        </td>
                        <td className="p-1.5 text-center text-slate-500">{Math.round(stockTeoricoPres * 100) / 100} u.</td>
                        <td className="p-1.5 text-center">
                          <input
                            type="number" value={contadoInput}
                            onChange={(e) => updateInvCount(m.id, e.target.value)}
                            disabled={!canEdit}
                            placeholder="—"
                            className="w-16 text-center rounded-md border border-slate-300 py-0.5 disabled:bg-slate-50"
                          />
                        </td>
                        <td className={`p-1.5 text-center font-semibold ${
                          diferencia == null ? 'text-slate-300' : diferencia === 0 ? 'text-emerald-600' : diferencia > 0 ? 'text-blue-600' : 'text-rose-600'
                        }`}>
                          {diferencia != null ? (diferencia > 0 ? `+${diferencia}` : diferencia) : '—'}
                        </td>
                        <td className="p-1.5 text-right">
                          {canEdit && contadoInput !== '' && (
                            <button onClick={() => saveInventoryAdjustment(m)} className="text-xs text-blue-600 hover:underline">
                              {yaGuardado ? 'Reguardar' : 'Guardar'}
                            </button>
                          )}
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

          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-700">Materia prima necesaria</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={calcGroupByProveedor} onChange={(e) => setCalcGroupByProveedor(e.target.checked)} className="w-4 h-4 accent-slate-700" />
                Agrupar por proveedor
              </label>
              <select value={calcSortBy} onChange={(e) => setCalcSortBy(e.target.value as any)} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
                <option value="proveedor">Ordenar por proveedor</option>
                <option value="codigo">Ordenar por código</option>
                <option value="nombre">Ordenar por nombre (A-Z)</option>
              </select>
            </div>
          </div>
          {materialTotalsSorted.length === 0 ? (
            <p className="text-slate-400 text-sm">Cargá productos y cantidades arriba para ver el total.</p>
          ) : calcGroupByProveedor ? (
            <div className="space-y-4">
              {proveedoresSorted.map((prov) => (
                <div key={prov} className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                  <p className="px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-200">{prov}</p>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-slate-400 text-xs">
                        <th className="p-3 font-medium">Código</th>
                        <th className="p-3 font-medium">Material</th>
                        <th className="p-3 font-medium text-right">Necesario</th>
                        <th className="p-3 font-medium text-right">A comprar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortMaterials(materialsByProveedor[prov]).map((m) => (
                        <tr key={m.nombre + m.codigo} className="border-t border-slate-100">
                          <td className="p-3 text-slate-400 text-xs">{m.codigo || '—'}</td>
                          <td className="p-3 text-slate-700 font-medium">{m.nombre}</td>
                          <td className="p-3 text-right text-slate-500">{Math.round(m.total * 100) / 100} {m.unidad}</td>
                          <td className="p-3 text-right text-slate-700 font-semibold">
                            {m.presentacion > 1 ? `${Math.ceil(m.total / m.presentacion)} u.` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">Código</th>
                    <th className="p-3 font-medium">Material</th>
                    <th className="p-3 font-medium">Proveedor</th>
                    <th className="p-3 font-medium text-right">Necesario</th>
                    <th className="p-3 font-medium text-right">A comprar</th>
                  </tr>
                </thead>
                <tbody>
                  {materialTotalsSorted.map((m) => (
                    <tr key={m.nombre + m.codigo} className="border-t border-slate-100">
                      <td className="p-3 text-slate-400 text-xs">{m.codigo || '—'}</td>
                      <td className="p-3 text-slate-700 font-medium">{m.nombre}</td>
                      <td className="p-3 text-slate-500 text-xs">{m.proveedor}</td>
                      <td className="p-3 text-right text-slate-500">{Math.round(m.total * 100) / 100} {m.unidad}</td>
                      <td className="p-3 text-right text-slate-700 font-semibold">
                        {m.presentacion > 1 ? `${Math.ceil(m.total / m.presentacion)} u.` : '—'}
                      </td>
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

      {showNewMaterial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewMaterial(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-4">Nuevo material</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Nombre</label>
                <input value={newMatName} onChange={(e) => setNewMatName(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Unidad</label>
                  <input placeholder="kg, m2, mm, u." value={newMatUnidad} onChange={(e) => setNewMatUnidad(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Presentación (ej: chapa=4.5 m2)</label>
                  <input type="number" value={newMatPresentacion} onChange={(e) => setNewMatPresentacion(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Stock mínimo (en unidades de presentación, ej: chapas)</label>
                <input type="number" value={newMatStockMinimo} onChange={(e) => setNewMatStockMinimo(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ubicación física (opcional, para el inventario)</label>
                <input placeholder="Ej: Estantería de chapa" value={newMatUbicacion} onChange={(e) => setNewMatUbicacion(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNewMaterial(false)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={addMaterialGlobal} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
