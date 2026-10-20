'use client'
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Sectores que trabajan sobre el producto armado (soldadura, granallado, pintura) y sobre el producto terminado (embalaje)
const GRUPO_RE = /soldad|granall|pintur/i
const PRODUCTO_RE = /embal/i
const MECANIZADO_RE = /mecaniz/i
const LASER_RE = /l[aá]ser/i
const PLEGADO_RE = /plegad/i
const PROC_MECANIZADO_RE = /sensitiv|balanc|rebab|dobl|rolad|perfor/i

function num(n: number, dec = 4) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec })
}
function fechaAR(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR')
}
function textoOP(n: string) { return /^op/i.test(String(n).trim()) ? String(n).trim() : `OP ${String(n).trim()}` }

// Columnas opcionales (cada sector tiene las suyas, como en la planilla)
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

export default function HojaOP({ order, onClose }: { order: any; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hojas, setHojas] = useState<Sheet[]>([])
  const [hojasOn, setHojasOn] = useState<Record<string, boolean>>({})
  const [colsPorHoja, setColsPorHoja] = useState<Record<string, Record<string, boolean>>>({})
  const [nReg, setNReg] = useState(2)
  const [separar, setSeparar] = useState(false)
  const [producto, setProducto] = useState<any>(null)
  const [sinDespiece, setSinDespiece] = useState(false)
  const [montado, setMontado] = useState(false)

  useEffect(() => { setMontado(true); armar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function armar() {
    setLoading(true)
    const pid = order.product_id
    const [{ data: prod }, { data: secs }, { data: mats }, { data: ls, error: e1 }] = await Promise.all([
      supabase.from('products').select('id, code, name').eq('id', pid).maybeSingle(),
      supabase.from('sectors').select('*').order('sequence_no'),
      supabase.from('materiales').select('id, codigo, nombre, unidad_medida'),
      supabase.from('despiece_lineas').select('*').eq('product_id', pid).order('orden').order('created_at'),
    ])
    if (e1) { setError('No se pudo leer el despiece: ' + e1.message); setLoading(false); return }
    setProducto(prod)
    const sectors = secs || []
    const matById: Record<string, any> = {}
    ;(mats || []).forEach((m: any) => { matById[m.id] = m })
    const lineas = ls || []
    const ids = lineas.map((l: any) => l.id)
    const lmap: Record<string, string[]> = {}
    if (ids.length > 0) {
      const { data: ss } = await supabase.from('despiece_linea_sectores').select('linea_id, sector_id').in('linea_id', ids)
      ;(ss || []).forEach((r: any) => { (lmap[r.linea_id] = lmap[r.linea_id] || []).push(r.sector_id) })
    }
    const { data: gs } = await supabase.from('despiece_grupo_sectores').select('grupo, sector_id').eq('product_id', pid)
    const gmap: Record<string, string[]> = {}
    ;(gs || []).forEach((r: any) => { (gmap[r.sector_id] = gmap[r.sector_id] || []).push(r.grupo) })

    const cant = Number(order.lot_quantity)
    const piezas = lineas.filter((l: any) => l.tipo === 'pieza')
    const out: Sheet[] = []

    sectors.forEach((s: any) => {
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
      } else if (PRODUCTO_RE.test(s.name)) {
        // El embalaje sale en todas las OP (todo producto se embala)
        out.push({
          sectorId: s.id, sector: s.name, tipo: 'producto',
          rows: [{ key: pid, nombre: prod ? prod.name : 'Producto', cantidad: cant, cells: {} }],
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

    setSinDespiece(piezas.length === 0)
    setHojas(out)
    const on: Record<string, boolean> = {}
    const cp: Record<string, Record<string, boolean>> = {}
    out.forEach((h) => { on[h.sectorId] = true; cp[h.sectorId] = columnasPorDefecto(h.sector, h.tipo) })
    setHojasOn(on); setColsPorHoja(cp)
    setLoading(false)
  }

  function posibles(h: Sheet) {
    return COLUMNAS.filter((c) => APLICA[h.tipo].includes(c.key) && !(c.key === 'proceso' && !MECANIZADO_RE.test(h.sector)))
  }
  function columnasDe(h: Sheet) {
    const act = colsPorHoja[h.sectorId] || {}
    return posibles(h).filter((c) => act[c.key])
  }
  function tituloNombre(h: Sheet) { return h.tipo === 'pieza' ? 'Pieza / observación' : h.tipo === 'grupo' ? 'Producto armado' : 'Producto' }

  const visibles = hojas.filter((h) => hojasOn[h.sectorId])
  const microLabel = 'text-[10px] uppercase tracking-[0.2em] text-slate-400'
  const th = 'py-1 border border-slate-400 px-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-600'

  const contenido = (
    <div className="op-portal">
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          body > *:not(.op-portal) { display: none !important; }
          .preview-root { position: static !important; overflow: visible !important; height: auto !important; background: #fff !important; }
          .sheet { margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .sector-block.corto { break-inside: avoid; page-break-inside: avoid; }
          .sector-block.nuevo-pliego { break-before: page; page-break-before: always; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          /* Sin ningún relleno ni sombra: solo líneas y texto, para gastar poca tinta */
          .op-portal, .op-portal * { background: transparent !important; box-shadow: none !important; }
        }
      `}</style>
      <div className="preview-root fixed inset-0 z-[60] bg-slate-100 overflow-y-auto">
        <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 z-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-800">{textoOP(order.order_number)} · vista de impresión</span>
            <button onClick={() => window.print()} disabled={loading || visibles.length === 0} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50">Imprimir</button>
            <button onClick={onClose} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-200 ml-auto">Cerrar</button>
          </div>
          {!loading && (
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <label className="flex items-center gap-1">Bloques de registro (fecha / cant. / firma)
                  <select value={nReg} onChange={(e) => setNReg(parseInt(e.target.value))} className="border border-slate-300 rounded px-1 py-0.5">
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} />Una hoja por sector</label>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-slate-700">Sectores:</span>
                {hojas.map((h) => (
                  <label key={h.sectorId} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!hojasOn[h.sectorId]} onChange={(e) => setHojasOn((p) => ({ ...p, [h.sectorId]: e.target.checked }))} />{h.sector}
                  </label>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer text-slate-600">Columnas de cada sector</summary>
                <div className="mt-1 space-y-1">
                  {hojas.map((h) => (
                    <div key={h.sectorId} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-medium text-slate-700 w-28">{h.sector}</span>
                      {posibles(h).map((c) => (
                        <label key={c.key} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={!!(colsPorHoja[h.sectorId] || {})[c.key]}
                            onChange={(e) => setColsPorHoja((prev) => ({ ...prev, [h.sectorId]: { ...(prev[h.sectorId] || {}), [c.key]: e.target.checked } }))} />{c.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
              {sinDespiece && <p className="text-amber-700">Este producto todavía no tiene despiece cargado: solo sale el embalaje. Completalo en Ingeniería → Despiece.</p>}
            </div>
          )}
        </div>

        {loading && <p className="p-6 text-sm text-slate-500 no-print">Armando la hoja...</p>}
        {error && <p className="p-6 text-sm text-red-600 no-print">{error}</p>}

        {!loading && !error && (
          <div className="sheet bg-white m-4 mt-3 p-8 shadow-sm border border-slate-200">
            {/* Franja superior: marca | sector no aplica acá (hay varios) | emisión */}
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo_troya_white.png" alt="Troya" style={{ height: '24px', width: 'auto', filter: 'brightness(0)' }} />
              <div className="text-right">
                <div className={microLabel}>Fecha de emisión</div>
                <div className="text-sm font-semibold text-slate-800">{fechaAR(order.created_at)}</div>
              </div>
            </div>

            <div className="grid border border-slate-400 mb-2" style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
              <div className="px-4 py-2 border-r border-slate-400">
                <div className={microLabel}>Orden</div>
                <div className="text-2xl font-bold text-slate-900 leading-tight whitespace-nowrap">{textoOP(order.order_number)}</div>
              </div>
              <div className="px-4 py-2 border-r border-slate-400">
                <div className={microLabel}>Producto</div>
                <div className="text-2xl font-bold text-slate-900 leading-tight uppercase">{producto ? `${producto.code} · ${producto.name}` : (order.products?.name || '')}</div>
              </div>
              <div className="px-4 py-2 border-r border-slate-400">
                <div className={microLabel}>Cliente</div>
                <div className="text-base font-semibold text-slate-900 leading-tight uppercase">{order.client_name}</div>
              </div>
              <div className="px-6 py-2 text-center">
                <div className={microLabel}>Cantidad</div>
                <div className="text-3xl font-bold text-slate-900 leading-tight">{num(order.lot_quantity)}</div>
              </div>
            </div>
            {order.notes && (
              <div className="mb-3 flex items-baseline gap-2 text-sm">
                <span className={microLabel}>Observaciones</span>
                <span className="font-semibold text-slate-800 uppercase">{order.notes}</span>
              </div>
            )}

            {visibles.map((h, idx) => {
              const columnas = columnasDe(h)
              const antes = columnas.filter((c) => c.key === 'proceso' || c.key === 'material')
              const medio = columnas.filter((c) => c.key !== 'proceso' && c.key !== 'material' && c.key !== 'obs')
              const conObs = columnas.some((c) => c.key === 'obs')
              const total = antes.length + 2 + medio.length + nReg * 3 + (conObs ? 1 : 0)
              return (
                <div key={h.sectorId} className={`sector-block mt-5 ${h.rows.length <= 14 ? 'corto' : ''} ${separar && idx > 0 ? 'nuevo-pliego' : ''}`}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th colSpan={total} className="text-left px-2 py-1.5 border-2 border-slate-900 text-base font-bold tracking-[0.15em] text-slate-900">{h.sector.toUpperCase()}</th>
                      </tr>
                      <tr className="text-left">
                        {antes.map((c) => <th key={c.key} rowSpan={2} className={th}>{c.label}</th>)}
                        <th rowSpan={2} className={th}>{tituloNombre(h)}</th>
                        <th rowSpan={2} className={`${th} text-center`}>Cantidad</th>
                        {medio.map((c) => <th key={c.key} rowSpan={2} className={th}>{c.label}</th>)}
                        <th colSpan={nReg * 3} className={`${th} text-center`}>Registro por día o turno</th>
                        {conObs && <th rowSpan={2} className={th}>Observaciones</th>}
                      </tr>
                      <tr>
                        {Array.from({ length: nReg }).map((_, b) => (
                          <Fragment key={b}>
                            <th className="border border-slate-400 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-500" style={{ width: '16mm' }}>Fecha</th>
                            <th className="border border-slate-400 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-500" style={{ width: '13mm' }}>Cant.</th>
                            <th className="border border-slate-400 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-500" style={{ width: '26mm' }}>Operario</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="uppercase">
                      {h.rows.map((r) => (
                        <tr key={r.key} className="align-top" style={{ height: '10mm' }}>
                          {antes.map((c) => <td key={c.key} className="border border-slate-400 px-1.5 py-1" style={{ minWidth: '38mm' }}>{r.cells[c.key] || ''}</td>)}
                          <td className="border border-slate-400 px-1.5 py-1 font-semibold" style={{ minWidth: '34mm' }}>{r.nombre}</td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-bold text-base">{num(r.cantidad)}</td>
                          {medio.map((c) => {
                            if (c.key === 'diseno') return (
                              <td key={c.key} className="border border-slate-400 px-1.5 py-1 text-xs break-all normal-case" style={{ maxWidth: '45mm' }}>
                                {r.cells.diseno ? <a href={r.cells.diseno} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{r.cells.diseno}</a> : ''}
                                {r.cells.diseno_obs ? <div className="text-slate-500">{r.cells.diseno_obs}</div> : null}
                              </td>
                            )
                            return <td key={c.key} className="border border-slate-400 px-1.5 py-1">{r.cells[c.key] || ''}</td>
                          })}
                          {Array.from({ length: nReg * 3 }).map((_, k) => <td key={`b${k}`} className="border border-slate-400"></td>)}
                          {conObs && <td className="border border-slate-400" style={{ minWidth: '28mm' }}></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  if (!montado) return null
  return createPortal(contenido, document.body)
}
