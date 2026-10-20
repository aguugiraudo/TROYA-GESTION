'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Item = { id: string; label: string }

// Sectores que trabajan sobre el grupo armado (soldadura, granallado, pintura) y sobre el producto (embalaje)
const GRUPO_RE = /soldad|granall|pintur/i
const PRODUCTO_RE = /embal/i

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function num(n: number, dec = 4) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec })
}
function nroOP(n: number) { return 'OP-' + String(n).padStart(4, '0') }
function fechaAR(f: string | null) {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function Picker({ items, value, onPick, placeholder }: {
  items: Item[]; value: string; onPick: (id: string) => void; placeholder?: string
}) {
  const selected = items.find((p) => p.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const palabras = normalizar(query).split(/\s+/).filter(Boolean)
  const filtrados = items.filter((p) => { const t = normalizar(p.label); return palabras.every((w) => t.includes(w)) }).slice(0, 40)
  function elegir(id: string) { setQuery(''); setOpen(false); onPick(id) }
  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? selected.label : '')}
        placeholder={placeholder || 'Escribí para buscar...'}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => { setOpen(false); setQuery('') }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtrados.length > 0) { e.preventDefault(); elegir(filtrados[0].id) }
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
        }}
        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto min-w-[300px]">
          {filtrados.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">No hay coincidencias.</div>}
          {filtrados.map((p) => (
            <div key={p.id} onMouseDown={(e) => { e.preventDefault(); elegir(p.id) }} className="px-2 py-1.5 text-sm hover:bg-blue-50 cursor-pointer">{p.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Columnas opcionales de la hoja (cada sector tiene las suyas, como en tu planilla) ----------
const COLUMNAS: { key: string; label: string }[] = [
  { key: 'proceso', label: 'Proceso' },
  { key: 'material', label: 'Materia prima' },
  { key: 'grupo', label: 'Componente' },
  { key: 'medida', label: 'Medida' },
  { key: 'ancho_largo', label: 'Ancho × Largo' },
  { key: 'diseno', label: 'Link de diseño' },
  { key: 'componentes', label: 'Piezas del grupo' },
  { key: 'obs', label: 'Observaciones' },
]
const APLICA: Record<string, string[]> = {
  pieza: ['proceso', 'material', 'grupo', 'medida', 'ancho_largo', 'diseno', 'obs'],
  grupo: ['componentes', 'obs'],
  producto: ['obs'],
}
const MECANIZADO_RE = /mecaniz/i
const LASER_RE = /l[aá]ser/i
const PLEGADO_RE = /plegad/i
const PROC_MECANIZADO_RE = /sensitiv|balanc|rebab|dobl|rolad|perfor/i

// Qué se muestra por defecto en la hoja de cada sector (según tu planilla)
function columnasPorDefecto(sector: string, tipo: string): Record<string, boolean> {
  const on: Record<string, boolean> = { obs: true }
  if (tipo === 'pieza') {
    if (LASER_RE.test(sector)) { on.material = true }
    else if (MECANIZADO_RE.test(sector)) { on.proceso = true; on.material = true; on.medida = true }
    else if (PLEGADO_RE.test(sector)) { on.grupo = true }
    else { on.material = true; on.grupo = true; on.medida = true }
  }
  return on
}

type Row = { key: string; cells: Record<string, any>; nombre: string; cantidad: number }
type Sheet = { sectorId: string; sector: string; tipo: 'pieza' | 'grupo' | 'producto'; rows: Row[] }

export default function OrdenesPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'

  const [ordenes, setOrdenes] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [materiales, setMateriales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  const [filtroEstado, setFiltroEstado] = useState('abierta')
  const [nuevo, setNuevo] = useState(false)
  const [nProducto, setNProducto] = useState('')
  const [nCantidad, setNCantidad] = useState('1')
  const [nNotas, setNNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Vista previa / impresión
  const [imprimiendo, setImprimiendo] = useState<any | null>(null)
  const [hojas, setHojas] = useState<Sheet[]>([])
  const [hojasOn, setHojasOn] = useState<Record<string, boolean>>({})
  const [registros, setRegistros] = useState<Record<string, number>>({})
  const [colsPorHoja, setColsPorHoja] = useState<Record<string, Record<string, boolean>>>({})
  const [cargandoHojas, setCargandoHojas] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: ops, error: e1 }, { data: prods }, { data: secs }, { data: mats }] = await Promise.all([
      supabase.from('op_ordenes').select('*').order('numero', { ascending: false }),
      supabase.from('products').select('id, code, name').order('name'),
      supabase.from('sectors').select('*').order('sequence_no'),
      supabase.from('materiales').select('id, codigo, nombre, unidad_medida'),
    ])
    if (e1) setErrorCarga('No se pudieron cargar las órdenes: ' + e1.message + ' (¿corriste el SQL ordenes_tablas.sql?)')
    setOrdenes(ops || []); setProducts(prods || []); setSectors(secs || []); setMateriales(mats || [])
    setLoading(false)
  }

  const productItems: Item[] = useMemo(() => products.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })), [products])
  const prodById = useMemo(() => { const m: Record<string, any> = {}; products.forEach((p) => { m[p.id] = p }); return m }, [products])
  const matById = useMemo(() => { const m: Record<string, any> = {}; materiales.forEach((x) => { m[x.id] = x }); return m }, [materiales])

  async function crearOP() {
    const cant = parseFloat(nCantidad.replace(',', '.'))
    if (!nProducto) { alert('Elegí un producto.'); return }
    if (isNaN(cant) || cant <= 0) { alert('La cantidad tiene que ser mayor a 0.'); return }
    setGuardando(true)
    const { error } = await supabase.from('op_ordenes').insert({
      product_id: nProducto, cantidad: cant, notas: nNotas.trim() || null,
    })
    setGuardando(false)
    if (error) { alert('No se pudo crear la orden: ' + error.message); return }
    setNuevo(false); setNProducto(''); setNCantidad('1'); setNNotas('')
    cargar()
  }

  async function cambiarEstado(o: any, estado: string) {
    const { error } = await supabase.from('op_ordenes').update({ estado }).eq('id', o.id)
    if (error) { alert('No se pudo cambiar el estado: ' + error.message); return }
    setOrdenes((prev) => prev.map((x) => (x.id === o.id ? { ...x, estado } : x)))
  }

  async function eliminarOP(o: any) {
    if (!confirm(`¿Eliminar ${nroOP(o.numero)}? No se puede deshacer.`)) return
    const { error } = await supabase.from('op_ordenes').delete().eq('id', o.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    setOrdenes((prev) => prev.filter((x) => x.id !== o.id))
  }

  async function editarCampo(o: any, campo: string, valor: any) {
    const { error } = await supabase.from('op_ordenes').update({ [campo]: valor }).eq('id', o.id)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setOrdenes((prev) => prev.map((x) => (x.id === o.id ? { ...x, [campo]: valor } : x)))
  }

  // ---------- Armado de las hojas desde el despiece ----------
  async function abrirImpresion(o: any) {
    setImprimiendo(o); setCargandoHojas(true); setHojas([])
    const pid = o.product_id
    const { data: ls, error } = await supabase.from('despiece_lineas').select('*').eq('product_id', pid).order('orden').order('created_at')
    if (error) { alert('No se pudo leer el despiece: ' + error.message); setImprimiendo(null); setCargandoHojas(false); return }
    const lineas = ls || []
    const ids = lineas.map((l: any) => l.id)
    const lmap: Record<string, string[]> = {}
    if (ids.length > 0) {
      const { data: ss } = await supabase.from('despiece_linea_sectores').select('linea_id, sector_id').in('linea_id', ids)
      ;(ss || []).forEach((r: any) => { (lmap[r.linea_id] = lmap[r.linea_id] || []).push(r.sector_id) })
    }
    const { data: gs } = await supabase.from('despiece_grupo_sectores').select('grupo, sector_id').eq('product_id', pid)
    const { data: ps } = await supabase.from('despiece_producto_sectores').select('sector_id').eq('product_id', pid)
    const gmap: Record<string, string[]> = {}
    ;(gs || []).forEach((r: any) => { (gmap[r.sector_id] = gmap[r.sector_id] || []).push(r.grupo) })
    const prodSecs = (ps || []).map((r: any) => r.sector_id)

    const cant = Number(o.cantidad)
    const producto = prodById[pid]
    const piezas = lineas.filter((l: any) => l.tipo === 'pieza')
    const out: Sheet[] = []

    sectors.forEach((s) => {
      if (GRUPO_RE.test(s.name)) {
        const grupos = gmap[s.id] || []
        if (grupos.length === 0) return
        const orden: string[] = []
        piezas.forEach((l: any) => { if (l.grupo && !orden.includes(l.grupo)) orden.push(l.grupo) })
        const ordenados = orden.filter((g) => grupos.includes(g)).concat(grupos.filter((g) => !orden.includes(g)))
        out.push({
          sectorId: s.id, sector: s.name, tipo: 'grupo',
          rows: ordenados.map((g) => ({
            key: g, nombre: g, cantidad: cant,
            cells: { componentes: piezas.filter((l: any) => l.grupo === g).map((l: any) => l.nombre).join(', ') },
          })),
        })
      } else if (PRODUCT_OK(s.name)) {
        // El embalaje sale en todas las OP (todo producto se embala), aunque no esté tildado en el despiece
        out.push({
          sectorId: s.id, sector: s.name, tipo: 'producto',
          rows: [{ key: pid, nombre: producto ? producto.name : 'Producto', cantidad: cant, cells: {} }],
        })
      } else {
        const delSector = piezas.filter((l: any) => (lmap[l.id] || []).includes(s.id))
        if (delSector.length === 0) return
        out.push({
          sectorId: s.id, sector: s.name, tipo: 'pieza',
          rows: delSector.slice().sort((a: any, b: any) => String((matById[a.material_id] || {}).nombre || '').localeCompare(String((matById[b.material_id] || {}).nombre || ''))).map((l: any) => {
            const m = l.material_id ? matById[l.material_id] : null
            return {
              key: l.id, nombre: l.nombre, cantidad: Number(l.cantidad) * cant,
              cells: {
                grupo: l.grupo || '',
                proceso: String(l.procesos_detalle || '').split(',').map((x: string) => x.trim()).filter((x: string) => PROC_MECANIZADO_RE.test(x)).map((x: string) => x.charAt(0).toUpperCase() + x.slice(1)).join(' + '),
                material: m ? m.nombre : (l.material_texto || ''),
                medida: `${num(l.medida, 6)}${m && m.unidad_medida ? ' ' + m.unidad_medida : ''}`,
                ancho_largo: l.ancho_mm != null || l.largo_mm != null ? `${l.ancho_mm != null ? num(l.ancho_mm, 1) : '?'} × ${l.largo_mm != null ? num(l.largo_mm, 1) : '?'} mm` : '',
                diseno: l.diseno_url || '',
                diseno_obs: l.diseno_obs || '',
              },
            }
          }),
        })
      }
    })
    function PRODUCT_OK(n: string) { return PRODUCTO_RE.test(n) }

    setHojas(out)
    const on: Record<string, boolean> = {}
    const cp: Record<string, Record<string, boolean>> = {}
    out.forEach((h) => { on[h.sectorId] = true; cp[h.sectorId] = columnasPorDefecto(h.sector, h.tipo) })
    const rg: Record<string, number> = {}
    out.forEach((h) => { rg[h.sectorId] = 3 })
    setRegistros(rg)
    setHojasOn(on)
    setColsPorHoja(cp)
    setCargandoHojas(false)
  }

  function columnasDe(h: Sheet) {
    const act = colsPorHoja[h.sectorId] || {}
    return COLUMNAS.filter((c) => APLICA[h.tipo].includes(c.key) && act[c.key] && !(c.key === 'proceso' && !MECANIZADO_RE.test(h.sector)))
  }
  function posibles(h: Sheet) {
    return COLUMNAS.filter((c) => APLICA[h.tipo].includes(c.key) && !(c.key === 'proceso' && !MECANIZADO_RE.test(h.sector)))
  }
  function tituloNombre(h: Sheet) { return h.tipo === 'pieza' ? 'Pieza / observación' : h.tipo === 'grupo' ? 'Producto armado' : 'Producto' }

  const visibles = ordenes.filter((o) => filtroEstado === 'todas' || o.estado === filtroEstado)

  if (loading) return <main className="p-6 text-slate-500">Cargando...</main>

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          nav { display: none !important; }
          body * { visibility: hidden !important; }
          .preview-root { position: absolute !important; inset: auto !important; left: 0; top: 0; width: 100%; height: auto !important; overflow: visible !important; background: #fff !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { width: 100%; }
          .hoja { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
          .hoja:last-child { page-break-after: auto; break-after: auto; }
          .sheet { margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>

      <main className="p-6 max-w-6xl mx-auto no-print">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-slate-800">Órdenes de producción</h1>
          {canEdit && <button onClick={() => setNuevo(!nuevo)} className="ml-auto text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">{nuevo ? 'Cancelar' : '+ Nueva OP'}</button>}
        </div>
        <p className="text-sm text-slate-500 mb-4">Cada OP imprime una hoja por sector, armada desde el despiece del producto.</p>

        {errorCarga && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{errorCarga}</div>}

        {nuevo && (
          <div className="mb-6 border border-slate-200 rounded-lg p-4 bg-white">
            <div className="grid gap-3 md:grid-cols-[1fr_110px]">
              <div>
                <label className="text-xs text-slate-500">Producto</label>
                <Picker items={productItems} value={nProducto} onPick={setNProducto} placeholder="Escribí para buscar un producto..." />
              </div>
              <div>
                <label className="text-xs text-slate-500">Cantidad</label>
                <input type="number" min="1" step="any" value={nCantidad} onChange={(e) => setNCantidad(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-slate-500">Observaciones (opcional, salen impresas en cada hoja)</label>
              <input value={nNotas} onChange={(e) => setNNotas(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </div>
            <button onClick={crearOP} disabled={guardando} className="mt-3 text-sm bg-slate-800 text-white px-4 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50">{guardando ? 'Creando...' : 'Crear orden'}</button>
          </div>
        )}

        <div className="flex gap-2 mb-3 text-xs">
          {['abierta', 'cerrada', 'anulada', 'todas'].map((e) => (
            <button key={e} onClick={() => setFiltroEstado(e)} className={`px-3 py-1 rounded-full border ${filtroEstado === e ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>{e === 'todas' ? 'Todas' : e.charAt(0).toUpperCase() + e.slice(1) + 's'}</button>
          ))}
        </div>

        {visibles.length === 0 ? <p className="text-sm text-slate-400">No hay órdenes en esta vista.</p> : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-2 pr-3 font-normal">N°</th>
                <th className="py-2 pr-3 font-normal">Emitida</th>
                <th className="py-2 pr-3 font-normal">Producto</th>
                <th className="py-2 pr-3 font-normal text-right">Cant.</th>
                <th className="py-2 pr-3 font-normal">Observaciones</th>
                <th className="py-2 pr-3 font-normal">Estado</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((o) => {
                const p = prodById[o.product_id]
                return (
                  <tr key={o.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{nroOP(o.numero)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fechaAR(o.fecha_emision)}</td>
                    <td className="py-2 pr-3">{p ? <><span className="text-slate-400 mr-1">{p.code}</span>{p.name}</> : '—'}</td>
                    <td className="py-2 pr-3 text-right">
                      {canEdit ? (
                        <input defaultValue={String(o.cantidad)} type="number" step="any" className="w-16 text-right border border-transparent hover:border-slate-300 rounded px-1"
                          onBlur={(e) => { const n = parseFloat(e.target.value.replace(',', '.')); if (isNaN(n) || n <= 0) { alert('La cantidad tiene que ser mayor a 0.'); e.target.value = String(o.cantidad); return } if (n !== Number(o.cantidad)) editarCampo(o, 'cantidad', n) }} />
                      ) : num(o.cantidad)}
                    </td>
                    <td className="py-2 pr-3 min-w-[160px]">
                      {canEdit ? <input defaultValue={o.notas || ''} placeholder="—" className="w-full border border-transparent hover:border-slate-300 rounded px-1"
                        onBlur={(e) => { if ((e.target.value.trim() || null) !== (o.notas || null)) editarCampo(o, 'notas', e.target.value.trim() || null) }} /> : (o.notas || '')}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${o.estado === 'abierta' ? 'bg-blue-50 text-blue-700' : o.estado === 'cerrada' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{o.estado}</span>
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      <button onClick={() => abrirImpresion(o)} className="text-blue-600 hover:underline mr-3">Imprimir hojas</button>
                      {canEdit && o.estado === 'abierta' && <button onClick={() => cambiarEstado(o, 'cerrada')} className="text-slate-500 hover:text-emerald-600 mr-3">cerrar</button>}
                      {canEdit && o.estado === 'abierta' && <button onClick={() => cambiarEstado(o, 'anulada')} className="text-slate-500 hover:text-amber-600 mr-3">anular</button>}
                      {canEdit && o.estado !== 'abierta' && <button onClick={() => cambiarEstado(o, 'abierta')} className="text-slate-500 hover:text-blue-600 mr-3">reabrir</button>}
                      {canEdit && <button onClick={() => eliminarOP(o)} className="text-slate-400 hover:text-red-600">eliminar</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </main>

      {imprimiendo && (
        <div className="preview-root fixed inset-0 z-50 bg-slate-100 overflow-y-auto">
          <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 z-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-slate-800">{nroOP(imprimiendo.numero)} · vista de impresión</span>
              <button onClick={() => window.print()} disabled={hojas.filter((h) => hojasOn[h.sectorId]).length === 0} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50">Imprimir</button>
              <button onClick={() => setImprimiendo(null)} className="text-sm text-slate-500 hover:underline ml-auto">Cerrar</button>
            </div>
            <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-medium text-slate-700">Hojas:</span>
              {hojas.map((h) => (
                <label key={h.sectorId} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={!!hojasOn[h.sectorId]} onChange={(e) => setHojasOn((p) => ({ ...p, [h.sectorId]: e.target.checked }))} />{h.sector}
                </label>
              ))}
            </div>
          </div>

          {cargandoHojas && <p className="p-6 text-sm text-slate-500 no-print">Armando las hojas...</p>}
          {!cargandoHojas && hojas.length === 0 && (
            <p className="p-6 text-sm text-slate-500 no-print">Este producto no tiene despiece con sectores cargados, así que no hay hojas para imprimir. Completalo en Ingeniería → Despiece.</p>
          )}

          <div className="print-area">
            {hojas.filter((h) => hojasOn[h.sectorId]).map((h) => {
              const columnas = columnasDe(h)
              const antes = columnas.filter((c) => c.key === 'proceso' || c.key === 'material')
              const medio = columnas.filter((c) => c.key !== 'proceso' && c.key !== 'material' && c.key !== 'obs')
              const conObs = columnas.some((c) => c.key === 'obs')
              const p = prodById[imprimiendo.product_id]
              const nReg = registros[h.sectorId] || 3
              // Cada sector entra en UNA hoja: si hay muchas filas o muchas columnas, se achica todo en proporción (nunca se estira)
              const altoFila = 11 // mm, tamaño fijo y legible
              const zoomAlto = Math.min(1, 118 / (Math.max(1, h.rows.length) * altoFila))
              const anchoNec = 20 + 40 + antes.length * 40 + medio.length * 30 + (conObs ? 28 : 0) + nReg * 45
              const zoomAncho = Math.min(1, 275 / anchoNec)
              const zoom = Math.max(0.5, Math.min(zoomAlto, zoomAncho))
              return (
                <div key={h.sectorId} className="hoja">
                  <div className="no-print mx-4 mt-4 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="font-medium text-slate-700">{h.sector}:</span>
                    <label className="flex items-center gap-1">
                      Bloques de registro (fecha / cant. / firma)
                      <select value={nReg} onChange={(e) => setRegistros((prev) => ({ ...prev, [h.sectorId]: parseInt(e.target.value) }))} className="border border-slate-300 rounded px-1 py-0.5">
                        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    {posibles(h).map((c) => (
                      <label key={c.key} className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={!!(colsPorHoja[h.sectorId] || {})[c.key]}
                          onChange={(e) => setColsPorHoja((prev) => ({ ...prev, [h.sectorId]: { ...(prev[h.sectorId] || {}), [c.key]: e.target.checked } }))} />{c.label}
                      </label>
                    ))}
                    {zoom < 1 && <span className="text-amber-700">Hay muchas filas o columnas: se achica para que entre en 1 hoja ({Math.round(zoom * 100)}%).</span>}
                  </div>
                  <section className="sheet bg-white m-4 mt-1 p-6 shadow-sm border border-slate-200 print:m-0 print:shadow-none print:border-0">
                    <div style={{ zoom } as any}>
                      <div className="flex items-end justify-between mb-2">
                        <div className="flex items-end gap-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/logo_troya_white.png" alt="Troya" style={{ height: '26px', width: 'auto', filter: 'brightness(0)' }} />
                          <div className="text-3xl font-extrabold text-slate-900 leading-none">{h.sector.toUpperCase()}</div>
                        </div>
                        <div className="text-xs text-slate-600">Fecha de emisión: {fechaAR(imprimiendo.fecha_emision)}</div>
                      </div>
                      <div className="flex items-stretch border-2 border-slate-900 mb-3">
                        <div className="px-3 py-1.5 border-r-2 border-slate-900">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Orden</div>
                          <div className="text-3xl font-extrabold leading-tight">{nroOP(imprimiendo.numero)}</div>
                        </div>
                        <div className="px-3 py-1.5 flex-1 border-r-2 border-slate-900">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Producto</div>
                          <div className="text-2xl font-extrabold leading-tight uppercase">{p ? `${p.code} · ${p.name}` : ''}</div>
                        </div>
                        <div className="px-4 py-1.5 text-center">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Cantidad</div>
                          <div className="text-4xl font-extrabold leading-tight">{num(imprimiendo.cantidad)}</div>
                        </div>
                      </div>
                      {imprimiendo.notas && <div className="text-sm mb-3 border border-slate-400 rounded px-2 py-1 uppercase">Obs.: {imprimiendo.notas}</div>}
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left">
                            {antes.map((c) => <th key={c.key} rowSpan={2} className="py-1 font-semibold border border-slate-500 px-1.5">{c.label}</th>)}
                            <th rowSpan={2} className="py-1 border border-slate-500 px-1.5">{tituloNombre(h)}</th>
                            <th rowSpan={2} className="py-1 text-center border border-slate-500 px-1.5">Cantidad</th>
                            {medio.map((c) => <th key={c.key} rowSpan={2} className="py-1 font-semibold border border-slate-500 px-1.5">{c.label}</th>)}
                            <th colSpan={nReg * 3} className="py-1 text-center font-semibold border border-slate-500">Registro de producción (un bloque por día o turno)</th>
                            {conObs && <th rowSpan={2} className="py-1 font-semibold border border-slate-500 px-1.5">Observaciones</th>}
                          </tr>
                          <tr className="text-xs text-slate-600">
                            {Array.from({ length: nReg }).map((_, b) => (
                              <Fragment key={b}>
                                <th className="border border-slate-500 py-0.5" style={{ width: '15mm' }}>Fecha</th>
                                <th className="border border-slate-500 py-0.5" style={{ width: '12mm' }}>Cant.</th>
                                <th className="border border-slate-500 py-0.5" style={{ width: '22mm' }}>Operario</th>
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="uppercase">
                          {h.rows.map((r) => (
                            <tr key={r.key} className="align-top" style={{ height: `${altoFila}mm` }}>
                              {antes.map((c) => <td key={c.key} className="border border-slate-500 px-1.5 py-1" style={{ minWidth: '38mm' }}>{r.cells[c.key] || ''}</td>)}
                              <td className="border border-slate-500 px-1.5 py-1 font-semibold" style={{ minWidth: '34mm' }}>{r.nombre}</td>
                              <td className="border border-slate-500 px-1.5 py-1 text-center font-bold text-lg">{num(r.cantidad)}</td>
                              {medio.map((c) => {
                                if (c.key === 'diseno') return (
                                  <td key={c.key} className="border border-slate-500 px-1.5 py-1 text-xs break-all normal-case" style={{ maxWidth: '45mm' }}>
                                    {r.cells.diseno ? <a href={r.cells.diseno} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{r.cells.diseno}</a> : ''}
                                    {r.cells.diseno_obs ? <div className="text-slate-500">{r.cells.diseno_obs}</div> : null}
                                  </td>
                                )
                                return <td key={c.key} className="border border-slate-500 px-1.5 py-1">{r.cells[c.key] || ''}</td>
                              })}
                              {Array.from({ length: nReg * 3 }).map((_, k) => <td key={`b${k}`} className="border border-slate-500"></td>)}
                              {conObs && <td className="border border-slate-500" style={{ minWidth: '28mm' }}></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
