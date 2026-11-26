import { useState } from 'react'
import { claveImpresora } from './lib/fotos'
import { INFORME_VIGENTE_MS, ordenarPorRelevancia, resumenCorto, type EstadoImpresora, type InformeImpresoras } from './lib/impresoras'

const MAX_FILAS = 3 // lo que entra en la mitad de pantalla sin scroll

/**
 * Lo que queda al costado mientras la cara es una impresora: el texto del aviso y cómo está cada impresora.
 * Se cierra con "OK" (botón o voz) o solo a los 5 minutos (lo maneja App).
 */
export function PanelImpresora({
  texto,
  estado,
  informe,
  impresora,
  foto,
  soloUna,
  alOk,
}: {
  texto: string
  estado: EstadoImpresora
  informe: InformeImpresoras
  /** La impresora del aviso, si el agente la informa. */
  impresora?: string
  /** Dirección de la foto que llegó con el aviso, si hay. */
  foto?: string
  /** Mostrar solo la tarjeta de `impresora` (cuando la imagen ya ocupa lugar). */
  soloUna?: boolean
  alOk: () => void
}) {
  const [fotoRota, setFotoRota] = useState<string | null>(null)
  const conFoto = !!foto && foto !== fotoRota
  // Un informe viejo no se muestra: mejor nada que algo que puede ser falso.
  const vigente = informe.ts != null && Date.now() - informe.ts <= INFORME_VIGENTE_MS
  const lista = vigente ? ordenarPorRelevancia(informe.impresoras) : []
  // Con foto no queda lugar para todas: solo la tarjeta de la impresora del aviso (o la más relevante).
  const propia = impresora ? lista.find((p) => claveImpresora(p.nombre) === claveImpresora(impresora)) : undefined
  const unaSola = conFoto || soloUna
  const filas = unaSola ? (propia ?? lista[0] ? [propia ?? lista[0]] : []) : lista.slice(0, MAX_FILAS)
  const masOcultas = unaSola ? 0 : lista.length - filas.length

  return (
    <div className={`panel-imp${conFoto ? ' con-foto' : ''}`} data-estado={estado} role="alert">
      <p className="titulo">{texto}</p>

      {conFoto && <img className="foto-imp" src={foto} alt="Foto de la impresora" onError={() => setFotoRota(foto ?? null)} />}

      {filas.length > 0 && (
        <ul className="lista-imp">
          {filas.map((p) => (
            <li key={p.id ?? p.nombre} data-estado={p.estado}>
              <span className="nom">{p.nombre}</span>
              <span className="est">{resumenCorto(p)}</span>
              {p.progreso != null && p.estado === 'imprimiendo' && (
                <span className="barra" aria-hidden="true">
                  <i style={{ width: `${p.progreso}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {masOcultas > 0 && <p className="chico">+{masOcultas} más</p>}

      <button className="boton grande" onClick={alOk}>
        OK
      </button>
      {!conFoto && <p className="chico pista">Decí «OK» o tocá el botón. Se cierra solo a los 5 minutos.</p>}
    </div>
  )
}
