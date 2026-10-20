'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Item = { id: string; label: string }

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function num(n: number, dec = 4) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec })
}

// Celda que se edita con un click (texto o número)
function EditCell({
  value, type = 'text', canEdit, onSave, display, align, placeholder, className,
}: {
  value: string
  type?: 'text' | 'number'
  canEdit: boolean
  onSave: (v: string) => void
  display?: ReactNode
  align?: 'right'
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => { setV(value) }, [value])

  const shown = display !== undefined ? display : (value || <span className="text-slate-300">{placeholder || '—'}</span>)
  if (!canEdit) return <span className={className}>{shown}</span>
  if (!editing) {
    return (
      <span onClick={() => { cancelled.current = false; setEditing(true) }} title="Click para editar"
        className={`cursor-pointer hover:underline decoration-dotted decoration-slate-400 ${className || ''}`}>
        {shown}
      </span>
    )
  }
  function finish() {
    setEditing(false)
    if (cancelled.current) { setV(value); return }
    if (v !== value) onSave(v)
  }
  return (
    <input
      autoFocus type={type} step={type === 'number' ? 'any' : undefined} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur() }
      }}
      className={`border border-slate-300 rounded px-1 py-0.5 text-xs w-full min-w-[60px] ${align === 'right' ? 'text-right' : ''}`}
    />
  )
}

// Buscador: se escribe y filtra por cualquier palabra
function Picker({
  items, value, onPick, onClose, autoFocus, allowEmpty, placeholder,
}: {
  items: Item[]
  value: string
  onPick: (id: string) => void
  onClose?: () => void
  autoFocus?: boolean
  allowEmpty?: boolean
  placeholder?: string
}) {
  const selected = items.find((p) => p.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(!!autoFocus)
  const palabras = normalizar(query).split(/\s+/).filter(Boolean)
  const filtrados = items.filter((p) => { const t = normalizar(p.label); return palabras.every((w) => t.includes(w)) }).slice(0, 40)
  function elegir(id: string) { setQuery(''); setOpen(false); onPick(id) }
  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={open ? query : (selected ? selected.label : '')}
        placeholder={placeholder || 'Escribí para buscar...'}
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
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto min-w-[300px]">
          {allowEmpty && <div onMouseDown={(e) => { e.preventDefault(); elegir('') }} className="px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 cursor-pointer">(ninguno)</div>}
          {filtrados.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No hay coincidencias.</div>}
          {filtrados.map((p) => (
            <div key={p.id} onMouseDown={(e) => { e.preventDefault(); elegir(p.id) }} className="px-2 py-1.5 text-sm hover:bg-blue-50 cursor-pointer">{p.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Celda con buscador que se abre al hacer click
function PickerCell({ items, value, canEdit, display, onSave, allowEmpty }: {
  items: Item[]; value: string; canEdit: boolean; display: ReactNode; onSave: (id: string) => void; allowEmpty?: boolean
}) {
  const [editing, setEditing] = useState(false)
  if (!canEdit) return <span>{display}</span>
  if (!editing) return <span onClick={() => setEditing(true)} title="Click para cambiar" className="cursor-pointer hover:underline decoration-dotted decoration-slate-400">{display}</span>
  return <Picker items={items} value={value} autoFocus allowEmpty={allowEmpty} onPick={(id) => { setEditing(false); if (id !== value) onSave(id) }} onClose={() => setEditing(false)} />
}

// Link al diseño (solo piezas de láser)
function DesignCell({ url, obs, canEdit, onSaveUrl, onSaveObs }: {
  url: string; obs: string; canEdit: boolean; onSaveUrl: (v: string) => void; onSaveObs: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(url)
  useEffect(() => { setV(url) }, [url])
  if (editing) {
    return (
      <input autoFocus value={v} placeholder="Pegá el link de Drive" onChange={(e) => setV(e.target.value)}
        onBlur={() => { setEditing(false); if (v.trim() !== url) onSaveUrl(v.trim()) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(url); setEditing(false) } }}
        className="border border-slate-300 rounded px-1 py-0.5 text-xs w-44" />
    )
  }
  return (
    <div className="text-xs">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700">Diseño ↗</a>
          {canEdit && <button onClick={() => setEditing(true)} className="ml-1 text-slate-400 hover:text-slate-600 underline">cambiar</button>}
        </>
      ) : canEdit ? (
        <button onClick={() => setEditing(true)} className="text-amber-600 hover:underline">+ link diseño</button>
      ) : <span className="text-amber-600">sin link</span>}
      <div className="text-slate-400 mt-0.5"><EditCell value={obs} canEdit={canEdit} placeholder="obs. diseño" onSave={onSaveObs} /></div>
    </div>
  )
}

export default function DespiecePage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1'

  const [products, setProducts] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [materiales, setMateriales] = useState<any[]>([])
  const [loadingBase, setLoadingBase] = useState(true)

  const [productId, setProductId] = useState('')
  const [lineas, setLineas] = useState<any[]>([])
  const [lineaSectores, setLineaSectores] = useState<Record<string, string[]>>({})
  const [composicion, setComposicion] = useState<any[]>([])
  const [loadingProd, setLoadingProd] = useState(false)

  const [soloLaserSinLink, setSoloLaserSinLink] = useState(false)
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => { cargarBase() }, [])

  async function cargarBase() {
    const [{ data: prods }, { data: secs }, { data: mats }] = await Promise.all([
      supabase.from('products').select('id, code, name').order('name'),
      supabase.from('sectors').select('*').order('sequence_no'),
      supabase.from('materiales').select('id, codigo, nombre, unidad_medida').order('nombre'),
    ])
    setProducts(prods || []); setSectors(secs || []); setMateriales(mats || [])
    setLoadingBase(false)
  }

  async function cargarProducto(pid: string) {
    setLoadingProd(true)
    const { data: ls, error } = await supabase.from('despiece_lineas').select('*').eq('product_id', pid).order('orden').order('created_at')
    if (error) { alert('No se pudo cargar el despiece: ' + error.message); setLoadingProd(false); return }
    setLineas(ls || [])
    const ids = (ls || []).map((l: any) => l.id)
    const map: Record<string, string[]> = {}
    if (ids.length > 0) {
      const { data: ss } = await supabase.from('despiece_linea_sectores').select('linea_id, sector_id').in('linea_id', ids)
      ;(ss || []).forEach((r: any) => { (map[r.linea_id] = map[r.linea_id] || []).push(r.sector_id) })
    }
    setLineaSectores(map)
    const { data: comp } = await supabase.from('producto_materiales').select('*').eq('product_id', pid)
    setComposicion(comp || [])
    setLoadingProd(false)
  }

  function elegirProducto(id: string) {
    setProductId(id)
    if (id) cargarProducto(id)
    else { setLineas([]); setLineaSectores({}); setComposicion([]) }
  }

  const productItems: Item[] = useMemo(() => products.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })), [products])
  const materialItems: Item[] = useMemo(() => materiales.map((m) => ({ id: m.id, label: `${m.codigo || '—'} · ${m.nombre}` })), [materiales])
  const sectorItems: Item[] = useMemo(() => sectors.map((s) => ({ id: s.id, label: s.name })), [sectors])
  const matById = useMemo(() => { const m: Record<string, any> = {}; materiales.forEach((x) => { m[x.id] = x }); return m }, [materiales])
  const secById = useMemo(() => { const m: Record<string, any> = {}; sectors.forEach((x) => { m[x.id] = x }); return m }, [sectors])
  const laserSector = sectors.find((s) => /l[aá]ser/i.test(s.name))

  function esLaser(l: any) { return !!laserSector && (lineaSectores[l.id] || []).includes(laserSector.id) }
  function totalLinea(l: any) { return Number(l.medida) * Number(l.cantidad) }

  async function updateLinea(id: string, patch: Record<string, any>) {
    const { error } = await supabase.from('despiece_lineas').update(patch).eq('id', id)
    if (error) { alert('No se pudo guardar el cambio: ' + error.message); return }
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function saveNum(l: any, campo: string, v: string, permitirVacio?: boolean) {
    if (permitirVacio && v.trim() === '') { updateLinea(l.id, { [campo]: null }); return }
    const n = parseFloat(v.replace(',', '.'))
    if (isNaN(n) || n < 0) { alert('Ingresá un número válido (0 o más).'); return }
    updateLinea(l.id, { [campo]: n })
  }

  async function toggleSector(l: any, sectorId: string) {
    const actuales = lineaSectores[l.id] || []
    if (actuales.includes(sectorId)) {
      const { error } = await supabase.from('despiece_linea_sectores').delete().eq('linea_id', l.id).eq('sector_id', sectorId)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setLineaSectores((prev) => ({ ...prev, [l.id]: actuales.filter((x) => x !== sectorId) }))
    } else {
      const { error } = await supabase.from('despiece_linea_sectores').insert({ linea_id: l.id, sector_id: sectorId })
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setLineaSectores((prev) => ({ ...prev, [l.id]: [...actuales, sectorId] }))
    }
  }

  async function agregarLinea(grupo: string) {
    const maxOrden = lineas.reduce((a, l) => Math.max(a, l.orden || 0), 0)
    const { data, error } = await supabase.from('despiece_lineas')
      .insert({ product_id: productId, tipo: 'pieza', grupo, nombre: 'Nueva pieza', medida: 0, cantidad: 1, orden: maxOrden + 1 })
      .select().single()
    if (error) { alert('No se pudo agregar: ' + error.message); return }
    setLineas((prev) => [...prev, data])
  }

  async function crearGrupo() {
    const g = nuevoGrupo.trim()
    if (!g) return
    await agregarLinea(g)
    setNuevoGrupo('')
  }

  async function duplicar(l: any) {
    const maxOrden = lineas.reduce((a, x) => Math.max(a, x.orden || 0), 0)
    const { id, created_at, ...resto } = l
    const { data, error } = await supabase.from('despiece_lineas').insert({ ...resto, orden: maxOrden + 1 }).select().single()
    if (error) { alert('No se pudo duplicar: ' + error.message); return }
    const secs = lineaSectores[l.id] || []
    if (secs.length > 0) await supabase.from('despiece_linea_sectores').insert(secs.map((s) => ({ linea_id: data.id, sector_id: s })))
    setLineas((prev) => [...prev, data])
    setLineaSectores((prev) => ({ ...prev, [data.id]: [...secs] }))
  }

  async function eliminar(l: any) {
    if (!confirm(`¿Eliminar "${l.nombre}" del despiece? No se puede deshacer.`)) return
    const { error } = await supabase.from('despiece_lineas').delete().eq('id', l.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setLineas((prev) => prev.filter((x) => x.id !== l.id))
  }

  async function renombrarGrupo(viejo: string, nuevo: string) {
    const n = nuevo.trim()
    if (!n || n === viejo) return
    const { error } = await supabase.from('despiece_lineas').update({ grupo: n }).eq('product_id', productId).eq('grupo', viejo)
    if (error) { alert('No se pudo renombrar: ' + error.message); return }
    setLineas((prev) => prev.map((l) => (l.grupo === viejo ? { ...l, grupo: n } : l)))
  }

  // ---------- Derivados ----------
  const grupos = useMemo(() => {
    const orden: string[] = []
    const m: Record<string, any[]> = {}
    lineas.forEach((l) => {
      const g = l.grupo || '(sin grupo)'
      if (!m[g]) { m[g] = []; orden.push(g) }
      m[g].push(l)
    })
    return orden.map((g) => ({ nombre: g, lineas: m[g] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas])

  const laserSinLink = lineas.filter((l) => esLaser(l) && !(l.diseno_url || '').trim())
  const sinMaterial = lineas.filter((l) => !l.material_id)
  const sinSector = lineas.filter((l) => l.material_id && !l.sector_consumo_id)

  // Materia prima total del despiece por material + sector de descuento
  const comparacion = useMemo(() => {
    const m: Record<string, { material_id: string; sector_id: string | null; despiece: number; actual: number }> = {}
    lineas.forEach((l) => {
      if (!l.material_id) return
      const k = l.material_id + '|' + (l.sector_consumo_id || '')
      if (!m[k]) m[k] = { material_id: l.material_id, sector_id: l.sector_consumo_id || null, despiece: 0, actual: 0 }
      m[k].despiece += totalLinea(l)
    })
    composicion.forEach((c) => {
      const k = c.material_id + '|' + (c.sector_id || '')
      if (!m[k]) m[k] = { material_id: c.material_id, sector_id: c.sector_id || null, despiece: 0, actual: 0 }
      m[k].actual += Number(c.cantidad_por_unidad)
    })
    return Object.values(m).sort((a, b) => (matById[a.material_id]?.codigo || '').localeCompare(matById[b.material_id]?.codigo || ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, composicion, matById])

  const hayDiferencias = comparacion.some((c) => Math.abs(c.despiece - c.actual) > 0.0001)

  async function aplicarAComposicion() {
    const items = comparacion.filter((c) => c.despiece > 0 && c.sector_id)
    const excluidas = lineas.filter((l) => !l.material_id || !l.sector_consumo_id).length
    const msg = `Se va a REEMPLAZAR la composición de materia prima de este producto por la del despiece (${items.length} materiales).` +
      (excluidas > 0 ? `\n\nATENCIÓN: ${excluidas} línea(s) sin material o sin sector de descuento NO se incluyen.` : '') +
      `\n\nHay un respaldo de la composición anterior en Supabase (tabla producto_materiales_respaldo_20261020). ¿Continuar?`
    if (!confirm(msg)) return
    setAplicando(true)
    const { data: viejas, error: e0 } = await supabase.from('producto_materiales').select('*').eq('product_id', productId)
    if (e0) { alert('No se pudo leer la composición actual: ' + e0.message); setAplicando(false); return }
    const { error: e1 } = await supabase.from('producto_materiales').delete().eq('product_id', productId)
    if (e1) { alert('No se pudo reemplazar: ' + e1.message); setAplicando(false); return }
    const nuevas = items.map((c) => ({ product_id: productId, material_id: c.material_id, sector_id: c.sector_id, cantidad_por_unidad: Math.round(c.despiece * 1000000) / 1000000 }))
    const { error: e2 } = await supabase.from('producto_materiales').insert(nuevas)
    if (e2) {
      // restaura lo que había
      if (viejas && viejas.length > 0) await supabase.from('producto_materiales').insert(viejas)
      alert('No se pudo guardar la nueva composición, se restauró la anterior. Detalle: ' + e2.message)
      setAplicando(false)
      cargarProducto(productId)
      return
    }
    setAplicando(false)
    alert('Composición actualizada.')
    cargarProducto(productId)
  }

  if (loadingBase) return <main className="p-6 text-slate-500">Cargando...</main>

  const producto = products.find((p) => p.id === productId)

  return (
    <main className="p-6 max-w-[1500px] mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Despiece de productos</h1>
      <p className="text-sm text-slate-500 mb-4">Piezas y materiales de cada producto: materia prima, medidas, sectores por los que pasa y link del diseño (solo piezas de láser).</p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">Modo solo lectura — no tenés permisos para editar este módulo.</div>
      )}

      <div className="max-w-xl mb-5">
        <Picker items={productItems} value={productId} onPick={elegirProducto} placeholder="Escribí para buscar un producto..." />
      </div>

      {!productId && <p className="text-sm text-slate-400">Elegí un producto para ver su despiece.</p>}
      {productId && loadingProd && <p className="text-sm text-slate-400">Cargando despiece...</p>}

      {productId && !loadingProd && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="border border-slate-200 rounded-lg p-3 bg-white"><p className="text-xs text-slate-500">Líneas</p><p className="text-xl font-semibold text-slate-800">{lineas.length}</p></div>
            <div className={`border rounded-lg p-3 ${laserSinLink.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <p className="text-xs text-slate-500">Piezas de láser sin link de diseño</p>
              <p className={`text-xl font-semibold ${laserSinLink.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{laserSinLink.length}</p>
            </div>
            <div className={`border rounded-lg p-3 ${sinMaterial.length > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <p className="text-xs text-slate-500">Líneas sin material</p>
              <p className={`text-xl font-semibold ${sinMaterial.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{sinMaterial.length}</p>
            </div>
            <div className={`border rounded-lg p-3 ${sinSector.length > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <p className="text-xs text-slate-500">Sin sector de descuento</p>
              <p className={`text-xl font-semibold ${sinSector.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{sinSector.length}</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 mb-3">
            <input type="checkbox" checked={soloLaserSinLink} onChange={(e) => setSoloLaserSinLink(e.target.checked)} />
            Mostrar solo piezas de láser sin link de diseño
          </label>

          {lineas.length === 0 && <p className="text-sm text-slate-400 mb-4">Este producto todavía no tiene despiece cargado.{canEdit ? ' Creá el primer grupo abajo.' : ''}</p>}

          {grupos.map((g) => {
            const visibles = soloLaserSinLink ? g.lineas.filter((l) => esLaser(l) && !(l.diseno_url || '').trim()) : g.lineas
            if (visibles.length === 0) return null
            return (
              <div key={g.nombre} className="mb-5">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-semibold text-slate-700">
                    <EditCell value={g.nombre} canEdit={canEdit} onSave={(v) => renombrarGrupo(g.nombre, v)} />
                  </h3>
                  {canEdit && <button onClick={() => agregarLinea(g.nombre)} className="text-xs text-blue-600 hover:underline">+ línea</button>}
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white text-left text-xs">
                        <th className="p-2 font-medium">Pieza / material</th>
                        <th className="p-2 font-medium min-w-[220px]">Materia prima</th>
                        <th className="p-2 font-medium text-right">Medida</th>
                        <th className="p-2 font-medium text-right">Cant.</th>
                        <th className="p-2 font-medium text-right">Total</th>
                        <th className="p-2 font-medium">Ancho × Largo (mm)</th>
                        <th className="p-2 font-medium">Descuenta en</th>
                        <th className="p-2 font-medium">Pasa por</th>
                        <th className="p-2 font-medium">Diseño</th>
                        {canEdit && <th className="p-2 font-medium"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((l) => {
                        const mat = l.material_id ? matById[l.material_id] : null
                        const secs = lineaSectores[l.id] || []
                        return (
                          <tr key={l.id} className="border-t border-slate-100 align-top">
                            <td className="p-2 min-w-[190px]">
                              <EditCell value={l.nombre || ''} canEdit={canEdit} onSave={(v) => v.trim() && updateLinea(l.id, { nombre: v.trim() })} />
                              {l.tipo === 'material' && <span className="ml-1 text-[10px] text-slate-400">(material)</span>}
                            </td>
                            <td className="p-2">
                              <PickerCell
                                items={materialItems} value={l.material_id || ''} canEdit={canEdit} allowEmpty
                                display={mat ? <span><span className="text-slate-400 mr-1">{mat.codigo}</span>{mat.nombre}</span> : <span className="text-red-500 text-xs">sin material{l.material_texto ? ` (${l.material_texto})` : ''}</span>}
                                onSave={(id) => updateLinea(l.id, { material_id: id || null })}
                              />
                            </td>
                            <td className="p-2 text-right whitespace-nowrap">
                              <EditCell value={String(l.medida)} type="number" align="right" canEdit={canEdit} display={num(l.medida, 6)} onSave={(v) => saveNum(l, 'medida', v)} />
                              {mat?.unidad_medida && <span className="ml-1 text-[10px] text-slate-400">{mat.unidad_medida}</span>}
                            </td>
                            <td className="p-2 text-right">
                              <EditCell value={String(l.cantidad)} type="number" align="right" canEdit={canEdit} display={num(l.cantidad)} onSave={(v) => saveNum(l, 'cantidad', v)} />
                            </td>
                            <td className="p-2 text-right text-slate-600">{num(totalLinea(l), 6)}</td>
                            <td className="p-2 whitespace-nowrap text-xs">
                              <EditCell value={l.ancho_mm == null ? '' : String(l.ancho_mm)} type="number" canEdit={canEdit} placeholder="ancho" display={l.ancho_mm == null ? <span className="text-slate-300">ancho</span> : num(l.ancho_mm, 1)} onSave={(v) => saveNum(l, 'ancho_mm', v, true)} />
                              <span className="mx-1 text-slate-300">×</span>
                              <EditCell value={l.largo_mm == null ? '' : String(l.largo_mm)} type="number" canEdit={canEdit} placeholder="largo" display={l.largo_mm == null ? <span className="text-slate-300">largo</span> : num(l.largo_mm, 1)} onSave={(v) => saveNum(l, 'largo_mm', v, true)} />
                            </td>
                            <td className="p-2 text-xs">
                              <PickerCell
                                items={sectorItems} value={l.sector_consumo_id || ''} canEdit={canEdit} allowEmpty
                                display={l.sector_consumo_id ? (secById[l.sector_consumo_id]?.name || '—') : (l.material_id ? <span className="text-red-500">sin sector</span> : <span className="text-slate-300">—</span>)}
                                onSave={(id) => updateLinea(l.id, { sector_consumo_id: id || null })}
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-1 max-w-[260px]">
                                {sectors.map((s) => {
                                  const on = secs.includes(s.id)
                                  return (
                                    <button key={s.id} disabled={!canEdit} onClick={() => toggleSector(l, s.id)} title={s.name}
                                      className={`text-[10px] px-1.5 py-0.5 rounded border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'} ${canEdit ? 'hover:border-blue-400' : ''}`}>
                                      {s.name.slice(0, 4)}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                            <td className="p-2 min-w-[150px]">
                              {esLaser(l) ? (
                                <DesignCell url={l.diseno_url || ''} obs={l.diseno_obs || ''} canEdit={canEdit}
                                  onSaveUrl={(v) => updateLinea(l.id, { diseno_url: v || null })}
                                  onSaveObs={(v) => updateLinea(l.id, { diseno_obs: v.trim() || null })} />
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            {canEdit && (
                              <td className="p-2 whitespace-nowrap text-xs">
                                <button onClick={() => duplicar(l)} className="text-blue-600 hover:underline mr-2">Duplicar</button>
                                <button onClick={() => eliminar(l)} className="text-red-500 hover:underline">Eliminar</button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {canEdit && (
            <div className="flex gap-2 items-center mb-8">
              <input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') crearGrupo() }}
                placeholder="Nombre del nuevo grupo (ej: PARRILLA)" className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-72" />
              <button onClick={crearGrupo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">+ Nuevo grupo</button>
            </div>
          )}

          <h2 className="text-sm font-semibold text-slate-700 mb-1">Materia prima del producto: despiece vs composición actual</h2>
          <p className="text-xs text-slate-500 mb-2">Es lo que se descuenta hoy en Turnos (composición actual) comparado con lo que da la suma de este despiece, por material y sector.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-left text-xs">
                  <th className="p-2 font-medium">Materia prima</th>
                  <th className="p-2 font-medium">Sector</th>
                  <th className="p-2 font-medium text-right">Composición actual</th>
                  <th className="p-2 font-medium text-right">Según despiece</th>
                  <th className="p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-sm">Sin datos.</td></tr>}
                {comparacion.map((c, i) => {
                  const mat = matById[c.material_id]
                  const dif = Math.abs(c.despiece - c.actual) > 0.0001
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-2"><span className="text-slate-400 mr-1">{mat?.codigo}</span>{mat?.nombre || '—'}</td>
                      <td className="p-2 text-xs">{c.sector_id ? (secById[c.sector_id]?.name || '—') : <span className="text-red-500">sin sector</span>}</td>
                      <td className="p-2 text-right">{num(c.actual)}</td>
                      <td className="p-2 text-right">{num(c.despiece)}</td>
                      <td className="p-2 text-xs">{dif ? <span className="text-amber-700">distinto</span> : <span className="text-emerald-600">coincide</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <button onClick={aplicarAComposicion} disabled={aplicando || lineas.length === 0}
              className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50">
              {aplicando ? 'Aplicando...' : `Aplicar el despiece a la composición de ${producto ? producto.code : 'este producto'}`}
            </button>
          )}
          {canEdit && !hayDiferencias && lineas.length > 0 && <span className="ml-3 text-xs text-emerald-600">Ya coincide, no hace falta aplicar.</span>}
        </>
      )}
    </main>
  )
}
