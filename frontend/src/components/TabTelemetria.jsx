import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from "recharts";

// ── CORRECCIÓN CRÍTICA: Apuntamos al endpoint real que declaraste en main.py ──
const API_URL = "/api/telemetria/packets";
const POLL_MS  = 3000; // polling cada 3 segundos

// Colores por protocolo
const COLOR = { TCP: "#3db876", UDP: "#4a6ef5" };

// ── Tooltip ───────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", fontSize:11, boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
      {label && <div className="label" style={{ marginBottom: 4, color: "var(--text-muted)" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: 11, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatFecha(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts; }
}

function getOrigen(row) {
  if (!row) return "—";

  // 1. Extraemos el origen en mayúsculas y quitamos espacios
  const o = (row.origen || "").toString().trim().toUpperCase();

  // 2. Si dice explícitamente UDP, es telemetría pura
  if (o === "UDP") return "UDP";

  // 3. ¡EL TRUCO MÁGICO! Si dice TCP, o es cualquiera de tus etiquetas de negocio,
  // sabemos con certeza que entró a través del socket concurrente TCP
  if (o === "TCP" || o === "ORDEN" || o === "ITEM" || o === "CLIENTE" || o === "REVIEW") {
    return "TCP";
  }

  // 4. Inspección de respaldo por si el dato viniera anidado dentro del JSON de contenido
  if (row.contenido) {
    const textoContenido = JSON.stringify(row.contenido).toUpperCase();
    if (textoContenido.includes("UDP")) return "UDP";
    if (textoContenido.includes("ORDER_ID") || textoContenido.includes("CUSTOMER_ID") || textoContenido.includes("TCP")) {
      return "TCP";
    }
  }

  return "—";
}

// Agrupa registros por ventana de 10s para la serie temporal
function buildTimeSeries(registros) {
  const buckets = {};
  registros.forEach(r => {
    const ts = r.fecha ? new Date(r.fecha) : null;
    if (!ts) return;
    const key = Math.floor(ts.getTime() / 10000) * 10;
    if (!buckets[key]) buckets[key] = { t: ts, TCP: 0, UDP: 0 };
    buckets[key][getOrigen(r)]++;
  });
  
  return Object.values(buckets)
    .sort((a, b) => a.t - b.t)
    .slice(-30)
    .map(b => ({
      tick: formatFecha(b.t),
      TCP: b.TCP,
      UDP: b.UDP,
    }));
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TabTelemetria() {
  const [registros, setRegistros]   = useState([]);
  const [lastPoll, setLastPoll]     = useState(null);
  const [connected, setConnected]   = useState(false);
  
  // Usamos una referencia (ref) para recordar la fecha del último paquete sin rehacer el componente
  const ultimaFechaRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchData = async () => {
    try {
      // Si ya tenemos una última fecha guardada, la mandamos como parámetro a FastAPI
      const urlConFiltro = ultimaFechaRef.current 
        ? `${API_URL}?since=${encodeURIComponent(ultimaFechaRef.current)}`
        : API_URL;

      const res = await fetch(urlConFiltro);
      
      if (res.ok) {
        const json = await res.json();
        const nuevosPackets = json.packets || json.data || json || [];
        
        if (nuevosPackets.length > 0) {
          // 1. Buscamos el registro más nuevo del lote recibido para actualizar nuestro cursor
          const fechas = nuevosPackets.map(p => p.fecha).filter(Boolean);
          if (fechas.length > 0) {
            // El paquete más reciente será la estampa de tiempo más alta
            const masReciente = fechas.sort((a, b) => new Date(b) - new Date(a))[0];
            ultimaFechaRef.current = masReciente;
          }

          // 2. ACUMULACIÓN ASÍNCRONA: Si es la carga inicial, guardamos el lote.
          // Si es polling, concatenamos lo nuevo al array existente y removemos duplicados por ID.
          setRegistros(prev => {
            const mapaUnico = new Map();
            // Metemos los registros viejos al mapa
            prev.forEach(p => mapaUnico.set(p.id, p));
            // Inyectamos o sobrescribimos con los nuevos
            nuevosPackets.forEach(p => mapaUnico.set(p.id, p));
            
            // Retornamos la lista unificada y ordenada cronológicamente
            return Array.from(mapaUnico.values())
              .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
          });
        }
        
        setConnected(true);
      } else {
        setConnected(false);
      }
      
      setLastPoll(new Date().toLocaleTimeString("es-MX"));
    } catch (e) {
      console.error("[TabTelemetria] Error en cursor incremental:", e);
      setConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  // ── Métricas derivadas y Moldes de Respaldo en Cero ────────────────────────
  const total   = registros.length;
  const tcpRows = registros.filter(r => getOrigen(r) === "TCP");
  const udpRows = registros.filter(r => getOrigen(r) === "UDP");
  const tcpCount = tcpRows.length;
  const udpCount = udpRows.length;

  // Si no hay datos, creamos una línea temporal muestra vacía pero estilizada
  let timeSeries = buildTimeSeries(registros);
  if (timeSeries.length === 0) {
    timeSeries = [
      { tick: "00:00:00", TCP: 0, UDP: 0 },
      { tick: "00:00:10", TCP: 0, UDP: 0 },
      { tick: "00:00:20", TCP: 0, UDP: 0 }
    ];
  }

  // Distribución por origen (pie) con molde por defecto
  let pieData = [
    { name: "TCP", value: tcpCount, color: COLOR.TCP },
    { name: "UDP", value: udpCount, color: COLOR.UDP },
  ];
  if (total === 0) {
    pieData = [
      { name: "TCP", value: 0, color: COLOR.TCP },
      { name: "UDP", value: 0, color: COLOR.UDP }
    ];
  }

  // Paquetes por cliente_info
  const clientMap = {};
  registros.forEach(r => {
    const key = r.cliente_info || "Desconocido";
    if (!clientMap[key]) clientMap[key] = { cliente: key, TCP: 0, UDP: 0 };
    clientMap[key][getOrigen(r)]++;
  });
  
  let clientData = Object.values(clientMap)
    .sort((a, b) => (b.TCP + b.UDP) - (a.TCP + a.UDP))
    .slice(0, 10);

  if (clientData.length === 0) {
    clientData = [
      { cliente: "127.0.0.1", TCP: 0, UDP: 0 },
      { cliente: "Agente local", TCP: 0, UDP: 0 }
    ];
  }

  // Actividad por hora
  const hourMap = {};
  registros.forEach(r => {
    if (!r.fecha) return;
    const h = new Date(r.fecha).getHours();
    const key = `${String(h).padStart(2,"0")}:00`;
    if (!hourMap[key]) hourMap[key] = { hora: key, TCP: 0, UDP: 0 };
    hourMap[key][getOrigen(r)]++;
  });
  
  let hourData = Object.values(hourMap).sort((a, b) => a.hora.localeCompare(b.hora));
  if (hourData.length === 0) {
    hourData = [
      { hora: "12:00", TCP: 0, UDP: 0 },
      { hora: "16:00", TCP: 0, UDP: 0 },
      { hora: "20:00", TCP: 0, UDP: 0 }
    ];
  }

  const logRows = [...registros]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 50);

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Telemetría <em>TCP vs UDP</em></h1>
          <p className="page-subtitle">
            Paquetes recibidos en tiempo real desde ambos agentes vía Supabase.
            Polling cada {POLL_MS / 1000}s a <code style={{ fontSize: 12, background: "var(--bg-3)", padding: "1px 6px", borderRadius: 4 }}>{API_URL}</code>
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 6 }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontFamily: "'DM Mono', monospace",
            color: connected ? "#3db876" : "#e05555",
            background: connected ? "rgba(61,184,118,0.10)" : "rgba(224,85,85,0.10)",
            padding: "5px 12px", borderRadius: 20,
            border: `1px solid ${connected ? "rgba(61,184,118,0.3)" : "rgba(224,85,85,0.3)"}`,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: connected ? "#3db876" : "#e05555",
              display: "inline-block",
            }} />
            {connected ? "Conectado" : "Sin conexión o vacío"}
          </span>
          {lastPoll && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
              Última actualización: {lastPoll}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-row">
        <div className="stat-card" style={{ "--card-accent": "#6c8dfa" }}>
          <div className="stat-label">Total de registros</div>
          <div className="stat-value">{total.toLocaleString()}</div>
          <div className="stat-sub">en registros_servidor</div>
        </div>
        <div className="stat-card" style={{ "--card-accent": COLOR.TCP }}>
          <div className="stat-label">Paquetes TCP</div>
          <div className="stat-value">{tcpCount.toLocaleString()}</div>
          <div className="stat-sub">{total ? ((tcpCount / total) * 100).toFixed(1) : 0}% del total</div>
          <span className="stat-badge badge-good">Entrega garantizada</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": COLOR.UDP }}>
          <div className="stat-label">Paquetes UDP</div>
          <div className="stat-value">{udpCount.toLocaleString()}</div>
          <div className="stat-sub">{total ? ((udpCount / total) * 100).toFixed(1) : 0}% del total</div>
          <span className="stat-badge badge-warn">Alta frecuencia</span>
        </div>
        <div className="stat-card" style={{ "--card-accent": "#9b6ef5" }}>
          <div className="stat-label">Fuentes únicas</div>
          <div className="stat-value">{Object.keys(clientMap).length || 0}</div>
          <div className="stat-sub">clientes / agentes distintos</div>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="charts-grid charts-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        
        {/* Serie temporal */}
        <div className="chart-card">
          <div className="chart-title">Paquetes recibidos en el tiempo</div>
          <div className="chart-desc">Agrupados en ventanas de 10 segundos · últimos 30 buckets</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries} margin={{ top: 8, right: 8, left: -20 }}>
              <defs>
                <linearGradient id="gTCP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLOR.TCP} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLOR.TCP} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gUDP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLOR.UDP} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLOR.UDP} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tick" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="TCP" stroke={COLOR.TCP} strokeWidth={2} fill="url(#gTCP)" name="TCP" />
              <Area type="monotone" dataKey="UDP" stroke={COLOR.UDP} strokeWidth={2} fill="url(#gUDP)" name="UDP" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie TCP vs UDP */}
        <div className="chart-card">
          <div className="chart-title">Proporción TCP vs UDP</div>
          <div className="chart-desc">Del total de paquetes registrados en Supabase</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", minHeight: 180 }}>
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} labelLine={false}>
                  {pieData.map((d, index) => <Cell key={`cell-tele-${index}`} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "45%" }}>
              {pieData.map(d => (
                <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: d.color }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                    {d.value.toLocaleString()} ({total ? ((d.value / total) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="charts-grid charts-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Por cliente/agente */}
        <div className="chart-card">
          <div className="chart-title">Paquetes por cliente / agente</div>
          <div className="chart-desc">Top 10 fuentes por campo cliente_info</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={clientData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="cliente" tick={{ fontSize: 10 }} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="TCP" name="TCP" stackId="a" fill={COLOR.TCP} radius={[0,3,3,0]} />
              <Bar dataKey="UDP" name="UDP" stackId="a" fill={COLOR.UDP} radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actividad por hora */}
        <div className="chart-card">
          <div className="chart-title">Actividad por hora del día</div>
          <div className="chart-desc">Distribución de paquetes TCP y UDP según la hora en que llegaron</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData} margin={{ top: 8, right: 8, left: -20 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="TCP" name="TCP" stackId="a" fill={COLOR.TCP} />
              <Bar dataKey="UDP" name="UDP" stackId="a" fill={COLOR.UDP} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Log tabla */}
      <div className="chart-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div className="chart-title">Registro de paquetes recientes</div>
            <div className="chart-desc" style={{ marginBottom: 0 }}>
              Últimos 50 registros · ordenados por fecha descendente
            </div>
          </div>
          <span style={{
            fontSize: 11, fontFamily: "'DM Mono', monospace",
            color: "var(--text-muted)", background: "var(--bg-3)",
            padding: "4px 10px", borderRadius: 20, border: "1px solid var(--border)"
          }}>
            {total} registros totales
          </span>
        </div>

        {logRows.length === 0 ? (
          <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
            Sin registros en logs — esperando paquetes de agentes…
          </div>
        ) : (
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            maxHeight: 360, overflowY: "auto",
            borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "60px 70px 160px 1fr 160px",
              padding: "8px 14px",
              borderBottom: "1px solid var(--border)",
              color: "var(--text-muted)", fontSize: 10,
              textTransform: "uppercase", letterSpacing: "0.06em",
              position: "sticky", top: 0, background: "var(--bg-card)",
            }}>
              <span>ID</span>
              <span>ORIGEN</span>
              <span>FECHA</span>
              <span>CONTENIDO</span>
              <span>CLIENTE</span>
            </div>

            {logRows.map((r) => {
              const origen = getOrigen(r);
              return (
                <div key={r.id} style={{
                  display: "grid",
                  gridTemplateColumns: "60px 70px 160px 1fr 160px",
                  padding: "7px 14px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  alignItems: "start",
                }}>
                  <span style={{ color: "var(--text-muted)" }}>{r.id}</span>
                  <span style={{ color: COLOR[origen] ?? "var(--text-muted)", fontWeight: 700 }}>
                    {origen}
                  </span>
                  <span>{formatFecha(r.fecha)}</span>
                  <span style={{
                    color: "var(--text-muted)", fontSize: 10,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}>
                    {typeof r.contenido === "object"
                      ? Object.entries(r.contenido).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")
                      : String(r.contenido ?? "—")}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                    {r.cliente_info ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="insight" style={{ marginTop: 16 }}>
          <span className="insight-icon">📡</span>
          <span>
            <strong>TCP</strong> garantiza entrega y orden — ideal para los registros de órdenes Olist.{" "}
            <strong>UDP</strong> prioriza velocidad — ideal para la telemetría de sensores en tiempo real. Ambos coexisten en la misma tabla.
          </span>
        </div>
      </div>
    </div>
  );
}