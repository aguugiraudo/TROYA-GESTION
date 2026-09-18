'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../components/AuthGate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type SubTab = 'manoDeObra' | 'externa' | 'datos'

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

function horasEntreHorarios(entrada: string, salida: string) {
  const [eh, em] = entrada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  const diff = (sh * 60 + sm) - (eh * 60 + em)
  if (diff <= 0) return null
  return Math.round((diff / 60) * 100) / 100
}

export default function TerciarizacionPage() {
  const { role } = useAuth()
  const canEdit = role === 'perfil_1' || role === 'perfil_2'
  const canSeeValores = role === 'perfil_1'

  const [subTab, setSubTab] = useState<SubTab>('manoDeObra')

  if (canSeeValores === false && subTab === 'datos') {
    // por si alguien sin permiso quedó con esta pestaña seleccionada de una sesión anterior
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Terciarización</h1>
      <p className="text-sm text-slate-500 mb-6">Mano de obra externa trabajando adentro, lotes enviados afuera, y el control de lo que se debe.</p>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        <button onClick={() => setSubTab('manoDeObra')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === 'manoDeObra' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          Mano de Obra Tercerizada
        </button>
        {canSeeValores && (
          <button onClick={() => setSubTab('externa')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === 'externa' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            Tercerización Externa
          </button>
        )}
        {canSeeValores && (
          <button onClick={() => setSubTab('datos')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === 'datos' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            Datos
          </button>
        )}
      </div>

      {subTab === 'manoDeObra' && <ManoDeObra canEdit={canEdit} mostrarValores={false} />}
      {subTab === 'externa' && canSeeValores && <Externa canEdit={canEdit} />}
      {subTab === 'datos' && canSeeValores && <ManoDeObra canEdit={canEdit} mostrarValores={true} externaResumen />}
    </main>
  )
}

// ============================================================
// SUBMÓDULO: Mano de Obra Tercerizada (y también "Datos" cuando mostrarValores=true)
// ============================================================
function ManoDeObra({ canEdit, mostrarValores, externaResumen }: { canEdit: boolean; mostrarValores: boolean; externaResumen?: boolean }) {
  const [terceros, setTerceros] = useState<any[]>([])
  const [procesos, setProcesos] = useState<any[]>([])
  const [valoresHora, setValoresHora] = useState<any[]>([])
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [monthValue, setMonthValue] = useState(currentMonthValue())

  const [showNewTercero, setShowNewTercero] = useState(false)
  const [newTerceroName, setNewTerceroName] = useState('')
  const [showNewProceso, setShowNewProceso] = useState(false)
  const [newProcesoName, setNewProcesoName] = useState('')

  const [fTercero, setFTercero] = useState('')
  const [fProceso, setFProceso] = useState('')
  const [fFecha, setFFecha] = useState(today())
  const [fEntrada, setFEntrada] = useState('')
  const [fSalida, setFSalida] = useState('')
  const [fHoras, setFHoras] = useState('')
  const [fObs, setFObs] = useState('')

  const [editingValor, setEditingValor] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'fecha' | 'proceso' | 'entrada' | 'salida' | 'horas' | 'obs' } | null>(null)
  const [showGestion, setShowGestion] = useState(false)

  const [externaTotal, setExternaTotal] = useState(0)

  async function fetchAll() {
    setLoading(true)
    const { data: tercerosData } = await supabase.from('terceros').select('*').eq('activo', true).order('nombre')
    setTerceros(tercerosData || [])
    const { data: procesosData } = await supabase.from('terceros_procesos').select('*').order('nombre')
    setProcesos(procesosData || [])

    if (mostrarValores) {
      const { data: valoresData } = await supabase.from('terceros_valores_hora').select('*')
      setValoresHora(valoresData || [])
    }

    const [y, m] = monthValue.split('-').map(Number)
    const monthStart = `${monthValue}-01`
    const monthEnd = new Date(y, m, 1).toISOString().split('T')[0]

    const { data: regData } = await supabase
      .from('terceros_registro_horas')
      .select('*, terceros(nombre), terceros_procesos(nombre)')
      .gte('fecha', monthStart).lt('fecha', monthEnd)
      .order('fecha', { ascending: false })
    setRegistros(regData || [])

    if (externaResumen) {
      const { data: tercData } = await supabase.from('tercerizaciones').select('cantidad_enviada, precio_unitario, fecha_envio')
      const totalExt = (tercData || [])
        .filter((t: any) => t.fecha_envio >= monthStart && t.fecha_envio < monthEnd)
        .reduce((s: number, t: any) => s + Number(t.cantidad_enviada) * Number(t.precio_unitario || 0), 0)
      setExternaTotal(totalExt)
    }

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [monthValue, mostrarValores])

  async function addTercero() {
    if (!newTerceroName.trim()) return
    const { error } = await supabase.from('terceros').insert({ nombre: newTerceroName.trim() })
    if (error) { alert('Error al agregar: ' + error.message); return }
    setNewTerceroName(''); setShowNewTercero(false)
    fetchAll()
  }

  async function addProceso() {
    if (!newProcesoName.trim()) return
    const { error } = await supabase.from('terceros_procesos').insert({ nombre: newProcesoName.trim() })
    if (error) { alert('Error al agregar: ' + error.message); return }
    setNewProcesoName(''); setShowNewProceso(false)
    fetchAll()
  }

  function onEntradaSalidaChange(entrada: string, salida: string) {
    setFEntrada(entrada); setFSalida(salida)
    if (entrada && salida) {
      const h = horasEntreHorarios(entrada, salida)
      if (h != null) setFHoras(String(h))
    }
  }

  function resetForm() {
    setFTercero(''); setFProceso(''); setFFecha(today()); setFEntrada(''); setFSalida(''); setFHoras(''); setFObs('')
  }

  async function registrarHoras() {
    if (!fTercero || !fProceso || !fHoras) {
      alert('Completá persona, proceso y horas (o entrada/salida).')
      return
    }
    const { error } = await supabase.from('terceros_registro_horas').insert({
      tercero_id: fTercero, proceso_id: fProceso, fecha: fFecha,
      hora_entrada: fEntrada || null, hora_salida: fSalida || null,
      horas: parseFloat(fHoras), observacion: fObs || null,
    })
    if (error) { alert('Error al registrar: ' + error.message); return }
    resetForm()
    fetchAll()
  }

  async function saveRegistroFecha(id: string, value: string) {
    await supabase.from('terceros_registro_horas').update({ fecha: value }).eq('id', id)
    setEditingCell(null)
    fetchAll()
  }

  async function saveRegistroProceso(id: string, procesoId: string) {
    await supabase.from('terceros_registro_horas').update({ proceso_id: procesoId }).eq('id', id)
    setEditingCell(null)
    fetchAll()
  }

  async function saveRegistroEntradaSalida(reg: any, entrada: string, salida: string) {
    const update: any = { hora_entrada: entrada || null, hora_salida: salida || null }
    if (entrada && salida) {
      const h = horasEntreHorarios(entrada, salida)
      if (h != null) update.horas = h
    }
    await supabase.from('terceros_registro_horas').update(update).eq('id', reg.id)
    setEditingCell(null)
    fetchAll()
  }

  async function saveRegistroHoras(id: string, value: string) {
    const horas = parseFloat(value || '0')
    if (!horas) { setEditingCell(null); return }
    await supabase.from('terceros_registro_horas').update({ horas }).eq('id', id)
    setEditingCell(null)
    fetchAll()
  }

  async function saveRegistroObs(id: string, value: string) {
    await supabase.from('terceros_registro_horas').update({ observacion: value.trim() || null }).eq('id', id)
    setEditingCell(null)
    fetchAll()
  }

  async function deleteRegistro(id: string) {
    if (!confirm('¿Eliminar este registro de horas?')) return
    await supabase.from('terceros_registro_horas').delete().eq('id', id)
    fetchAll()
  }

  async function togglePagado(reg: any) {
    await supabase.from('terceros_registro_horas').update({ pagado: !reg.pagado }).eq('id', reg.id)
    fetchAll()
  }

  function valorHoraFor(terceroId: string, procesoId: string) {
    const row = valoresHora.find((v) => v.tercero_id === terceroId && v.proceso_id === procesoId)
    return row ? Number(row.valor_hora) : null
  }

  async function saveValorHora(terceroId: string, procesoId: string, value: string) {
    const valor = parseFloat(value || '0')
    if (!valor) { setEditingValor(null); return }
    const existing = valoresHora.find((v) => v.tercero_id === terceroId && v.proceso_id === procesoId)
    if (existing) {
      await supabase.from('terceros_valores_hora').update({ valor_hora: valor }).eq('id', existing.id)
    } else {
      await supabase.from('terceros_valores_hora').insert({ tercero_id: terceroId, proceso_id: procesoId, valor_hora: valor })
    }
    setEditingValor(null)
    fetchAll()
  }

  const registrosPorTercero: Record<string, any[]> = {}
  registros.forEach((r) => {
    const nombre = r.terceros?.nombre || 'Sin nombre'
    if (!registrosPorTercero[nombre]) registrosPorTercero[nombre] = []
    registrosPorTercero[nombre].push(r)
  })

  function totalDelRegistro(r: any) {
    if (!mostrarValores) return null
    const valor = valorHoraFor(r.tercero_id, r.proceso_id)
    if (valor == null) return null
    return r.horas * valor
  }

  const totalGeneralPorTercero: Record<string, { horas: number; total: number; pagado: number; pendiente: number }> = {}
  Object.entries(registrosPorTercero).forEach(([nombre, regs]) => {
    let horas = 0, total = 0, pagado = 0
    regs.forEach((r) => {
      horas += r.horas
      const t = totalDelRegistro(r) ?? 0
      total += t
      if (r.pagado) pagado += t
    })
    totalGeneralPorTercero[nombre] = { horas, total, pagado, pendiente: total - pagado }
  })

  if (loading) return <p className="text-slate-500">Cargando...</p>

  return (
    <div>
      {mostrarValores && (
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium text-slate-700">Mes</label>
          <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
      )}

      {/* Formulario de registro diario */}
      {canEdit && !mostrarValores && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-3">Registrar horas de hoy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <select value={fTercero} onChange={(e) => setFTercero(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full">
              <option value="">Persona...</option>
              {terceros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select value={fProceso} onChange={(e) => setFProceso(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full">
              <option value="">Sector / Proceso...</option>
              {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Fecha</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Entrada</label>
              <input type="time" value={fEntrada} onChange={(e) => onEntradaSalidaChange(e.target.value, fSalida)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Salida</label>
              <input type="time" value={fSalida} onChange={(e) => onEntradaSalidaChange(fEntrada, e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Horas {fEntrada && fSalida ? '(calculado)' : ''}</label>
              <input type="number" value={fHoras} onChange={(e) => setFHoras(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-slate-500">Observación (opcional)</label>
            <input value={fObs} onChange={(e) => setFObs(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
          </div>
          <button onClick={registrarHoras} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            Registrar
          </button>
        </div>
      )}

      {/* Resumen del mes primero (lo más importante de un vistazo), en tabla prolija */}
      {mostrarValores && Object.keys(totalGeneralPorTercero).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6 overflow-x-auto">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Resumen del mes</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-slate-400 text-xs border-b border-slate-200">
                <th className="pb-2">Persona</th>
                <th className="pb-2 text-center">Horas</th>
                <th className="pb-2 text-right">Total generado</th>
                <th className="pb-2 text-right">Pagado</th>
                <th className="pb-2 text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(totalGeneralPorTercero).map(([nombre, info]) => (
                <tr key={nombre} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 font-medium text-slate-700">{nombre}</td>
                  <td className="py-2 text-center text-slate-500">{info.horas}</td>
                  <td className="py-2 text-right text-slate-700">${info.total.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right text-emerald-600">${info.pagado.toLocaleString('es-AR')}</td>
                  <td className={`py-2 text-right font-semibold ${info.pendiente > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    ${info.pendiente.toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {externaResumen && (
            <div className="mt-4 flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2.5">
              <span className="text-slate-600">+ Tercerización externa (envíos del mes)</span>
              <span className="text-slate-800 font-semibold">${externaTotal.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>
      )}

      {/* Valores hora, después del resumen — es configuración, no lo primero que hay que mirar */}
      {mostrarValores && terceros.length > 0 && procesos.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6 overflow-x-auto">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Valores hora ($/hora)</p>
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left text-slate-400 text-xs">
                <th className="p-2">Persona</th>
                {procesos.map((p) => <th key={p.id} className="p-2 text-center">{p.nombre}</th>)}
              </tr>
            </thead>
            <tbody>
              {terceros.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="p-2 font-medium text-slate-700">{t.nombre}</td>
                  {procesos.map((p) => {
                    const key = `${t.id}-${p.id}`
                    const valor = valorHoraFor(t.id, p.id)
                    return (
                      <td key={p.id} className="p-2 text-center">
                        {editingValor === key ? (
                          <input type="number" autoFocus defaultValue={valor ?? ''}
                            onBlur={(e) => saveValorHora(t.id, p.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="w-20 text-center rounded-md border border-blue-300 py-0.5 text-xs" />
                        ) : valor != null ? (
                          <button onClick={() => setEditingValor(key)} className="text-slate-700 font-medium hover:text-blue-600 hover:underline decoration-dotted">
                            ${valor.toLocaleString('es-AR')}
                          </button>
                        ) : (
                          <button onClick={() => setEditingValor(key)}
                            className="text-[11px] text-slate-400 border border-dashed border-slate-300 rounded-md px-2 py-0.5 hover:border-blue-300 hover:text-blue-600 transition-colors">
                            + definir
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alta de personas y procesos (colapsado por defecto, no es lo importante del día a día) */}
      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
          <button onClick={() => setShowGestion(!showGestion)} className="text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
            Gestionar personas y sectores
            <span className={`text-xs transition-transform ${showGestion ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {showGestion && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">Personas</p>
                <button onClick={() => setShowNewTercero(!showNewTercero)} className="text-xs text-blue-600 hover:underline">+ Agregar</button>
              </div>
              {showNewTercero && (
                <div className="flex gap-2 mb-2">
                  <input value={newTerceroName} onChange={(e) => setNewTerceroName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTercero() }}
                    placeholder="Nombre y apellido" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm flex-1" />
                  <button onClick={addTercero} className="text-xs bg-slate-700 text-white px-3 rounded-md hover:bg-slate-800">Agregar</button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {terceros.map((t) => <span key={t.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{t.nombre}</span>)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">Sectores / Procesos</p>
                <button onClick={() => setShowNewProceso(!showNewProceso)} className="text-xs text-blue-600 hover:underline">+ Agregar</button>
              </div>
              {showNewProceso && (
                <div className="flex gap-2 mb-2">
                  <input value={newProcesoName} onChange={(e) => setNewProcesoName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addProceso() }}
                    placeholder="Ej: Soldadura, General, Diseño" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm flex-1" />
                  <button onClick={addProceso} className="text-xs bg-slate-700 text-white px-3 rounded-md hover:bg-slate-800">Agregar</button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {procesos.map((p) => <span key={p.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{p.nombre}</span>)}
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Listado de registros */}
      <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Registros del mes</h2>
      {Object.keys(registrosPorTercero).length === 0 ? (
        <p className="text-slate-400 text-sm">Sin registros este mes.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(registrosPorTercero).map(([nombre, regs]) => (
            <div key={nombre} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <p className="text-sm font-medium text-slate-500 mb-2">{nombre}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs">
                      <th className="py-1">Fecha</th>
                      <th className="py-1">Proceso</th>
                      <th className="py-1 text-center">Entrada</th>
                      <th className="py-1 text-center">Salida</th>
                      <th className="py-1 text-center">Horas</th>
                      {mostrarValores && <th className="py-1 text-right">Total</th>}
                      {mostrarValores && <th className="py-1 text-center">Pagado</th>}
                      <th className="py-1">Obs.</th>
                      <th className="py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {regs.map((r) => {
                      const total = totalDelRegistro(r)
                      const isEditing = (field: string) => editingCell?.id === r.id && editingCell?.field === field
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-2 text-slate-500">
                            {canEdit && isEditing('fecha') ? (
                              <input type="date" autoFocus defaultValue={r.fecha}
                                onBlur={(e) => saveRegistroFecha(r.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                className="border border-blue-300 rounded-md px-1 py-0.5 text-xs w-28" />
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'fecha' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {shortDate(r.fecha)}
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-slate-700">
                            {canEdit && isEditing('proceso') ? (
                              <select autoFocus defaultValue={r.proceso_id}
                                onChange={(e) => saveRegistroProceso(r.id, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                className="border border-blue-300 rounded-md px-1 py-0.5 text-xs">
                                {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                              </select>
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'proceso' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {r.terceros_procesos?.nombre}
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-center text-slate-500">
                            {canEdit && isEditing('entrada') ? (
                              <input type="time" autoFocus defaultValue={r.hora_entrada ? r.hora_entrada.slice(0, 5) : ''}
                                onBlur={(e) => saveRegistroEntradaSalida(r, e.target.value, r.hora_salida ? r.hora_salida.slice(0, 5) : '')}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                className="border border-blue-300 rounded-md px-1 py-0.5 text-xs w-24" />
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'entrada' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {r.hora_entrada ? r.hora_entrada.slice(0, 5) : '—'}
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-center text-slate-500">
                            {canEdit && isEditing('salida') ? (
                              <input type="time" autoFocus defaultValue={r.hora_salida ? r.hora_salida.slice(0, 5) : ''}
                                onBlur={(e) => saveRegistroEntradaSalida(r, r.hora_entrada ? r.hora_entrada.slice(0, 5) : '', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                className="border border-blue-300 rounded-md px-1 py-0.5 text-xs w-24" />
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'salida' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {r.hora_salida ? r.hora_salida.slice(0, 5) : '—'}
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-center font-medium text-slate-700">
                            {canEdit && isEditing('horas') ? (
                              <input type="number" autoFocus defaultValue={r.horas}
                                onBlur={(e) => saveRegistroHoras(r.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                className="border border-blue-300 rounded-md px-1 py-0.5 text-xs w-16 text-center" />
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'horas' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {r.horas}
                              </button>
                            )}
                          </td>
                          {mostrarValores && <td className="py-2 text-right text-slate-700">{total != null ? `$${total.toLocaleString('es-AR')}` : '—'}</td>}
                          {mostrarValores && (
                            <td className="py-2 text-center">
                              <input type="checkbox" checked={r.pagado} onChange={() => togglePagado(r)} className="w-4 h-4 accent-emerald-600" />
                            </td>
                          )}
                          <td className="py-2 text-slate-500 italic">
                            {canEdit && isEditing('obs') ? (
                              <input autoFocus defaultValue={r.observacion || ''}
                                onBlur={(e) => saveRegistroObs(r.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                placeholder="Obs." className="border border-blue-300 rounded-md px-1 py-0.5 text-xs w-32" />
                            ) : (
                              <button onClick={() => canEdit && setEditingCell({ id: r.id, field: 'obs' })} disabled={!canEdit}
                                className={canEdit ? 'hover:underline decoration-dotted' : ''}>
                                {r.observacion || (canEdit ? '+ obs.' : '—')}
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {canEdit && <button onClick={() => deleteRegistro(r.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// SUBMÓDULO: Tercerización Externa (con entregas parciales)
// ============================================================
function Externa({ canEdit }: { canEdit: boolean }) {
  const [innerTab, setInnerTab] = useState<'afuera' | 'nueva' | 'reporte'>('afuera')

  const [sectors, setSectors] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [progressRows, setProgressRows] = useState<any[]>([])
  const [tercerizaciones, setTercerizaciones] = useState<any[]>([])
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  const [recibirModal, setRecibirModal] = useState<any | null>(null)
  const [recibirCantidad, setRecibirCantidad] = useState('')
  const [recibirFecha, setRecibirFecha] = useState(today())

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

    const tercIds = (tercData || []).map((t: any) => t.id)
    if (tercIds.length > 0) {
      const { data: recData } = await supabase.from('tercerizacion_recepciones').select('*').in('tercerizacion_id', tercIds)
      setRecepciones(recData || [])
    } else {
      setRecepciones([])
    }

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  function recibidoAcumulado(tercerizacionId: string) {
    return recepciones.filter((r) => r.tercerizacion_id === tercerizacionId).reduce((s, r) => s + Number(r.cantidad_recibida), 0)
  }

  const filteredOrders = fOrderSearch.length > 0
    ? orders.filter((o) => o.order_number.toLowerCase().includes(fOrderSearch.toLowerCase()) || o.products?.name?.toLowerCase().includes(fOrderSearch.toLowerCase()))
    : orders

  function pickOrder(o: any) {
    setFOrder(o); setFOrderSearch(`#${o.order_number} — ${o.products?.name}`); setFOrderShowList(false)
    setFSector(''); setFComponent('')
  }

  const rowsForOrderSector = (fOrder && fSector) ? progressRows.filter((r) => r.order_id === fOrder.id && r.sector_id === fSector) : []
  const needsComponent = rowsForOrderSector.length > 1 || (rowsForOrderSector[0]?.target_type === 'component')
  const selectedRow = needsComponent ? rowsForOrderSector.find((r) => r.component_id === fComponent) : rowsForOrderSector[0]

  const enviadoNoRecibido = selectedRow
    ? tercerizaciones
        .filter((t) => t.order_id === fOrder?.id && t.sector_id === fSector && (t.component_id || null) === (fComponent || null))
        .reduce((sum, t) => sum + (Number(t.cantidad_enviada) - recibidoAcumulado(t.id)), 0)
    : 0
  const pendienteReal = selectedRow ? Math.max(0, selectedRow.quantity_required - selectedRow.quantity_completed - enviadoNoRecibido) : null

  function resetForm() {
    setFOrderSearch(''); setFOrder(null); setFSector(''); setFComponent('')
    setFProveedor(''); setFCantidad(''); setFPrecioUnitario(''); setFFecha(today()); setFNotas('')
  }

  async function crearTercerizacion() {
    if (!fOrder || !fSector || !fProveedor.trim() || !fCantidad) { alert('Completá OP, sector, proveedor y cantidad.'); return }
    if (needsComponent && !fComponent) { alert('Este sector tiene componentes — elegí cuál.'); return }
    const cantidad = parseFloat(fCantidad)
    if (pendienteReal != null && cantidad > pendienteReal) {
      const proceed = confirm(`Esa OP solo tiene ${pendienteReal} unidades pendientes en este sector. ¿Enviar igual ${cantidad}?`)
      if (!proceed) return
    }
    const { error } = await supabase.from('tercerizaciones').insert({
      order_id: fOrder.id, sector_id: fSector, component_id: needsComponent ? fComponent : null,
      proveedor_nombre: fProveedor.trim(), cantidad_enviada: cantidad,
      precio_unitario: fPrecioUnitario ? parseFloat(fPrecioUnitario) : null,
      fecha_envio: fFecha, notas: fNotas || null,
    })
    if (error) { alert('Error al registrar: ' + error.message); return }
    resetForm(); setInnerTab('afuera'); fetchAll()
  }

  function openRecibir(t: any) {
    setRecibirModal(t)
    setRecibirCantidad(String(Number(t.cantidad_enviada) - recibidoAcumulado(t.id)))
    setRecibirFecha(today())
  }

  async function confirmarRecibido() {
    if (!recibirModal) return
    const cantidad = parseFloat(recibirCantidad || '0')
    if (!cantidad || cantidad <= 0) { alert('Ingresá una cantidad válida.'); return }
    const yaRecibido = recibidoAcumulado(recibirModal.id)
    const restante = Number(recibirModal.cantidad_enviada) - yaRecibido
    if (cantidad > restante) {
      const proceed = confirm(`Solo quedan ${restante} unidades pendientes de este envío. ¿Registrar igual ${cantidad}?`)
      if (!proceed) return
    }

    const { error: e1 } = await supabase.from('tercerizacion_recepciones').insert({
      tercerizacion_id: recibirModal.id, fecha: recibirFecha, cantidad_recibida: cantidad,
    })
    if (e1) { alert('Error al registrar la recepción: ' + e1.message); return }

    const { data: progressRow } = await supabase
      .from('order_component_progress').select('id, quantity_completed')
      .eq('order_id', recibirModal.order_id).eq('sector_id', recibirModal.sector_id)
      .eq('component_id', recibirModal.component_id ?? null).maybeSingle()
    if (progressRow) {
      await supabase.from('order_component_progress').update({ quantity_completed: progressRow.quantity_completed + cantidad }).eq('id', progressRow.id)
    }

    setRecibirModal(null)
    fetchAll()
  }

  async function eliminarTercerizacion(id: string) {
    if (!confirm('¿Eliminar este registro y sus entregas? Esto NO revierte el avance que ya se sumó a la OP.')) return
    await supabase.from('tercerizaciones').delete().eq('id', id)
    fetchAll()
  }

  const afuera = tercerizaciones.filter((t) => (Number(t.cantidad_enviada) - recibidoAcumulado(t.id)) > 0)
  const totalAfueraValor = afuera.reduce((s, t) => s + (Number(t.cantidad_enviada) - recibidoAcumulado(t.id)) * Number(t.precio_unitario || 0), 0)

  const [ry, rm] = reporteMonth.split('-').map(Number)
  const reporteStart = `${reporteMonth}-01`
  const reporteEnd = new Date(ry, rm, 1).toISOString().split('T')[0]
  const enviosDelMes = tercerizaciones.filter((t) => t.fecha_envio >= reporteStart && t.fecha_envio < reporteEnd)
  const totalMesCantidad = enviosDelMes.reduce((s, t) => s + Number(t.cantidad_enviada), 0)
  const totalMesValor = enviosDelMes.reduce((s, t) => s + Number(t.cantidad_enviada) * Number(t.precio_unitario || 0), 0)

  if (loading) return <p className="text-slate-500">Cargando...</p>

  return (
    <div>
      <div className="flex gap-1 mb-6">
        {([['afuera', 'Actualmente afuera'], ['nueva', 'Nuevo envío'], ['reporte', 'Reporte mensual']] as [typeof innerTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setInnerTab(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${innerTab === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {innerTab === 'afuera' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Envíos pendientes de recibir</p>
              <p className="text-3xl font-semibold text-slate-800 mt-1">{afuera.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-sm text-slate-500">Valor pendiente de recibir</p>
              <p className="text-3xl font-semibold text-emerald-700 mt-1">${totalAfueraValor.toLocaleString('es-AR')}</p>
            </div>
          </div>

          {afuera.length === 0 ? <p className="text-slate-400 text-sm">No hay nada afuera en este momento.</p> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left">
                    <th className="p-3 font-medium">OP / Producto</th>
                    <th className="p-3 font-medium">Sector</th>
                    <th className="p-3 font-medium">Proveedor</th>
                    <th className="p-3 font-medium text-center">Enviado</th>
                    <th className="p-3 font-medium text-center">Recibido</th>
                    <th className="p-3 font-medium text-center">Pendiente</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {afuera.map((t) => {
                    const recibido = recibidoAcumulado(t.id)
                    const pendiente = Number(t.cantidad_enviada) - recibido
                    return (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="p-3 text-slate-700">
                          <div className="text-xs text-slate-400">#{t.orders?.order_number}</div>
                          {t.orders?.products?.name}
                        </td>
                        <td className="p-3 text-slate-600">{t.sectors?.name}{t.components?.name ? ` — ${t.components.name}` : ''}</td>
                        <td className="p-3 text-slate-600">{t.proveedor_nombre}</td>
                        <td className="p-3 text-center text-slate-500">{t.cantidad_enviada}</td>
                        <td className="p-3 text-center text-slate-500">{recibido || '—'}</td>
                        <td className="p-3 text-center text-amber-600 font-semibold">{pendiente}</td>
                        <td className="p-3 text-right">
                          {canEdit && (
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => openRecibir(t)} className="text-xs text-emerald-600 hover:underline font-medium">Registrar entrega</button>
                              <button onClick={() => eliminarTercerizacion(t.id)} className="text-xs text-rose-500 hover:underline">Eliminar</button>
                            </div>
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

      {innerTab === 'nueva' && canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 max-w-2xl">
          <div className="relative min-w-0 mb-3">
            <label className="text-xs text-slate-500">OP</label>
            <input placeholder="Buscar por N° OP o producto..." value={fOrderSearch}
              onChange={(e) => { setFOrderSearch(e.target.value); setFOrder(null); setFOrderShowList(true) }}
              onFocus={() => setFOrderShowList(true)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            {fOrderShowList && fOrderSearch.length > 0 && !fOrder && (
              <div className="absolute z-20 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                {filteredOrders.length === 0 ? <div className="p-2 text-xs text-slate-400">Sin resultados</div> : filteredOrders.map((o) => (
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
                <select value={fComponent} onChange={(e) => setFComponent(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1">
                  <option value="">Elegí componente...</option>
                  {rowsForOrderSector.map((r) => <option key={r.component_id} value={r.component_id}>{r.component_name}</option>)}
                </select>
              </div>
            ) : <div />}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Proveedor</label>
              <input value={fProveedor} onChange={(e) => setFProveedor(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Cantidad {pendienteReal != null && <span className="text-slate-400">(pendiente: {pendienteReal} u.)</span>}</label>
              <input type="number" value={fCantidad} onChange={(e) => setFCantidad(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Precio por unidad (opcional)</label>
              <input type="number" value={fPrecioUnitario} onChange={(e) => setFPrecioUnitario(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Fecha de envío</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500">Notas (opcional)</label>
            <input value={fNotas} onChange={(e) => setFNotas(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
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

      {innerTab === 'reporte' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium text-slate-700">Mes</label>
            <input type="month" value={reporteMonth} onChange={(e) => setReporteMonth(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
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
                    <th className="p-3 font-medium text-center">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {enviosDelMes.map((t) => {
                    const recibido = recibidoAcumulado(t.id)
                    return (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="p-3 text-slate-500">{shortDate(t.fecha_envio)}</td>
                        <td className="p-3 text-slate-700">#{t.orders?.order_number} — {t.orders?.products?.name}</td>
                        <td className="p-3 text-slate-600">{t.proveedor_nombre}</td>
                        <td className="p-3 text-center">{t.cantidad_enviada}</td>
                        <td className="p-3 text-center">{recibido || '—'}</td>
                        <td className="p-3 text-center">{Number(t.cantidad_enviada) - recibido > 0 ? Number(t.cantidad_enviada) - recibido : <span className="text-emerald-600">✓</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {recibirModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRecibirModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 text-lg mb-1">Registrar entrega de {recibirModal.proveedor_nombre}</h3>
            <p className="text-sm text-slate-500 mb-4">
              #{recibirModal.orders?.order_number} — {recibirModal.orders?.products?.name} — {recibirModal.sectors?.name}
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Enviado: {recibirModal.cantidad_enviada} — Ya recibido: {recibidoAcumulado(recibirModal.id)} — Pendiente: {Number(recibirModal.cantidad_enviada) - recibidoAcumulado(recibirModal.id)}
            </p>
            <div className="mb-3">
              <label className="text-xs text-slate-500">Cantidad que te entregan ahora</label>
              <input type="number" value={recibirCantidad} onChange={(e) => setRecibirCantidad(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <div className="mb-4">
              <label className="text-xs text-slate-500">Fecha</label>
              <input type="date" value={recibirFecha} onChange={(e) => setRecibirFecha(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full mt-1" />
            </div>
            <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5 mb-4">
              Si todavía queda algo pendiente después de esta entrega, sigue apareciendo en "Actualmente afuera" — no se pierde.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRecibirModal(null)} className="flex-1 border border-slate-300 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmarRecibido} className="flex-1 bg-emerald-600 text-white rounded-md py-2 text-sm font-medium hover:bg-emerald-700">Confirmar entrega</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
