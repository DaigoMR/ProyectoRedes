import { useState } from "react";
import TabSatisfaccion from "./components/TabSatisfaccion";
import TabComportamiento from "./components/TabComportamiento";
import TabCalidad from "./components/TabCalidad";
import TabRetencion from "./components/TabRetencion";
import TabTelemetria from "./components/TabTelemetria";
import "./App.css";

const TABS = [
  { id: "satisfaccion",   label: "Satisfacción & Entregas"},
  { id: "comportamiento", label: "Comportamiento de Compra"},
  { id: "calidad",        label: "Calidad del Servicio"},
  { id: "retencion",      label: "Retención de Clientes"},
  { id: "telemetria",     label: "Telemetría TCP/UDP"},
];

export default function App() {
  const [activeTab, setActiveTab] = useState("satisfaccion");

  return (
    // Añadimos una clase contenedora para la distribución horizontal (sidebar + main)
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="brand">
            <span className="brand-dot" />
            <div className="brand-text">
              <span className="brand-name">Olist Analytics</span>
              <span className="brand-tag">Dashboard Ejecutivo</span>
              <span className="brand-subtag">2016–2018</span>
            </div>
          </div>
          
          <nav className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="main-content">
        {activeTab === "satisfaccion"   && <TabSatisfaccion />}
        {activeTab === "comportamiento" && <TabComportamiento />}
        {activeTab === "calidad"        && <TabCalidad />}
        {activeTab === "retencion"      && <TabRetencion />}
        {activeTab === "telemetria"     && <TabTelemetria />}
      </main>
    </div>
  );
}