import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Loading Screen ──────────────────────────────────────────────────────────
function LoadingScreen() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>
      ANALIZANDO SATISFACCIÓN Y ENTREGAS REALES{".".repeat(dots)}
    </div>
  );
}

// ── Tooltips Blindados contra Errores de Renderizado ─────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      <div className="label" style={{ fontWeight:600, marginBottom:4, color:"var(--text-primary)" }}>Estado: {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--text-primary)", marginBottom:2 }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const StateTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      <div className="label" style={{ fontWeight:600, marginBottom:4, color:"var(--text-primary)" }}>Estado: {d.state}</div>
      <div style={{ color:"var(--text-secondary)" }}>Entregas tardías: <strong>{Number(d.latePct).toFixed(1)}%</strong></div>
      <div style={{ color:"var(--text-secondary)" }}>Score promedio: <strong>{Number(d.avgScore).toFixed(2)} ⭐</strong></div>
      {d.orders != null && <div style={{ color:"var(--text-muted)", fontSize:10, marginTop:4 }}>Muestra: {d.orders} órdenes</div>}
    </div>
  );
};

// ── Barra horizontal de score ────────────────────────────────────────────────
function ScoreBar({ label, score, color, count }) {
  const numScore = Number(score) || 0;
  const numCount = Number(count) || 0;

  return (
    <div style={{ marginBottom: 14, background: "rgba(255,255,255,0.01)", padding: "4px 8px", borderRadius: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {label}
          {numCount > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
              ({numCount.toLocaleString()} analizadas)
            </span>
          )}
        </span>
        <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "var(--text-primary)", fontWeight: 600 }}>
          {numScore > 0 ? `${numScore.toFixed(2)} / 5` : "0.00 / 5"}
        </span>
      </div>
      <div className="h-bar-track" style={{ background: "rgba(255,255,255,0.06)", height: 6, borderRadius: 3, overflow: "hidden" }}>
        <div
          className="h-bar-fill"
          style={{ 
            width: `${Math.min(100, Math.max(0, (numScore / 5) * 100))}%`, 
            background: color || "var(--accent)", 
            height: "100%", 
            borderRadius: 3, 
            transition: "width 0.5s ease-in-out" 
          }}
        />
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function TabSatisfaccion() {
  const [loading,      setLoading]      = useState(true);
  const [summary,      setSummary]      = useState({
    avgScoreGlobal: 0, onTimePct: 0, scoreDrop: 1.2, worstState: "—", worstLatePct: 0
  });
  const [delayVsScore, setDelayVsScore] = useState([]);
  const [stateData,    setStateData]    = useState([]);

  useEffect(() => {
    async function fetchSatisfaccion() {
      try {
        setLoading(true);
        const res = await fetch("/api/negocio/satisfaccion");
        if (!res.ok) throw new Error("Backend no disponible");
        const data = await res.json();

        // ── 1. MAPEO BUCKETS DE RETRASO VS SCORE ──
        const rawDelay = data.delay_vs_score || [];
        const normalizedDelay = rawDelay.map(item => ({
          bucket: item.bucket || "Desconocido",
          score: Number(item.score ?? 0),
          color: item.color || "#5ecf8b",
          count: Number(item.count ?? 0)
        }));

        // ── 2. CONEXIÓN REAL CON TU API: Sintonizamos con 'state_delivery_satisfaction' ──
        const rawState = data.state_delivery_satisfaction || data.state_data || [];
        const normalizedState = rawState.map(item => ({
          state: item.state || "—",
          latePct: Number(item.latePct ?? item.late_pct ?? 0),
          avgScore: Number(item.avgScore ?? item.avg_score ?? 0),
          orders: Number(item.orders ?? 0)
        }));

        setDelayVsScore(normalizedDelay);
        setStateData(normalizedState);
        
        // ── 3. MAPEO OBJETO SUMMARY ──
        const s = data.summary || {};
        setSummary({
          avgScoreGlobal: Number(s.avgScoreGlobal ?? 0),
          onTimePct: Number(s.onTimePct ?? 0),
          scoreDrop: Number(s.scoreDrop ?? 1.2),
          worstState: s.worstState || "—",
          worstLatePct: Number(s.worstLatePct ?? 0)
        });

      } catch (err) {
        console.error("[TabSatisfaccion] Error mapeando analítica de logística:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSatisfaccion();
  }, []);

  if (loading) return <LoadingScreen />;

  // Ordenamos de mayor a menor porcentaje de retraso operativo para la gráfica vertical
  const sortedByLate = [...stateData].sort((a, b) => b.latePct - a.latePct);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Satisfacción &amp; <em>Entregas Reales</em></h1>
        <p className="page-subtitle">
          Análisis real extraído de Supabase sobre la degradación de estrellas en relación a las demoras logísticas.
        </p>
      </div>

      {/* ── KPIs Dinámicos ── */}
      <div className="stat-row">
        <div className="stat-card" style={{ "--card-accent": "#5ecf8b" }}>
          <div className="stat-label">Score promedio global</div>
          <div className="stat-value">{summary.avgScoreGlobal.toFixed(2)} ★</div>
          <div className="stat-sub">Calificación media de reseñas</div>
          <span className="stat-badge badge-good">Métrica de Supabase</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#6c8dfa" }}>
          <div className="stat-label">Entregas a tiempo</div>
          <div className="stat-value">{summary.onTimePct}%</div>
          <div className="stat-sub">Cumplimiento de ventana estimada</div>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#f0b36c" }}>
          <div className="stat-label">Caída de score con retraso</div>
          <div className="stat-value">−{summary.scoreDrop}</div>
          <div className="stat-sub">Estrellas perdidas por demerito logístico</div>
          <span className="stat-badge badge-bad">↓ Impacto Crítico</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#f06c6c" }}>
          <div className="stat-label">Estado con más demerito</div>
          <div className="stat-value">{summary.worstState}</div>
          <div className="stat-sub">{summary.worstLatePct}% de órdenes retrasadas</div>
          <span className="stat-badge badge-bad">⚠ Foco Rojo</span>
        </div>
      </div>

      <div className="charts-grid charts-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        
        {/* ── Score por bucket de retraso ── */}
        <div className="chart-card">
          <div className="chart-title">Impacto del retraso en la calificación</div>
          <div className="chart-desc">Score promedio de reseña según días de demora en entrega</div>
          <div style={{ marginTop: 16 }}>
            {delayVsScore.map((d, index) => (
              <ScoreBar
                key={d.bucket || index}
                label={d.bucket}
                score={d.score}
                color={d.color}
                count={d.count}
              />
            ))}
          </div>
          <div className="insight" style={{ marginTop: 16 }}>
            <span className="insight-icon">💡</span>
            <span>
              <strong>Una entrega retrasada erosiona el NPS</strong>. El salto entre la entrega a tiempo y los primeros días de demora reduce la calificación media por un factor de <strong style={{color:"#f0b36c"}}>{summary.scoreDrop}</strong> puntos en tu ecosistema.
            </span>
          </div>
        </div>

        {/* ── % tardías por estado ── */}
        <div className="chart-card">
          <div className="chart-title">% de entregas tardías por estado</div>
          <div className="chart-desc">Estados ordenados de mayor a menor porcentaje de retraso operativo</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sortedByLate} layout="vertical" margin={{ left: 8, right: 16, bottom: 0, top: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={28} />
              <Tooltip content={<StateTooltip />} />
              <Bar dataKey="latePct" radius={[0, 4, 4, 0]} name="% Retraso">
                {sortedByLate.map((d, index) => (
                  <Cell
                    key={`cell-satisfaccion-late-${index}`}
                    fill={d.latePct > 15 ? "#f06c6c" : d.latePct > 10 ? "#f0b36c" : "#5ecf8b"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Correlación tardías vs score ── */}
      <div className="chart-card">
        <div className="chart-title">Correlación: entregas tardías vs satisfacción por estado</div>
        <div className="chart-desc">
          Eje izquierdo (% barras rojas) frente a Eje derecho (Calificación estrellas azules)
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stateData} margin={{ top: 16, right: 16, bottom: 8, left: -10 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="state" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" domain={[0, 'auto']} unit="%" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" domain={[1, 5]} tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="left"  dataKey="latePct"  name="% tardías" fill="#f06c6c" opacity={0.8} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="avgScore" name="Score ★"   fill="#6c8dfa" opacity={0.8} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="insight" style={{ marginTop: 16 }}>
          <span className="insight-icon">📊</span>
          <span>
            <strong>{summary.worstState}</strong> registra una de las tasas de incumplimiento más elevadas ({Number(summary.worstLatePct).toFixed(1)}%). Los gráficos confirman visualmente la hipótesis: a mayor tamaño de barra roja (% de retraso), menor es la altura de la barra azul (calificación de estrellas).
          </span>
        </div>
      </div>
    </div>
  );
}