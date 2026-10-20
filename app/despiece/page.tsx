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

// Sectores que trabajan sobre el producto armado (brasero, plancheta...) y no pieza por pieza
const ENSAMBLE = /soldad|granall|pintur|embal/i
const EMBALAJE = /embal/i

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
function DesignCell({ url, obs, canEdit, onSave }: {
  url: string; obs: string; canEdit: boolean; onSave: (url: string, obs: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [u, setU] = useState(url)
  const [o, setO] = useState(obs)
  useEffect(() => { setU(url); setO(obs) }, [url, obs])
  if (editing) {
    return (
      <div className="space-y-1">
        <input autoFocus value={u} placeholder="Link de Drive" onChange={(e) => setU(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 text-xs w-48 block" />
        <input value={o} placeholder="Nota (opcional)" onChange={(e) => setO(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 text-xs w-48 block" />
        <button onClick={() => { setEditing(false); onSave(u.trim(), o.trim()) }} className="text-xs text-blue-600 hover:underline mr-2">Guardar</button>
        <button onClick={() => { setEditing(false); setU(url); setO(obs) }} className="text-xs text-slate-400 hover:underline">Cancelar</button>
      </div>
    )
  }
  return (
    <div className="text-xs">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">Diseño ↗</a>
          {canEdit && <button onClick={() => setEditing(true)} className="ml-2 text-slate-400 hover:text-slate-600">editar</button>}
          {obs && <div className="text-slate-400">{obs}</div>}
        </>
      ) : canEdit ? (
        <button onClick={() => setEditing(true)} className="text-amber-600 hover:underline">+ link</button>
      ) : <span className="text-amber-600">sin link</span>}
    </div>
  )
}

function Chips({ sectors, activos, canEdit, onToggle, nowrap }: {
  sectors: any[]; activos: string[]; canEdit: boolean; onToggle: (id: string) => void; nowrap?: boolean
}) {
  return (
    <div className={`flex gap-1 ${nowrap ? 'flex-nowrap' : 'flex-wrap'}`}>
      {sectors.map((s) => {
        const on = activos.includes(s.id)
        return (
          <button key={s.id} disabled={!canEdit} onClick={() => onToggle(s.id)} title={s.name}
            className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-400'} ${canEdit ? 'hover:border-slate-500' : ''}`}>
            {s.name}
          </button>
        )
      })}
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
  const [grupoSectores, setGrupoSectores] = useState<Record<string, string[]>>({})
  const [productoSectores, setProductoSectores] = useState<string[]>([])
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
    const { data: gs } = await supabase.from('despiece_grupo_sectores').select('grupo, sector_id').eq('product_id', pid)
    const gmap: Record<string, string[]> = {}
    ;(gs || []).forEach((r: any) => { (gmap[r.grupo] = gmap[r.grupo] || []).push(r.sector_id) })
    setGrupoSectores(gmap)
    const { data: ps } = await supabase.from('despiece_producto_sectores').select('sector_id').eq('product_id', pid)
    setProductoSectores((ps || []).map((r: any) => r.sector_id))
    const { data: comp } = await supabase.from('producto_materiales').select('*').eq('product_id', pid)
    setComposicion(comp || [])
    setLoadingProd(false)
  }

  function elegirProducto(id: string) {
    setProductId(id)
    if (id) cargarProducto(id)
    else { setLineas([]); setLineaSectores({}); setGrupoSectores({}); setProductoSectores([]); setComposicion([]) }
  }

  const productItems: Item[] = useMemo(() => products.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })), [products])
  const materialItems: Item[] = useMemo(() => materiales.map((m) => ({ id: m.id, label: `${m.codigo || '—'} · ${m.nombre}` })), [materiales])
  const sectorItems: Item[] = useMemo(() => sectors.map((s) => ({ id: s.id, label: s.name })), [sectors])
  const matById = useMemo(() => { const m: Record<string, any> = {}; materiales.forEach((x) => { m[x.id] = x }); return m }, [materiales])
  const secById = useMemo(() => { const m: Record<string, any> = {}; sectors.forEach((x) => { m[x.id] = x }); return m }, [sectors])
  const laserSector = sectors.find((s) => /l[aá]ser/i.test(s.name))
  const sectoresPieza = sectors.filter((s) => !ENSAMBLE.test(s.name))
  const sectoresEnsamble = sectors.filter((s) => ENSAMBLE.test(s.name) && !EMBALAJE.test(s.name))
  const sectoresProducto = sectors.filter((s) => EMBALAJE.test(s.name))

  // Unidad de la medida = la unidad del material (m², mm, kg, etc.), tal como está cargada en Stock MP
  function unidadDe(l: any) { const m = l.material_id ? matById[l.material_id] : null; return m && m.unidad_medida ? m.unidad_medida : '' }
  function esLaser(l: any) { return l.tipo === 'pieza' && !!laserSector && (lineaSectores[l.id] || []).includes(laserSector.id) }
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

  async function toggleGrupoSector(grupo: string, sectorId: string) {
    const actuales = grupoSectores[grupo] || []
    if (actuales.includes(sectorId)) {
      const { error } = await supabase.from('despiece_grupo_sectores').delete().eq('product_id', productId).eq('grupo', grupo).eq('sector_id', sectorId)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setGrupoSectores((prev) => ({ ...prev, [grupo]: actuales.filter((x) => x !== sectorId) }))
    } else {
      const { error } = await supabase.from('despiece_grupo_sectores').insert({ product_id: productId, grupo, sector_id: sectorId })
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setGrupoSectores((prev) => ({ ...prev, [grupo]: [...actuales, sectorId] }))
    }
  }

  async function toggleProductoSector(sectorId: string) {
    if (productoSectores.includes(sectorId)) {
      const { error } = await supabase.from('despiece_producto_sectores').delete().eq('product_id', productId).eq('sector_id', sectorId)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setProductoSectores((prev) => prev.filter((x) => x !== sectorId))
    } else {
      const { error } = await supabase.from('despiece_producto_sectores').insert({ product_id: productId, sector_id: sectorId })
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setProductoSectores((prev) => [...prev, sectorId])
    }
  }

  async function agregarLinea(grupo: string, tipo: 'pieza' | 'material') {
    const maxOrden = lineas.reduce((a, l) => Math.max(a, l.orden || 0), 0)
    const { data, error } = await supabase.from('despiece_lineas')
      .insert({ product_id: productId, tipo, grupo, nombre: tipo === 'pieza' ? 'Nueva pieza' : 'Nuevo material', medida: 0, cantidad: 1, orden: maxOrden + 1 })
      .select().single()
    if (error) { alert('No se pudo agregar: ' + error.message); return }
    setLineas((prev) => [...prev, data])
  }

  async function crearGrupo() {
    const g = nuevoGrupo.trim()
    if (!g) return
    await agregarLinea(g, 'pieza')
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
    await supabase.from('despiece_grupo_sectores').update({ grupo: n }).eq('product_id', productId).eq('grupo', viejo)
    setLineas((prev) => prev.map((l) => (l.grupo === viejo ? { ...l, grupo: n } : l)))
    setGrupoSectores((prev) => { const c = { ...prev }; if (c[viejo]) { c[n] = c[viejo]; delete c[viejo] } return c })
  }

  // ---------- Derivados ----------
  const piezas = lineas.filter((l) => l.tipo === 'pieza')
  const materiales_ = lineas.filter((l) => l.tipo === 'material')

  const grupos = useMemo(() => {
    const orden: string[] = []
    const m: Record<string, any[]> = {}
    piezas.forEach((l) => {
      const g = l.grupo || '(sin grupo)'
      if (!m[g]) { m[g] = []; orden.push(g) }
      m[g].push(l)
    })
    return orden.map((g) => ({ nombre: g, lineas: m[g] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas])

  const laserSinLink = piezas.filter((l) => esLaser(l) && !(l.diseno_url || '').trim())
  const sinMaterial = lineas.filter((l) => !l.material_id)
  const sinSector = lineas.filter((l) => l.material_id && !l.sector_consumo_id)

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

  const cantDiferencias = comparacion.filter((c) => Math.abs(c.despiece - c.actual) > 0.0001).length

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

  // Celda de materia prima (compartida entre piezas y materiales)
  function materiaPrimaCell(l: any) {
    const mat = l.material_id ? matById[l.material_id] : null
    return (
      <>
        <PickerCell
          items={materialItems} value={l.material_id || ''} canEdit={canEdit} allowEmpty
          display={mat ? <span><span className="text-slate-400 mr-1">{mat.codigo}</span>{mat.nombre}</span> : <span className="text-red-500 text-xs">sin material{l.material_texto ? ` (${l.material_texto})` : ''}</span>}
          onSave={(id) => updateLinea(l.id, { material_id: id || null })}
        />
        <div className="text-[11px] text-slate-400 mt-0.5">
          descuenta en{' '}
          <PickerCell
            items={sectorItems} value={l.sector_consumo_id || ''} canEdit={canEdit} allowEmpty
            display={l.sector_consumo_id ? (secById[l.sector_consumo_id]?.name || '—') : (l.material_id ? <span className="text-red-500">sin sector</span> : '—')}
            onSave={(id) => updateLinea(l.id, { sector_consumo_id: id || null })}
          />
        </div>
      </>
    )
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Despiece de productos</h1>
      <p className="text-sm text-slate-500 mb-4">Piezas de cada producto y los sectores por los que pasan. Hacé click sobre cualquier valor (nombre, material, medida, cantidad) para editarlo.</p>

      {!canEdit && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">Modo solo lectura — no tenés permisos para editar este módulo.</div>
      )}

      <div className="max-w-xl mb-4">
        <Picker items={productItems} value={productId} onPick={elegirProducto} placeholder="Escribí para buscar un producto..." />
      </div>

      {!productId && <p className="text-sm text-slate-400">Elegí un producto para ver su despiece.</p>}
      {productId && loadingProd && <p className="text-sm text-slate-400">Cargando despiece...</p>}

      {productId && !loadingProd && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 mb-5">
            <span>{piezas.length} piezas</span>
            <span className={laserSinLink.length > 0 ? 'text-amber-700' : ''}>{laserSinLink.length} de láser sin link de diseño</span>
            {sinMaterial.length > 0 && <span className="text-red-600">{sinMaterial.length} sin material</span>}
            {sinSector.length > 0 && <span className="text-red-600">{sinSector.length} sin sector de descuento</span>}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={soloLaserSinLink} onChange={(e) => setSoloLaserSinLink(e.target.checked)} />
              ver solo las que faltan
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6 pb-3 border-b border-slate-200">
            <span className="text-sm font-semibold text-slate-800">{producto ? `${producto.code} · ${producto.name}` : ''}</span>
            <span className="text-xs text-slate-400">producto terminado, una sola línea en la orden de</span>
            <Chips sectors={sectoresProducto} activos={productoSectores} canEdit={canEdit} onToggle={toggleProductoSector} nowrap />
          </div>

          {lineas.length === 0 && <p className="text-sm text-slate-400 mb-4">Este producto todavía no tiene despiece cargado.{canEdit ? ' Creá el primer grupo abajo.' : ''}</p>}

          {grupos.map((g) => {
            const visibles = soloLaserSinLink ? g.lineas.filter((l) => esLaser(l) && !(l.diseno_url || '').trim()) : g.lineas
            if (visibles.length === 0) return null
            return (
              <section key={g.nombre} className="mb-8">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 border-b-2 border-slate-800 mb-1">
                  <h3 className="text-base font-semibold text-slate-800">
                    <EditCell value={g.nombre} canEdit={canEdit} onSave={(v) => renombrarGrupo(g.nombre, v)} />
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">grupo armado pasa por</span>
                    <Chips sectors={sectoresEnsamble} activos={grupoSectores[g.nombre] || []} canEdit={canEdit} onToggle={(id) => toggleGrupoSector(g.nombre, id)} />
                  </div>
                  {canEdit && <button onClick={() => agregarLinea(g.nombre, 'pieza')} className="text-xs text-blue-600 hover:underline ml-auto">+ pieza</button>}
                </div>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="py-2 pr-3 font-normal">Pieza</th>
                      <th className="py-2 pr-3 font-normal">Materia prima</th>
                      <th className="py-2 pr-3 font-normal text-right">Medida</th>
                      <th className="py-2 pr-3 font-normal text-right">Cant.</th>
                      <th className="py-2 pr-3 font-normal">Pasa por</th>
                      <th className="py-2 pr-3 font-normal">Diseño</th>
                      {canEdit && <th className="py-2 font-normal"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-3 min-w-[180px]">
                          <EditCell value={l.nombre || ''} canEdit={canEdit} onSave={(v) => v.trim() && updateLinea(l.id, { nombre: v.trim() })} />
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            <EditCell value={l.ancho_mm == null ? '' : String(l.ancho_mm)} type="number" canEdit={canEdit} display={l.ancho_mm == null ? 'ancho' : num(l.ancho_mm, 1)} onSave={(v) => saveNum(l, 'ancho_mm', v, true)} />
                            {' × '}
                            <EditCell value={l.largo_mm == null ? '' : String(l.largo_mm)} type="number" canEdit={canEdit} display={l.largo_mm == null ? 'largo' : num(l.largo_mm, 1)} onSave={(v) => saveNum(l, 'largo_mm', v, true)} />
                            {' mm'}
                          </div>
                        </td>
                        <td className="py-2 pr-3 min-w-[240px]">{materiaPrimaCell(l)}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          <EditCell value={String(l.medida)} type="number" align="right" canEdit={canEdit} display={num(l.medida, 6)} onSave={(v) => saveNum(l, 'medida', v)} />
                          <span className="ml-1 text-[11px] text-slate-400">{unidadDe(l)}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <EditCell value={String(l.cantidad)} type="number" align="right" canEdit={canEdit} display={num(l.cantidad)} onSave={(v) => saveNum(l, 'cantidad', v)} />
                        </td>
                        <td className="py-2 pr-3">
                          <Chips nowrap sectors={sectoresPieza} activos={lineaSectores[l.id] || []} canEdit={canEdit} onToggle={(id) => toggleSector(l, id)} />
                        </td>
                        <td className="py-2 pr-3 min-w-[110px]">
                          {esLaser(l) ? (
                            <DesignCell url={l.diseno_url || ''} obs={l.diseno_obs || ''} canEdit={canEdit}
                              onSave={(u, o) => updateLinea(l.id, { diseno_url: u || null, diseno_obs: o || null })} />
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {canEdit && (
                          <td className="py-2 whitespace-nowrap text-xs">
                            <button onClick={() => eliminar(l)} className="text-slate-400 hover:text-red-600">eliminar</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}

          {canEdit && (
            <div className="flex gap-2 items-center mb-8">
              <input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') crearGrupo() }}
                placeholder="Nuevo grupo (ej: PARRILLA)" className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-64" />
              <button onClick={crearGrupo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">+ Nuevo grupo</button>
            </div>
          )}

          <section className="mb-8">
            <div className="flex items-center gap-4 pb-2 border-b-2 border-slate-800 mb-1">
              <h3 className="text-base font-semibold text-slate-800">Materiales directos</h3>
              <span className="text-xs text-slate-400">pintura, embalaje, bulones, kit...</span>
              {canEdit && <button onClick={() => agregarLinea('MATERIALES', 'material')} className="text-xs text-blue-600 hover:underline ml-auto">+ material</button>}
            </div>
            {materiales_.length === 0 ? <p className="text-xs text-slate-400 py-2">Sin materiales directos.</p> : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="py-2 pr-3 font-normal">Descripción</th>
                    <th className="py-2 pr-3 font-normal">Materia prima</th>
                    <th className="py-2 pr-3 font-normal text-right">Cantidad por producto</th>
                    {canEdit && <th className="py-2 font-normal"></th>}
                  </tr>
                </thead>
                <tbody>
                  {materiales_.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3 min-w-[160px]"><EditCell value={l.nombre || ''} canEdit={canEdit} onSave={(v) => v.trim() && updateLinea(l.id, { nombre: v.trim() })} /></td>
                      <td className="py-2 pr-3 min-w-[260px]">{materiaPrimaCell(l)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <EditCell value={String(totalLinea(l))} type="number" align="right" canEdit={canEdit}
                          display={num(totalLinea(l), 6)}
                          onSave={(v) => { const n = parseFloat(v.replace(',', '.')); if (isNaN(n) || n < 0) { alert('Ingresá un número válido (0 o más).'); return } updateLinea(l.id, { medida: n, cantidad: 1 }) }} />
                        {l.material_id && matById[l.material_id]?.unidad_medida && <span className="ml-1 text-[11px] text-slate-400">{matById[l.material_id].unidad_medida}</span>}
                      </td>
                      {canEdit && (
                        <td className="py-2 whitespace-nowrap text-xs">
                          <button onClick={() => eliminar(l)} className="text-slate-400 hover:text-red-600">eliminar</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <details className="mb-8">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Materia prima: despiece vs composición actual
              <span className={`ml-2 text-xs font-normal ${cantDiferencias > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                {cantDiferencias > 0 ? `${cantDiferencias} diferencia(s)` : 'coincide'}
              </span>
            </summary>
            <p className="text-xs text-slate-500 mt-2 mb-2">La composición actual es lo que se descuenta hoy en Turnos. Si el despiece está bien, aplicalo y pasa a ser la composición.</p>
            <table className="w-full text-sm border-collapse mb-3">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-2 pr-3 font-normal">Materia prima</th>
                  <th className="py-2 pr-3 font-normal">Sector</th>
                  <th className="py-2 pr-3 font-normal text-right">Composición actual</th>
                  <th className="py-2 pr-3 font-normal text-right">Despiece</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.map((c, i) => {
                  const mat = matById[c.material_id]
                  const dif = Math.abs(c.despiece - c.actual) > 0.0001
                  return (
                    <tr key={i} className={`border-t border-slate-100 ${dif ? 'bg-amber-50' : ''}`}>
                      <td className="py-1.5 pr-3"><span className="text-slate-400 mr-1">{mat?.codigo}</span>{mat?.nombre || '—'}</td>
                      <td className="py-1.5 pr-3 text-xs">{c.sector_id ? (secById[c.sector_id]?.name || '—') : <span className="text-red-500">sin sector</span>}</td>
                      <td className="py-1.5 pr-3 text-right">{num(c.actual)} <span className="text-[11px] text-slate-400">{mat?.unidad_medida || ''}</span></td>
                      <td className="py-1.5 pr-3 text-right">{num(c.despiece)} <span className="text-[11px] text-slate-400">{mat?.unidad_medida || ''}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {canEdit && (
              <button onClick={aplicarAComposicion} disabled={aplicando || lineas.length === 0}
                className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50">
                {aplicando ? 'Aplicando...' : `Aplicar el despiece a la composición de ${producto ? producto.code : 'este producto'}`}
              </button>
            )}
          </details>
        </>
      )}
    </main>
  )
}
