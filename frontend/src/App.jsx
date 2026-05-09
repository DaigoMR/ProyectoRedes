import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2'; // Solo usamos Line para ambas ahora
import { Chart as ChartJS, registerables } from 'chart.js';
import './App.css';

ChartJS.register(...registerables);

function App() {
  const [datos, setDatos] = useState([]);

  const fetchDatos = () => {
    fetch('http://127.0.0.1:8000/api/datos')
      .then(res => res.json())
      .then(json => setDatos(json.data))
      .catch(err => console.error("Error API:", err));
  };

  useEffect(() => {
    fetchDatos();
    const intervalo = setInterval(fetchDatos, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // --- 1. FILTRADO DE DATOS ---
  const datosUDP = datos.filter(d => d.origen === 'UDP');
  const datosTCP = datos.filter(d => d.origen === 'TCP');

  // --- 2. LÓGICA DE SERIE TEMPORAL (Ventas Históricas TCP) ---
  const ventasPorMes = datosTCP.reduce((acc, reg) => {
    try {
      const lineaCsv = reg.contenido.dato;
      if (lineaCsv) {
        const columnas = lineaCsv.split(',');
        const fechaString = columnas[3]; // Columna order_purchase_timestamp
        if (fechaString) {
          const mesAnio = fechaString.trim().substring(0, 7); // YYYY-MM
          acc[mesAnio] = (acc[mesAnio] || 0) + 1;
        }
      }
    } catch (e) { console.error("Error procesando CSV:", e); }
    return acc;
  }, {});

  const etiquetasMeses = Object.keys(ventasPorMes).sort();
  const valoresMensuales = etiquetasMeses.map(m => ventasPorMes[m]);

  const temporalData = {
    labels: etiquetasMeses,
    datasets: [{
      label: 'Ventas Mensuales (Olist)',
      data: valoresMensuales,
      borderColor: '#FF6384',
      backgroundColor: 'rgba(255, 99, 132, 0.2)',
      fill: true,
      tension: 0.4,
    }]
  };

  // --- 3. CONFIGURACIÓN TELEMETRÍA (Sensores UDP) ---
  const lineDataUDP = {
    labels: datosUDP.map(d => new Date(d.fecha).toLocaleTimeString()),
    datasets: [{
      label: 'Temperatura °C (Sensores)',
      data: datosUDP.map(d => d.contenido.temperatura),
      borderColor: '#36A2EB',
      backgroundColor: 'rgba(54, 162, 235, 0.2)',
      fill: true,
      tension: 0.4
    }]
  };

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Sistema Distribuido & Telemetría</h1>
      
      <div className="charts-grid">
        {/* Gráfica de Telemetría */}
        <div className="chart-card">
          <h3>Telemetría en Tiempo Real (UDP)</h3>
          <Line data={lineDataUDP} />
        </div>

        {/* Gráfica de Serie Temporal (Ventas) */}
        <div className="chart-card" style={{ width: '40%' }}>
          <h3>Tendencia Histórica de Ventas (TCP)</h3>
          <Line 
            data={temporalData} 
            options={{
              responsive: true,
              scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Órdenes' } },
                x: { title: { display: true, text: 'Mes de Compra' } }
              }
            }} 
          />
        </div>
      </div>

      <h3 className="table-section-title">Registro General de Operaciones</h3>
      <div className="table-container">
        <table className="data-table">
          <thead className="table-header">
            <tr>
              <th>ID</th>
              <th>Origen</th>
              <th>IP Cliente</th>
              <th>Fecha Registro</th>
              <th>Datos Recibidos</th>
            </tr>
          </thead>
          <tbody>
            {datos.slice().reverse().map(reg => (
              <tr key={reg.id} className="table-row">
                <td className="table-cell">{reg.id}</td>
                <td className="table-cell">
                  <span className={`badge ${reg.origen === 'TCP' ? 'badge-tcp' : 'badge-udp'}`}>
                    {reg.origen}
                  </span>
                </td>
                <td className="table-cell">{reg.cliente_info}</td>
                <td className="table-cell">{new Date(reg.fecha).toLocaleString()}</td>
                <td className="table-cell json-content">{JSON.stringify(reg.contenido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;