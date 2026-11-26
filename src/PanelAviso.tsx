/** Lo que queda al costado cuando suena un temporizador o un recordatorio: qué es y el botón OK. */
export function PanelAviso({ tipo, texto, alOk }: { tipo: 'temporizador' | 'recordatorio'; texto: string; alOk: () => void }) {
  return (
    <div className="panel-aviso" role="alert">
      <p className="rotulo-aviso">{tipo === 'temporizador' ? '⏱ Temporizador' : '🔔 Recordatorio'}</p>
      <p className="titulo">{texto}</p>
      <button className="boton grande suave" onClick={alOk}>
        OK
      </button>
      <p className="chico pista">Decí «OK» o «apagá la alarma», o tocá el botón.</p>
    </div>
  )
}
