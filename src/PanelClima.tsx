import type { Clima } from './lib/clima'
import { capitalizar } from './lib/escenas'

/**
 * Lo que queda al costado mientras la cara es un dibujo del tiempo: la ciudad, la temperatura grande y los datos del día.
 * Se cierra con "OK" (botón o voz) o solo a los 5 minutos (lo maneja App).
 */
export function PanelClima({ ciudad, clima, alOk }: { ciudad: string; clima: Clima; alOk: () => void }) {
  return (
    <div className="panel-clima" role="status">
      <p className="ciudad">{ciudad}</p>
      <p className="temp">{clima.temp}°</p>
      <p className="desc">{capitalizar(clima.descripcion)}</p>
      <p className="detalle">
        Sensación {clima.sensacion}° · Mín {clima.min}° · Máx {clima.max}°
      </p>
      <p className="detalle">Probabilidad de lluvia: {clima.lluvia} %</p>
      <button className="boton grande suave" onClick={alOk}>
        OK
      </button>
    </div>
  )
}
