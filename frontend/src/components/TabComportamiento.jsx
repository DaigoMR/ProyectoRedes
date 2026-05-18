import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ── Tooltips Personalizados para las Gráficas ───────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      <div className="label" style={{ color:"var(--text-muted)", marginBottom:4 }}>Estado: {d.state}</div>
      <div style={{ color: "var(--text-primary)" }}>
        Ticket Promedio: <strong>R$ {Number(d.ticket).toFixed(2)}</strong>
      </div>
    </div>
  );
};

const AreaTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      <div className="label" style={{ color:"var(--text-muted)", marginBottom:4 }}>Mes: {d.mes}</div>
      <div style={{ color: "#6c8dfa" }}>Órdenes: <strong>{Number(d.orders).toLocaleString()}</strong></div>
    </div>
  );
};

// ── Componente Principal ────────────────────────────────────────────────────
export default function TabComportamiento() {
  const [loading, setLoading] = useState(true);
  
  // Estados para albergar la analítica real calculada por la Base de Datos
  const [statsGlobales, setStatsGlobales] = useState({
    totalOrders: 0,
    avgTicket: 0,
    avgFreight: 0,
    peakMonthName: "—",
    peakMonthOrders: 0
  });
  const [monthlyOrders, setMonthlyOrders] = useState([]);
  const [stateTicket, setStateTicket] = useState([]);

  useEffect(() => {
    async function consumirAnaliticaReal() {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:8000/api/negocio/comportamiento-compra");
        
        let data = {};
        if (res.ok) {
          data = await res.json();
        } else {
          console.warn("[TabComportamiento] El backend respondió con error o no hay datos. Estructurando plantilla en cero.");
        }

        // ── 1. MAPEO CON RESPALDO: VOLUMEN TEMPORAL REAL (GRÁFICO DE ÁREA) ──
        const rawMonthly = data.monthly_orders || data.monthlyOrders || data.ordenes_mensuales || [];
        let normalizedMonthly = rawMonthly.map(item => ({
          mes: item.mes || item.month || item.periodo || "—",
          orders: Number(item.orders ?? item.ordenes ?? item.cantidad ?? 0)
        }));

        if (normalizedMonthly.length === 0) {
          // Línea temporal vacía de muestra
          normalizedMonthly = [
            { mes: "Ene", orders: 0 }, { mes: "Feb", orders: 0 }, { mes: "Mar", orders: 0 },
            { mes: "Abr", orders: 0 }, { mes: "May", orders: 0 }, { mes: "Jun", orders: 0 }
          ];
        }

        // ── 2. MAPEO CON RESPALDO: COMPORTAMIENTO GEOGRÁFICO REAL (BARRAS) ──
        const rawState = data.state_ticket || data.stateTicket || data.datos_estados || [];
        let normalizedState = rawState.map(item => ({
          state: item.state || item.estado || "—",
          ticket: Number(item.ticket ?? item.ticket_promedio ?? item.avg_ticket ?? 0),
          freight: Number(item.freight ?? item.porcentaje_flete ?? item.avg_freight_pct ?? 0)
        }));

        if (normalizedState.length === 0) {
          // Estados de muestra en cero para pintar el cascarón de los ejes
          normalizedState = [
            { state: "SP", ticket: 0, freight: 0 },
            { state: "MG", ticket: 0, freight: 0 },
            { state: "RJ", ticket: 0, freight: 0 }
          ];
        }

        // ── 3. MAPEO CON RESPALDO: OBJETO SUMMARY (KPIs) ──
        const s = data.summary || data.resumen || {};

        setMonthlyOrders(normalizedMonthly);
        setStateTicket(normalizedState);
        setStatsGlobales({
          totalOrders: Number(s.totalOrders ?? s.total_orders ?? s.total_ordenes ?? 0),
          avgTicket: Number(s.avgTicket ?? s.avg_ticket ?? s.ticket_promedio ?? 0),
          avgFreight: Number(s.avgFreight ?? s.avg_freight ?? s.porcentaje_flete_global ?? 0),
          peakMonthName: s.peakMonthName || s.peak_month_name || s.mes_pico || "—",
          peakMonthOrders: Number(s.peakMonthOrders ?? s.peak_month_orders ?? s.ordenes_mes_pico ?? 0)
        });

      } catch (err) {
        console.error("[FRONTEND ERROR] Fallo defensivo mapeando comportamiento de compra:", err);
      } finally {
        setLoading(false);
      }
    }
    consumirAnaliticaReal();
  }, []);

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:400, color:"var(--text-muted)", fontFamily:"'DM Mono',monospace", fontSize:13 }}>
        PROCESANDO ANALÍTICA DESDE SUPABASE...
      </div>
    );
  }

  // Eliminado por completo el filtro ErrorScreen para forzar visualización del cascarón
  const sortedByFreight = [...stateTicket].sort((a, b) => b.freight - a.freight);

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <h1 className="page-title">Comportamiento <em>de Compra Real</em></h1>
        <p className="page-subtitle">
          Tendencia calculada dinámicamente en base a las filas cargadas en tus tablas de Supabase.
        </p>
      </div>

      {/* ── KPIs Dinámicos ── */}
      <div className="stat-row">
        <div className="stat-card" style={{ "--card-accent": "#6c8dfa" }}>
          <div className="stat-label">Total órdenes analizadas</div>
          <div className="stat-value">{statsGlobales.totalOrders.toLocaleString()}</div>
          <div className="stat-sub">Registros reales en DB</div>
          <span className="stat-badge badge-good">Métrica de base de datos</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#5ecf8b" }}>
          <div className="stat-label">Ticket promedio nacional</div>
          <div className="stat-value">R$ {Math.round(statsGlobales.avgTicket)}</div>
          <div className="stat-sub">Cálculo AVG de tus registros</div>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#f0b36c" }}>
          <div className="stat-label">Flete como % del ticket</div>
          <div className="stat-value">{statsGlobales.avgFreight.toFixed(1)}%</div>
          <div className="stat-sub">Peso relativo del flete</div>
          <span className="stat-badge badge-warn">⚠️ Variable por zona</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#f06c6c" }}>
          <div className="stat-label">Mes pico de órdenes</div>
          <div className="stat-value">{statsGlobales.peakMonthName}</div>
          <div className="stat-sub">{statsGlobales.peakMonthOrders.toLocaleString()} órdenes reales</div>
          <span className="stat-badge badge-good">Máximo histórico</span>
        </div>
      </div>

      {/* ── Gráfica 1: Volumen Temporal Real ── */}
      <div className="chart-card" style={{ marginBottom: 24 }}>
        <div className="chart-title">Tendencia de órdenes mensuales</div>
        <div className="chart-desc">Evolución real del volumen de órdenes agrupadas por mes de compra</div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthlyOrders} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6c8dfa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6c8dfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip content={<AreaTooltip />} />
            <Area type="monotone" dataKey="orders" stroke="#6c8dfa" strokeWidth={2} fill="url(#areaGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Gráficas Grid: Distribución Geográfica Real ── */}
      <div className="charts-grid charts-grid-2" style={{ display:"grid", gridTemplateColumns: "1fr 1fr", gap:20 }}>
        
        {/* Ticket promedio real por Estado */}
        <div className="chart-card">
          <div className="chart-title">Ticket promedio por estado (R$)</div>
          <div className="chart-desc">Valores netos calculados por agregación geográfica</div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={stateTicket} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ticket" name="Ticket" radius={[0, 4, 4, 0]}>
                {stateTicket.map((d, i) => (
                  <Cell key={`cell-ticket-${d.state || i}`} fill={`hsl(${220 + i * 6}, 70%, 55%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* % Flete Real por Estado */}
        <div className="chart-card">
          <div className="chart-title">Flete como % por estado</div>
          <div className="chart-desc">Peso porcentual del costo de envío sobre el valor final</div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={sortedByFreight} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={28} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length || !payload[0].payload) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
                      <div className="label" style={{ color:"var(--text-muted)", marginBottom:4 }}>Estado: {d.state}</div>
                      <div style={{ color: "var(--text-primary)", marginBottom: 2 }}>Flete: <strong>{Number(d.freight).toFixed(1)}%</strong> del total</div>
                      <div style={{ color: "var(--text-secondary)" }}>Ticket base: <strong>R$ {Number(d.ticket).toFixed(2)}</strong></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="freight" name="% Flete" radius={[0, 4, 4, 0]}>
                {sortedByFreight.map((d, i) => (
                  <Cell
                    key={`cell-freight-${d.state || i}`}
                    fill={d.freight > 16 ? "#f06c6c" : d.freight > 14 ? "#f0b36c" : "#5ecf8b"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}