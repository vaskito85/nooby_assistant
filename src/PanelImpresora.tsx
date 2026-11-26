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
  alOk,
}: {
  texto: string
  estado: EstadoImpresora
  informe: InformeImpresoras
  alOk: () => void
}) {
  // Un informe viejo no se muestra: mejor nada que algo que puede ser falso.
  const vigente = informe.ts != null && Date.now() - informe.ts <= INFORME_VIGENTE_MS
  const lista = vigente ? ordenarPorRelevancia(informe.impresoras) : []
  const filas = lista.slice(0, MAX_FILAS)
  const masOcultas = lista.length - filas.length

  return (
    <div className="panel-imp" data-estado={estado} role="alert">
      <p className="titulo">{texto}</p>

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
      <p className="chico pista">Decí «OK» o tocá el botón. Se cierra solo a los 5 minutos.</p>
    </div>
  )
}
