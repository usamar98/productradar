export function GpuArt({ small = false }: { small?: boolean }) {
  return <div className={`gpu-stage ${small ? "gpu-stage-small" : ""}`} role="img" aria-label="Stylized illustration of a dual-fan graphics card">
    <div className="gpu-orbit orbit-one" /><div className="gpu-orbit orbit-two" /><div className="gpu-halo" />
    <div className="gpu-card"><div className="gpu-top-edge" /><div className="gpu-body"><div className="gpu-fan gpu-fan-one">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ transform: `rotate(${i * (360 / 11)}deg)` }} />)}<div className="fan-center" /></div><div className="gpu-spine"><span>GEFORCE RTX</span></div><div className="gpu-fan gpu-fan-two">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ transform: `rotate(${i * (360 / 11)}deg)` }} />)}<div className="fan-center" /></div></div><div className="gpu-bottom-edge"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="gpu-connector" /></div>
    <div className="gpu-caption"><span className="gpu-caption-line" /><span>FOUNDERS EDITION</span></div>
  </div>;
}
