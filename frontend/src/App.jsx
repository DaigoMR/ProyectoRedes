import React, { useEffect, useState } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, registerables } from 'chart.js';
import './App.css';

ChartJS.register(...registerables);

function App() {
  const [datos, setDatos] = useState([]);

  const fetchDatos = () => {
    fetch('http://127.0.0.1:8000/api/datos')
      .then(res => res.json())
      .then(json => {
        const records = Array.isArray(json) ? json : (json.data || []);
        setDatos(records);
      })
      .catch(err => console.error("Error API:", err));
  };

  useEffect(() => {
    fetchDatos();
    const intervalo = setInterval(fetchDatos, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // Filtros
  const datosOrdenes = datos.filter(d => d.origen === 'ORDEN');
  const datosProductos = datos.filter(d => d.origen === 'PRODUCTO');
  const datosTCP = datos.filter(d => d.origen === 'ORDEN' || d.origen === 'PRODUCTO');

  // UDP con fix para raw_data
  const datosUDP = datos
    .filter(d => d.origen === 'UDP')
    .map(d => {
      let contenido = d.contenido;
      if (contenido?.raw_data && typeof contenido.raw_data === 'string') {
        try { contenido = JSON.parse(contenido.raw_data); } catch (e) {}
      }
      return { ...d, contenido };
    });

  // Gráfica ventas por mes
  const ventasPorMes = datosOrdenes.reduce((acc, reg) => {
    const fecha = reg.contenido?.order_purchase_timestamp;
    if (fecha && typeof fecha === 'string') {
      const mesAnio = fecha.substring(0, 7);
      acc[mesAnio] = (acc[mesAnio] || 0) + 1;
    }
    return acc;
  }, {});
  const etiquetasMeses = Object.keys(ventasPorMes).sort();
  const valoresMensuales = etiquetasMeses.map(m => ventasPorMes[m]);
  const ventasData = {
    labels: etiquetasMeses,
    datasets: [{
      label: 'Órdenes por mes',
      data: valoresMensuales,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
      fill: true, tension: 0.4
    }]
  };

  // Gráfica estados de órdenes
  const estadosOrdenes = datosOrdenes.reduce((acc, reg) => {
    const estado = reg.contenido?.order_status;
    if (estado) acc[estado] = (acc[estado] || 0) + 1;
    return acc;
  }, {});
  const estadosData = {
    labels: Object.keys(estadosOrdenes),
    datasets: [{
      label: 'Cantidad de órdenes',
      data: Object.values(estadosOrdenes),
      backgroundColor: ['#22c55e', '#f97316', '#ef4444', '#3b82f6', '#a855f7']
    }]
  };

  // Gráfica categorías de productos
  const categoriasProductos = datosProductos.reduce((acc, reg) => {
    const categoria = reg.contenido?.product_category_name;
    if (categoria) acc[categoria] = (acc[categoria] || 0) + 1;
    return acc;
  }, {});
  const categoriasOrdenadas = Object.entries(categoriasProductos).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const categoriasData = {
    labels: categoriasOrdenadas.map(item => item[0]),
    datasets: [{
      data: categoriasOrdenadas.map(item => item[1]),
      backgroundColor: ['#2563eb', '#ec4899', '#f97316', '#22c55e', '#a855f7']
    }]
  };

  // Gráfica telemetría UDP (fix aplicado)
  const telemetriaData = {
    labels: datosUDP.slice(-20).map(d => new Date(d.fecha).toLocaleTimeString()),
    datasets: [{
      label: 'Temperatura °C',
      data: datosUDP.slice(-20).map(d => d.contenido?.temperatura ?? null),
      borderColor: '#ec4899',
      backgroundColor: 'rgba(236, 72, 153, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  const commonOptions = { responsive: true, maintainAspectRatio: false };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Monitor de Red</h1>
        <div className="title-spacer"></div>
        <p className="dashboard-subtitle">TCP & UDP PROTOCOLS</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Total</span><h2>{datos.length}</h2></div>
        <div className="stat-card"><span>TCP</span><h2>{datosTCP.length}</h2></div>
        <div className="stat-card"><span>UDP</span><h2>{datosUDP.length}</h2></div>
        <div className="stat-card"><span>Uptime</span><h2>99.9%</h2></div>
      </div>

      <div className="charts-grid">
        <div className="chart-card"><h3>Órdenes (TCP)</h3><div className="chart-box"><Line data={ventasData} options={commonOptions} /></div></div>
        <div className="chart-card"><h3>Estados</h3><div className="chart-box"><Bar data={estadosData} options={commonOptions} /></div></div>
        <div className="chart-card"><h3>Categorías</h3><div className="chart-box"><Doughnut data={categoriasData} /></div></div>
        <div className="chart-card"><h3>Telemetría (UDP)</h3><div className="chart-box"><Line data={telemetriaData} options={commonOptions} /></div></div>
      </div>

      <div className="table-container">
        <h3 className="table-title">Registros del Servidor</h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr className="table-header">
                <th>ID</th>
                <th>Protocolo</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Contenido</th>
              </tr>
            </thead>
            <tbody>
              {datos.slice().reverse().slice(0, 50).map(reg => {
                const esTCP = reg.origen === 'ORDEN' || reg.origen === 'PRODUCTO' || reg.origen === 'TCP';
                const label = esTCP ? 'TCP' : 'UDP';
                return (
                  <tr key={reg.id} className="table-row">
                    <td>{reg.id}</td>
                    <td><span className={`badge badge-${label.toLowerCase()}`}>{label}</span></td>
                    <td>{reg.cliente_info}</td>
                    <td>{new Date(reg.fecha).toLocaleString()}</td>
                    <td className="json-content">
                      <pre>{JSON.stringify(reg.contenido, null, 2)}</pre>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;