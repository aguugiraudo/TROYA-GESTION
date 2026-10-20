'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Estado = 'pendiente' | 'completo' | 'anulado'
type Vista = 'pendientes' | 'completos' | 'anulados' | 'todos'

const SUCURSALES: { value: string; label: string }[] = [
  { value: 'CTROD', label: 'Buenos Aires (CTROD)' },
  { value: '2828', label: 'Rafaela (2828)' },
]

function sucursalLabel(v: string) {
  return SUCURSALES.find((s) => s.value === v)?.label || v
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function shortDate(iso: string | null) {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

function num(n: number) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

// Celda que se edita con un click (texto, número, fecha o lista)
function EditCell({
  value, type = 'text', canEdit, onSave, display, options, align, placeholder,
}: {
  value: string
  type?: 'text' | 'number' | 'date' | 'select'
  canEdit: boolean
  onSave: (v: string) => void
  display?: ReactNode
  options?: { value: string; label: string }[]
  align?: 'right'
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => { setV(value) }, [value])

  const shown = display !== undefined ? display : (value || <span className="text-slate-300">{placeholder || '—'}</span>)

  if (!canEdit) return <span>{shown}</span>
  if (!editing) {
    return (
      <span
        onClick={() => { cancelled.current = false; setEditing(true) }}
        title="Click para editar"
        className="cursor-pointer hover:underline decoration-dotted decoration-slate-400"
      >
        {shown}
      </span>
    )
  }

  function finish() {
    setEditing(false)
    if (cancelled.current) { setV(value); return }
    if (v !== value) onSave(v)
  }

  if (type === 'select') {
    return (
      <select
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={finish}
        className="border border-slate-300 rounded px-1 py-0.5 text-xs max-w-[220px]"
      >
        {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return (
    <input
      autoFocus
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur() }
      }}
      className={`border border-slate-300 rounded px-1 py-0.5 text-xs w-full min-w-[70px] ${align === 'right' ? 'text-right' : ''}`}
    />
  )
}

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Buscador de producto: se va escribiendo y filtra por cualquier palabra del código o del nombre
function ProductPicker({
  products, value, onPick, onClose, autoFocus, allowEmpty,
}: {
  products: { id: string; code: string; name: string }[]
  value: string
  onPick: (id: string) => void
  onClose?: () => void
  autoFocus?: boolean
  allowEmpty?: boolean
}) {
  const selected = products.find((p) => p.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(!!autoFocus)

  const palabras = normalizar(query).split(/\s+/).filter(Boolean)
  const filtrados = products
    .filter((p) => {
      const t = normalizar(p.code + ' ' + p.name)
      return palabras.every((w) => t.includes(w))
    })
    .slice(0, 40)

  function elegir(id: string) {
    setQuery(''); setOpen(false)
    onPick(id)
  }

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={open ? query : (selected ? `${selected.code} · ${selected.name}` : '')}
        placeholder="Escribí para buscar producto..."
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => { setOpen(false); setQuery(''); if (onClose) onClose() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtrados.length > 0) { e.preventDefault(); elegir(filtrados[0].id) }
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
        }}
        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto min-w-[260px]">
          {allowEmpty && (
            <div onMouseDown={(e) => { e.preventDefault(); elegir('') }} className="px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 cursor-pointer">(sin vincular)</div>
          )}
          {filtrados.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No hay coincidencias. Si el producto no existe, crealo en Catálogo de Productos.</div>}
          {filtrados.map((p) => (
            <div key={p.id} onMouseDown={(e) => { e.preventDefault(); elegir(p.id) }}
              className="px-2 py-1.5 text-sm hover:bg-blue-50 cursor-pointer">
              <span className="text-slate-400 mr-1">{p.code}</span>{p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Celda de producto en la tabla: click y se escribe para buscar
function ProductCell({
  products, value, canEdit, display, onSave,
}: {
  products: { id: string; code: string; name: string }[]
  value: string
  canEdit: boolean
  display: ReactNode
  onSave: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  if (!canEdit) return <span>{display}</span>
  if (!editing) {
    return <span onClick={() => setEditing(true)} title="Click para cambiar el producto" className="cursor-pointer hover:underline decoration-dotted decoration-slate-400">{display}</span>
  }
  return (
    <ProductPicker
      products={products} value={value} autoFocus allowEmpty
      onPick={(id) => { setEditing(false); if (id !== value) onSave(id) }}
      onClose={() => setEditing(false)}
    />
  )
}

type NewRow = { product_id: string; cantidad: string; cliente: string; personalizado: string }
const emptyRow = (): NewRow => ({ product_id: '', cantidad: '', cliente: '', personalizado: '' })

export default function PedidosPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1'

  const [lineas, setLineas] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [vista, setVista] = useState<Vista>('pendientes')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'fecha', dir: 'desc' })

  const [showNew, setShowNew] = useState(false)
  const [nFecha, setNFecha] = useState(today())
  const [nSucursal, setNSucursal] = useState('CTROD')
  const [nNro, setNNro] = useState('')
  const [nRows, setNRows] = useState<NewRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data: prods } = await supabase.from('products').select('id, code, name').order('name')
    setProducts(prods || [])

    // trae todos los renglones de a 1000 (límite de Supabase por consulta)
    let all: any[] = []
    for (let page = 0; page < 30; page++) {
      const { data, error } = await supabase
        .from('pedido_lineas').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false })
        .range(page * 1000, page * 1000 + 999)
      if (error) { alert('No se pudieron cargar los pedidos: ' + error.message); break }
      all = all.concat(data || [])
      if (!data || data.length < 1000) break
    }
    setLineas(all)
    setLoading(false)
  }

  const productsById = useMemo(() => {
    const m: Record<string, any> = {}
    products.forEach((p) => { m[p.id] = p })
    return m
  }, [products])

  function productoNombre(l: any) {
    const p = l.product_id ? productsById[l.product_id] : null
    return p ? p.name : (l.producto_texto || '(sin producto)')
  }
  function productoCodigo(l: any) {
    const p = l.product_id ? productsById[l.product_id] : null
    return p ? p.code : ''
  }
  function pendienteDe(l: any) {
    return l.estado === 'pendiente' ? Math.max(Number(l.cantidad) - Number(l.cantidad_cumplida), 0) : 0
  }

  async function updateLinea(id: string, patch: Record<string, any>) {
    const { error } = await supabase.from('pedido_lineas').update(patch).eq('id', id)
    if (error) { alert('No se pudo guardar el cambio: ' + error.message); return }
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function saveNumero(l: any, campo: 'cantidad' | 'cantidad_cumplida', v: string) {
    const n = parseFloat(v.replace(',', '.'))
    if (isNaN(n) || n < 0) { alert('Ingresá un número válido (0 o más).'); return }
    updateLinea(l.id, { [campo]: n })
  }

  function saveProducto(l: any, productId: string) {
    if (!productId) { updateLinea(l.id, { product_id: null }); return }
    const p = productsById[productId]
    updateLinea(l.id, { product_id: productId, producto_texto: p ? p.name : l.producto_texto })
  }

  function cerrar(l: any) {
    updateLinea(l.id, { estado: 'completo', cerrado_at: new Date().toISOString() })
  }
  function anular(l: any) {
    if (!confirm('¿Anular este renglón? Deja de contar como pendiente (se puede reabrir).')) return
    updateLinea(l.id, { estado: 'anulado', cerrado_at: new Date().toISOString() })
  }
  function reabrir(l: any) {
    updateLinea(l.id, { estado: 'pendiente', cerrado_at: null })
  }
  async function eliminar(l: any) {
    if (!confirm(`¿Eliminar definitivamente este renglón (pedido ${l.nro_pedido || 's/n'}, ${productoNombre(l)})? No se puede deshacer.`)) return
    const { error } = await supabase.from('pedido_lineas').delete().eq('id', l.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setLineas((prev) => prev.filter((x) => x.id !== l.id))
  }

  // ---------- Alta de pedido (varios productos uno abajo del otro) ----------
  function openNew(prefill?: any) {
    setNFecha(prefill ? prefill.fecha : today())
    setNSucursal(prefill ? prefill.sucursal : 'CTROD')
    setNNro(prefill ? (prefill.nro_pedido || '') : '')
    setNRows([{ ...emptyRow(), cliente: prefill ? (prefill.cliente || '') : '' }])
    setShowNew(true)
  }
  function updateNRow(i: number, patch: Partial<NewRow>) {
    setNRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)))
  }

  async function guardarNuevo() {
    const validas = nRows.filter((r) => r.product_id && parseFloat(r.cantidad.replace(',', '.')) > 0)
    if (validas.length === 0) { alert('Cargá al menos un producto con su cantidad.'); return }
    if (nRows.some((r) => (r.product_id && !(parseFloat(r.cantidad.replace(',', '.')) > 0)) || (!r.product_id && r.cantidad))) {
      alert('Hay renglones incompletos: cada uno necesita producto y cantidad.'); return
    }
    setSaving(true)
    const payload = validas.map((r) => ({
      fecha: nFecha, sucursal: nSucursal, nro_pedido: nNro.trim() || null, cliente: r.cliente.trim() || null,
      product_id: r.product_id, producto_texto: productsById[r.product_id]?.name || null,
      cantidad: parseFloat(r.cantidad.replace(',', '.')),
      personalizado: r.personalizado.trim() || null, observacion: null,
      estado: 'pendiente', cantidad_cumplida: 0,
    }))
    const { error } = await supabase.from('pedido_lineas').insert(payload)
    setSaving(false)
    if (error) { alert('No se pudo guardar el pedido: ' + error.message); return }
    setShowNew(false)
    cargar()
  }

  // ---------- Filtrado, orden y resúmenes ----------
  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = lineas.filter((l) => {
      if (vista === 'pendientes' && l.estado !== 'pendiente') return false
      if (vista === 'completos' && l.estado !== 'completo') return false
      if (vista === 'anulados' && l.estado !== 'anulado') return false
      if (filtroSucursal && l.sucursal !== filtroSucursal) return false
      if (q) {
        const hay = [l.nro_pedido, l.cliente, productoNombre(l), productoCodigo(l), l.personalizado]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const val = (l: any): string | number => {
      switch (sort.key) {
        case 'fecha': return l.fecha || ''
        case 'sucursal': return l.sucursal || ''
        case 'nro': return l.nro_pedido || ''
        case 'cliente': return (l.cliente || '').toLowerCase()
        case 'producto': return productoNombre(l).toLowerCase()
        case 'cantidad': return Number(l.cantidad)
        case 'cumplida': return Number(l.cantidad_cumplida)
        case 'pendiente': return pendienteDe(l)
        case 'estado': return l.estado
        default: return ''
      }
    }
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true })
      return sort.dir === 'asc' ? c : -c
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, vista, filtroSucursal, search, sort, productsById])

  const pendientes = lineas.filter((l) => l.estado === 'pendiente')
  const totalPendiente = pendientes.reduce((a, l) => a + pendienteDe(l), 0)
  const pedidosAbiertos = new Set(pendientes.filter((l) => pendienteDe(l) > 0).map((l) => l.nro_pedido || ('s/n-' + l.id))).size

  const resumen = useMemo(() => {
    const m: Record<string, { nombre: string; codigo: string; total: number; porSuc: Record<string, number>; renglones: number }> = {}
    pendientes.forEach((l) => {
      const pend = pendienteDe(l)
      if (pend <= 0) return
      const key = l.product_id || 'txt:' + (l.producto_texto || '')
      if (!m[key]) m[key] = { nombre: productoNombre(l), codigo: productoCodigo(l), total: 0, porSuc: {}, renglones: 0 }
      m[key].total += pend
      m[key].porSuc[l.sucursal] = (m[key].porSuc[l.sucursal] || 0) + pend
      m[key].renglones += 1
    })
    return Object.values(m).sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, productsById])

  async function exportar() {
    const XLSX = await import('xlsx')
    const r = (n: number) => Math.round(n * 100) / 100
    const hRes = ['Código', 'Producto', 'Pendiente total', 'Buenos Aires (CTROD)', 'Rafaela (2828)', 'Renglones']
    const bRes = resumen.map((x) => [x.codigo, x.nombre, r(x.total), r(x.porSuc['CTROD'] || 0), r(x.porSuc['2828'] || 0), x.renglones])
    bRes.push(['', 'TOTAL', r(totalPendiente), '', '', ''] as any)
    const hDet = ['Fecha', 'Sucursal', 'Nº pedido', 'Código', 'Producto', 'Cliente / Observación', 'Cantidad', 'Cumplida', 'Pendiente', 'Personalizado']
    const bDet = pendientes.filter((l) => pendienteDe(l) > 0)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map((l) => [shortDate(l.fecha), sucursalLabel(l.sucursal), l.nro_pedido || '', productoCodigo(l), productoNombre(l), l.cliente || '',
        r(Number(l.cantidad)), r(Number(l.cantidad_cumplida)), r(pendienteDe(l)), l.personalizado || ''])
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.aoa_to_sheet([hRes, ...bRes])
    ws1['!cols'] = [{ wch: 10 }, { wch: 44 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 10 }]
    const ws2 = XLSX.utils.aoa_to_sheet([hDet, ...bDet])
    ws2['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 44 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen pendientes')
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle pendientes')
    XLSX.writeFile(wb, 'pedidos_pendientes.xlsx')
  }

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'fecha' ? 'desc' : 'asc' }))
  }
  function Th({ k, children, right }: { k: string; children: ReactNode; right?: boolean }) {
    return (
      <th onClick={() => toggleSort(k)} className={`p-2 font-medium cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : ''}`}>
        {children}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  const clientesExistentes = useMemo(
    () => Array.from(new Set(lineas.map((l) => l.cliente).filter(Boolean))).sort((a: any, b: any) => String(a).localeCompare(String(b))),
    [lineas]
  )
  
  if (loading && lineas.length === 0) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Pedidos</h1>
          <p className="text-sm text-slate-500 mb-4">Pedidos de las sucursales (Rafaela y Buenos Aires). Los cerrás vos a mano, indicando cuánto cumpliste.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} className="text-xs border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50">Exportar pendientes a Excel</button>
          {canEdit && (
            <button onClick={() => openNew()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">+ Nuevo pedido</button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          Modo solo lectura — no tenés permisos para editar este módulo.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="border border-slate-200 rounded-lg p-3 bg-white"><p className="text-xs text-slate-500">Unidades pendientes</p><p className="text-xl font-semibold text-slate-800">{num(totalPendiente)}</p></div>
        <div className="border border-slate-200 rounded-lg p-3 bg-white"><p className="text-xs text-slate-500">Pedidos abiertos</p><p className="text-xl font-semibold text-slate-800">{pedidosAbiertos}</p></div>
        <div className="border border-slate-200 rounded-lg p-3 bg-white"><p className="text-xs text-slate-500">Productos con pendiente</p><p className="text-xl font-semibold text-slate-800">{resumen.length}</p></div>
      </div>

      {resumen.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumen de pendientes por producto</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-left text-xs">
                  <th className="p-2 font-medium">Producto</th>
                  <th className="p-2 font-medium text-right">Buenos Aires</th>
                  <th className="p-2 font-medium text-right">Rafaela</th>
                  <th className="p-2 font-medium text-right">Pendiente total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((x, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2 text-slate-700">{x.codigo ? <span className="text-slate-400 mr-1">{x.codigo}</span> : null}{x.nombre}</td>
                    <td className="p-2 text-right">{x.porSuc['CTROD'] ? num(x.porSuc['CTROD']) : '—'}</td>
                    <td className="p-2 text-right">{x.porSuc['2828'] ? num(x.porSuc['2828']) : '—'}</td>
                    <td className="p-2 text-right font-semibold text-slate-800">{num(x.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="p-2">TOTAL</td><td className="p-2" /><td className="p-2" />
                  <td className="p-2 text-right">{num(totalPendiente)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 border border-slate-200 rounded-lg p-0.5 bg-white">
          {([['pendientes', 'Pendientes'], ['completos', 'Completos'], ['anulados', 'Anulados'], ['todos', 'Todos']] as [Vista, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-3 py-1 text-xs rounded-md ${vista === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
          <option value="">Todas las sucursales</option>
          {SUCURSALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input placeholder="Buscar pedido, cliente, producto..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-xs w-72" />
        <span className="text-xs text-slate-400">{visibles.length} renglones</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-left text-xs">
              <Th k="fecha">Fecha</Th>
              <Th k="sucursal">Sucursal</Th>
              <Th k="nro">N.º pedido</Th>
              <Th k="producto">Producto</Th>
              <Th k="cliente">Cliente / Observación</Th>
              <Th k="cantidad" right>Cant.</Th>
              <Th k="cumplida" right>Cumplida</Th>
              <Th k="pendiente" right>Pendiente</Th>
              <th className="p-2 font-medium">Personalizado</th>
              <Th k="estado">Estado</Th>
              {canEdit && <th className="p-2 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={canEdit ? 10 : 9} className="p-6 text-center text-slate-400 text-sm">No hay renglones para mostrar.</td></tr>
            )}
            {visibles.map((l) => {
              const pend = pendienteDe(l)
              const cumplidoSinCerrar = l.estado === 'pendiente' && Number(l.cantidad_cumplida) >= Number(l.cantidad)
              return (
                <tr key={l.id} className={`border-t border-slate-100 align-top ${l.estado !== 'pendiente' ? 'text-slate-400' : ''}`}>
                  <td className="p-2 whitespace-nowrap">
                    <EditCell value={l.fecha || ''} type="date" canEdit={canEdit} display={shortDate(l.fecha)} onSave={(v) => v && updateLinea(l.id, { fecha: v })} />
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <EditCell value={l.sucursal} type="select" options={SUCURSALES} canEdit={canEdit} display={sucursalLabel(l.sucursal)} onSave={(v) => updateLinea(l.id, { sucursal: v })} />
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <EditCell value={l.nro_pedido || ''} canEdit={canEdit} onSave={(v) => updateLinea(l.id, { nro_pedido: v.trim() || null })} />
                  </td>
                  <td className="p-2 min-w-[240px]">
                    <ProductCell
                      products={products} value={l.product_id || ''} canEdit={canEdit}
                      display={<>{productoCodigo(l) ? <span className="text-slate-400 mr-1">{productoCodigo(l)}</span> : null}{productoNombre(l)}{!l.product_id ? <span className="ml-1 text-[10px] text-amber-600">sin vincular</span> : null}</>}
                      onSave={(v) => saveProducto(l, v)}
                    />
                  </td>
                  <td className="p-2 min-w-[160px]">
                    <EditCell value={l.cliente || ''} canEdit={canEdit} placeholder="cliente / observación" onSave={(v) => updateLinea(l.id, { cliente: v.trim() || null })} />
                  </td>
                  <td className="p-2 text-right">
                    <EditCell value={String(l.cantidad)} type="number" align="right" canEdit={canEdit} display={num(l.cantidad)} onSave={(v) => saveNumero(l, 'cantidad', v)} />
                  </td>
                  <td className="p-2 text-right">
                    <EditCell value={String(l.cantidad_cumplida)} type="number" align="right" canEdit={canEdit} display={num(l.cantidad_cumplida)} onSave={(v) => saveNumero(l, 'cantidad_cumplida', v)} />
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <span className={pend > 0 ? 'font-semibold text-amber-700' : ''}>{num(pend)}</span>
                    {cumplidoSinCerrar && <div className="text-[10px] text-emerald-600">cumplido, falta cerrar</div>}
                  </td>
                  <td className="p-2 min-w-[160px] text-xs">
                    <div><EditCell value={l.personalizado || ''} canEdit={canEdit} placeholder="personalizado" onSave={(v) => updateLinea(l.id, { personalizado: v.trim() || null })} /></div>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {l.estado === 'pendiente' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>}
                    {l.estado === 'completo' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Completo</span>}
                    {l.estado === 'anulado' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Anulado</span>}
                    {l.cerrado_at && <div className="text-[10px] text-slate-400">{shortDate(l.cerrado_at)}</div>}
                  </td>
                  {canEdit && (
                    <td className="p-2 whitespace-nowrap text-xs">
                      {l.estado === 'pendiente' ? (
                        <>
                          <button onClick={() => cerrar(l)} className="text-emerald-700 hover:underline mr-2">Cerrar</button>
                          <button onClick={() => anular(l)} className="text-slate-500 hover:underline mr-2">Anular</button>
                        </>
                      ) : (
                        <button onClick={() => reabrir(l)} className="text-blue-600 hover:underline mr-2">Reabrir</button>
                      )}
                      <button onClick={() => openNew(l)} className="text-blue-600 hover:underline mr-2" title="Agregar otro producto a este mismo pedido">+ producto</button>
                      <button onClick={() => eliminar(l)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-semibold text-slate-800">Nuevo pedido</h3>
              <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <label className="text-xs text-slate-500">Fecha
                <input type="date" value={nFecha} onChange={(e) => setNFecha(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800" />
              </label>
              <label className="text-xs text-slate-500">Sucursal
                <select value={nSucursal} onChange={(e) => setNSucursal(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800">
                  {SUCURSALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">N.º de pedido
                <input value={nNro} onChange={(e) => setNNro(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800" />
              </label>
            </div>

            <p className="text-xs font-medium text-slate-600 mb-2">Productos del pedido (uno abajo del otro)</p>
            <div className="space-y-2 mb-3">
              {nRows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 sm:col-span-4">
                    <ProductPicker products={products} value={r.product_id} onPick={(id) => updateNRow(i, { product_id: id })} />
                  </div>
                  <input list="clientes-lista" placeholder="Cliente / Obs. (o STOCK)" value={r.cliente} onChange={(e) => updateNRow(i, { cliente: e.target.value })} className="col-span-7 sm:col-span-3 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <input placeholder="Cant." inputMode="decimal" value={r.cantidad} onChange={(e) => updateNRow(i, { cantidad: e.target.value })} className="col-span-5 sm:col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm text-right" />
                  <input placeholder="Personalizado" value={r.personalizado} onChange={(e) => updateNRow(i, { personalizado: e.target.value })} className="col-span-8 sm:col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <button onClick={() => setNRows((prev) => (prev.length > 1 ? prev.filter((_, ri) => ri !== i) : prev))} className="col-span-4 sm:col-span-1 text-xs text-red-500 hover:underline text-left sm:text-center pt-2">Quitar</button>
                </div>
              ))}
              <datalist id="clientes-lista">
                {clientesExistentes.map((c: any) => <option key={c} value={c} />)}
                <option value="STOCK" />
              </datalist>
            </div>
            <button onClick={() => setNRows((prev) => [...prev, emptyRow()])} className="text-xs text-blue-600 hover:underline mb-1">+ Agregar otro producto</button>
            <p className="text-[11px] text-slate-400 mb-4">Si el producto no aparece en la lista, primero hay que crearlo en Catálogo de Productos.</p>

            <div className="flex gap-2">
              <button onClick={guardarNuevo} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar pedido'}
              </button>
              <button onClick={() => setShowNew(false)} disabled={saving} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
