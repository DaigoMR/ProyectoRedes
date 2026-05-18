import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

// ── Loading / Error ──────────────────────────────────────────────────────────
function LoadingScreen() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 13 }}>
      CALCULANDO RETENCIÓN DE CLIENTES{".".repeat(dots)}
    </div>
  );
}

// ── Tooltips Blindados ───────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      <div className="label" style={{ fontWeight:600, marginBottom:4, color:"var(--text-primary)" }}>{d.score ?? d.name}</div>
      {d.ticket != null && <div style={{ color:"var(--text-secondary)" }}>Ticket prom.: <strong>R$ {Number(d.ticket).toFixed(2)}</strong></div>}
      {d.value  != null && <div style={{ color:"var(--text-secondary)" }}>Clientes: <strong>{Number(d.value).toLocaleString()}</strong></div>}
      {d.pct    != null && <div style={{ color:"var(--text-secondary)" }}>Porcentaje: <strong>{Number(d.pct).toFixed(1)}%</strong></div>}
    </div>
  );
};

// ── Label donut matemático ───────────────────────────────────────────────────
const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const pctValue = percent ? (percent * 100).toFixed(1) : 0;
  if (pctValue < 0.1) return null; // Oculta si el porcentaje es cero
  
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {pctValue}%
    </text>
  );
};

// ── Fila métrica del embudo ──────────────────────────────────────────────────
function MetricRow({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', serif", color: color || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function TabRetencion() {
  const [loading,       setLoading]       = useState(true);
  const [summary,       setSummary]       = useState({ retentionRate: 0, totalUniques: 0, recurrentes: 0 });
  const [retentionData, setRetentionData] = useState([]);
  const [scoreTicket,   setScoreTicket]   = useState([]);
  const [funnel,        setFunnel]        = useState({ totalOrders: 0, delivered: 0, totalReviews: 0, uniqueCustomers: 0, recurrentes: 0 });

  useEffect(() => {
    async function fetchRetencion() {
      try {
        setLoading(true);
        const res  = await fetch("http://localhost:8000/api/negocio/retencion");
        
        let data = {};
        if (res.ok) {
          data = await res.json();
        } else {
          console.warn("[TabRetencion] El backend respondió con error o no hay datos. Estructurando plantilla base.");
        }

        // ── 1. MAPEO CON RESPALDO: DONUT CLIENTES ÚNICOS VS RECURRENTES ──
        const rawRet = data.retention_data || data.retentionData || [];
        let normalizedRet = rawRet.map(item => ({
          name: item.name || item.tipo || "—",
          value: Number(item.value ?? item.cantidad ?? 0),
          pct: Number(item.pct ?? item.porcentaje ?? 0),
          color: item.color || "var(--accent)"
        }));

        if (normalizedRet.length === 0) {
          normalizedRet = [
            { name: "Clientes Únicos", value: 0, pct: 100, color: "#f06c6c" },
            { name: "Clientes Recurrentes", value: 0, pct: 0, color: "#5ecf8b" }
          ];
        }

        // ── 2. MAPEO CON RESPALDO: TICKET PROMEDIO POR SCORE ──
        const rawScore = data.score_ticket || data.scoreTicket || [];
        let normalizedScore = rawScore.map(item => ({
          score: item.score || item.calificacion || "—",
          ticket: Number(item.ticket ?? item.gasto_promedio ?? 0),
          color: item.color || "var(--accent)"
        }));

        if (normalizedScore.length === 0) {
          normalizedScore = [
            { score: "1 ★", ticket: 0, color: "#f06c6c" },
            { score: "2 ★", ticket: 0, color: "#e09a3a" },
            { score: "3 ★", ticket: 0, color: "#fbbf24" },
            { score: "4 ★", ticket: 0, color: "#6c8dfa" },
            { score: "5 ★", ticket: 0, color: "#5ecf8b" }
          ];
        }

        // ── 3. MAPEO CON RESPALDO: EMBUDO DE CONVERSIÓN ──
        const f = data.funnel || data.embudo || {};
        const normalizedFunnel = {
          totalOrders: Number(f.totalOrders ?? f.total_ordenes ?? 0),
          delivered: Number(f.delivered ?? f.entregadas ?? 0),
          totalReviews: Number(f.totalReviews ?? f.total_reseñas ?? 0),
          uniqueCustomers: Number(f.uniqueCustomers ?? f.clientes_unicos ?? 0),
          recurrentes: Number(f.recurrentes ?? f.clientes_recurrentes ?? 0)
        };

        // ── 4. MAPEO CON RESPALDO: OBJETO SUMMARY (KPIs) ──
        const s = data.summary || data.resumen || {};
        
        setRetentionData(normalizedRet);
        setScoreTicket(normalizedScore);
        setFunnel(normalizedFunnel);
        setSummary({
          retentionRate: Number(s.retentionRate ?? s.tasa_retencion ?? 0),
          totalUniques: Number(s.totalUniques ?? s.clientes_unicos_total ?? 0),
          recurrentes: Number(s.recurrentes ?? s.clientes_recurrentes_total ?? 0)
        });

      } catch (err) {
        console.error("[TabRetencion] Captura defensiva de error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRetencion();
  }, []);

  if (loading) return <LoadingScreen />;
  // Candado eliminado por completo para que nunca se quede trabado en la pantalla de error

  const ticket1 = scoreTicket.find(s => s.score === "1 ★" || s.score === "1");
  const ticket5 = scoreTicket.find(s => s.score === "5 ★" || s.score === "5");

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Retención <em>de Clientes</em></h1>
        <p className="page-subtitle">
          Análisis de clientes únicos vs recurrentes, ticket de compra por nivel de satisfacción
          y el embudo de conversión del negocio.
        </p>
      </div>

      {/* ── KPIs Dinámicos ── */}
      <div className="stat-row">
        <div className="stat-card" style={{ "--card-accent": "#f06c6c" }}>
          <div className="stat-label">Tasa de retención</div>
          <div className="stat-value">{summary.retentionRate}%</div>
          <div className="stat-sub">clientes que volvieron a comprar</div>
          <span className="stat-badge badge-bad">↓ Área de oportunidad</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#5ecf8b" }}>
          <div className="stat-label">Compradores únicos totales</div>
          <div className="stat-value">{summary.totalUniques?.toLocaleString()}</div>
          <div className="stat-sub">customer_unique_id distintos</div>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#f0b36c" }}>
          <div className="stat-label">Clientes recurrentes</div>
          <div className="stat-value">{summary.recurrentes?.toLocaleString()}</div>
          <div className="stat-sub">realizaron 2+ pedidos</div>
          <span className="stat-badge badge-warn">Alto LTV potencial</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#6c8dfa" }}>
          <div className="stat-label">Ticket clientes 1★</div>
          <div className="stat-value">R$ {ticket1 ? Math.round(ticket1.ticket) : "0"}</div>
          <div className="stat-sub">vs R$ {ticket5 ? Math.round(ticket5.ticket) : "0"} de clientes 5★</div>
          <span className="stat-badge badge-bad">⚠ Paradoja del ticket</span>
        </div>
      </div>

      <div className="charts-grid charts-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        
        {/* ── Donut retención ── */}
        <div className="chart-card">
          <div className="chart-title">Clientes únicos vs recurrentes</div>
          <div className="chart-desc">Del total de {summary.totalUniques?.toLocaleString()} compradores únicos identificados</div>
          <div style={{ display: "flex", alignItems: "center", justifyAround: "space-around", gap: 24, minHeight: 200 }}>
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={retentionData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  labelLine={false}
                  label={renderLabel}
                >
                  {retentionData.map((d, index) => (
                    <Cell key={`cell-${index}`} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ width: "45%" }}>
              {retentionData.map((d) => (
                <div key={d.name} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.name}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', serif", color: d.color, paddingLeft: 14 }}>
                    {d.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="insight" style={{ marginTop: 16 }}>
            <span className="insight-icon">💡</span>
            <span>
              <strong>{summary.retentionRate}% de tasa de retención activa.</strong> La retención es el mayor reto — capturar incluso un 5% más de recompra puede aumentar el revenue significativamente.
            </span>
          </div>
        </div>

        {/* ── Ticket por score ── */}
        <div className="chart-card">
          <div className="chart-title">Ticket promedio según calificación del cliente</div>
          <div className="chart-desc">¿Los clientes insatisfechos gastan más o menos?</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreTicket} margin={{ top: 8, right: 16, left: -15 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="score" tick={{ fontSize: 11 }} />
              <YAxis unit="R$" tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ticket" name="Ticket R$" radius={[4, 4, 0, 0]}>
                {scoreTicket.map((d, index) => (
                  <Cell key={`bar-${index}`} fill={d.color || "var(--accent)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="insight" style={{ marginTop: 16 }}>
            <span className="insight-icon">⚠️</span>
            <span>
              {ticket1 && ticket5 && ticket1.ticket > ticket5.ticket
                ? <><strong>Paradoja: clientes que dan 1★ gastan R$ {Math.round(ticket1.ticket)} en promedio</strong>, más que los de 5★ (R$ {Math.round(ticket5.ticket)}). Los pedidos de mayor valor generan expectativas más difíciles de cumplir.</>
                : <>El ticket promedio varía entre scores — analiza si hay correlación entre el valor del pedido y la insatisfacción.</>
              }
            </span>
          </div>
        </div>
      </div>

      {/* ── Embudo ── */}
      <div className="chart-card">
        <div className="chart-title">Embudo del negocio — conversión y retención</div>
        <div className="chart-desc">Del total de órdenes a clientes recurrentes activos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, padding: "8px 0" }}>
          <div>
            {[
              { label: "Total órdenes registradas", value: funnel.totalOrders?.toLocaleString(), sub: "volumen histórico completo", color: "var(--accent)" },
              { label: "Órdenes entregadas",         value: funnel.delivered?.toLocaleString(),   sub: `${funnel.totalOrders ? ((funnel.delivered / funnel.totalOrders) * 100).toFixed(1) : 0}% tasa de entrega exitosa`, color: "var(--accent-3)" },
              { label: "Reseñas recibidas",          value: funnel.totalReviews?.toLocaleString(), sub: `${funnel.totalOrders ? ((funnel.totalReviews / funnel.totalOrders) * 100).toFixed(1) : 0}% respondieron la encuesta`, color: "var(--accent)" },
              { label: "Compradores únicos",         value: funnel.uniqueCustomers?.toLocaleString(), sub: "sin duplicados por comprador", color: "var(--accent-4)" },
              { label: "Clientes recurrentes",       value: funnel.recurrentes?.toLocaleString(), sub: `${summary.retentionRate}% de retención activa`, color: "var(--accent-2)" },
            ].map((m) => (
              <MetricRow key={m.label} {...m} />
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              Oportunidades de mejora
            </div>
            {[
              { icon: "🎯", title: "Programa de fidelidad",        desc: "Un sistema de puntos podría duplicar la tasa de retención en 12 meses." },
              { icon: "📧", title: "Re-engagement a 30 días",       desc: "El mercado de clientes únicos que no volvió representa un enorme vector para campañas de retargeting." },
              { icon: "⭐", title: "Gestión de expectativas premium", desc: "Órdenes de alto valor generan más 1★. La comunicación proactiva puede mitigarlo." },
              { icon: "🚚", title: "Logística nordeste",            desc: "Mejorar CE/BA/RJ puede desbloquear retención en zonas con más retrasos." },
            ].map((o) => (
              <div key={o.title} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 18 }}>{o.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{o.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{o.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}