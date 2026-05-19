import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ranges = [
  ["15m", "15 min"],
  ["1h", "1 ora"],
  ["1d", "1 giorno"],
  ["1w", "1 settimana"],
];

const plantStages = {
  clone: {
    label: "Cloni",
    note: "Radicazione stabile, alta umidità, VPD basso.",
    targets: {
      temperature: [22, 26],
      humidity: [70, 85],
      vpd: [0.4, 0.8],
      dew_point: [16, 22],
    },
  },
  veg: {
    label: "Vegetativa",
    note: "Crescita attiva, clima stabile e traspirazione controllata.",
    targets: {
      temperature: [22, 27],
      humidity: [55, 70],
      vpd: [0.8, 1.2],
      dew_point: [14, 20],
    },
  },
  earlyFlower: {
    label: "Fioritura iniziale",
    note: "Riduci umidità e mantieni VPD medio.",
    targets: {
      temperature: [21, 26],
      humidity: [45, 60],
      vpd: [1.0, 1.4],
      dew_point: [12, 18],
    },
  },
  lateFlower: {
    label: "Fioritura finale",
    note: "Umidità più bassa, attenzione muffe e condensa.",
    targets: {
      temperature: [20, 25],
      humidity: [40, 50],
      vpd: [1.2, 1.6],
      dew_point: [10, 16],
    },
  },
};

const metricBase = [
  {
    key: "temperature",
    label: "Temperatura",
    unit: "°C",
    color: "#f97316",
    lowText: "Aumenta temperatura",
    highText: "Abbassa temperatura",
  },
  {
    key: "humidity",
    label: "Umidità",
    unit: "%",
    color: "#38bdf8",
    lowText: "Aumenta umidità",
    highText: "Abbassa umidità",
  },
  {
    key: "vpd",
    label: "VPD",
    unit: "kPa",
    color: "#22c55e",
    lowText: "VPD basso",
    highText: "VPD alto",
  },
  {
    key: "dew_point",
    label: "Dew Point",
    unit: "°C",
    color: "#a78bfa",
    lowText: "Punto rugiada basso",
    highText: "Rischio condensa",
  },
];

export default function App() {
  const [readings, setReadings] = useState([]);
  const [timeRange, setTimeRange] = useState("1h");
  const [plantStage, setPlantStage] = useState("veg");
  const [activeMetric, setActiveMetric] = useState("vpd");
  const [showLogs, setShowLogs] = useState(false);
  const [loading, setLoading] = useState(true);

  const metrics = useMemo(
    () =>
      metricBase.map((metric) => ({
        ...metric,
        ideal: plantStages[plantStage].targets[metric.key],
      })),
    [plantStage]
  );

  async function loadReadings(range = timeRange) {
    const fromDate = new Date();

    if (range === "15m") fromDate.setMinutes(fromDate.getMinutes() - 15);
    if (range === "1h") fromDate.setHours(fromDate.getHours() - 1);
    if (range === "1d") fromDate.setDate(fromDate.getDate() - 1);
    if (range === "1w") fromDate.setDate(fromDate.getDate() - 7);

    const { data, error } = await supabase
      .from("sensor_readings")
      .select("*")
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: true })
      .limit(3000);

    if (error) {
      console.error("Errore Supabase:", error);
      setLoading(false);
      return;
    }

    setReadings(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadReadings(timeRange);

    const interval = setInterval(() => {
      loadReadings(timeRange);
    }, 5000);

    return () => clearInterval(interval);
  }, [timeRange]);

  const latest = readings[readings.length - 1];

  const chartData = useMemo(
    () =>
      readings.map((row) => ({
        ...row,
        time: new Date(row.created_at).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })),
    [readings]
  );

  const metricStates = useMemo(() => {
    if (!latest) return [];

    return metrics.map((metric) => {
      const value = Number(latest[metric.key]);
      const [min, max] = metric.ideal;

      if (value < min) {
        return { ...metric, value, state: "warning", message: metric.lowText };
      }

      if (value > max) {
        return { ...metric, value, state: "danger", message: metric.highText };
      }

      return { ...metric, value, state: "good", message: "Valore ottimale" };
    });
  }, [latest, metrics]);

  const score = useMemo(() => {
    if (!latest) return 0;
    const good = metricStates.filter((m) => m.state === "good").length;
    return Math.round((good / metricStates.length) * 100);
  }, [latest, metricStates]);

  const globalStatus = useMemo(() => {
    if (!latest) return { label: "Offline", className: "danger" };
    if (score >= 90) return { label: "Ottimale", className: "good" };
    if (score >= 60) return { label: "Da regolare", className: "warning" };
    return { label: "Critico", className: "danger" };
  }, [latest, score]);

  const activeMetricData =
    metrics.find((metric) => metric.key === activeMetric) || metrics[0];

  const aiInsights = useMemo(() => {
    if (!latest) return [];

    const badMetrics = metricStates.filter((m) => m.state !== "good");

    if (badMetrics.length === 0) {
      return [
        "Ambiente stabile per la fase selezionata.",
        "I parametri principali sono dentro target.",
        "Mantieni la configurazione attuale.",
      ];
    }

    return badMetrics.slice(0, 3).map((m) => {
      if (m.key === "humidity" && m.state === "warning") {
        return "Umidità sotto target: valuta umidificatore o minore estrazione.";
      }

      if (m.key === "humidity" && m.state === "danger") {
        return "Umidità sopra target: aumenta estrazione o deumidificazione.";
      }

      if (m.key === "temperature" && m.state === "danger") {
        return "Temperatura alta: aumenta ventilazione o riduci calore lampada.";
      }

      if (m.key === "vpd" && m.state === "danger") {
        return "VPD alto: pianta sotto stress traspirativo, alza umidità o abbassa temperatura.";
      }

      if (m.key === "dew_point" && m.state === "danger") {
        return "Dew point alto: attenzione a condensa e rischio muffe.";
      }

      return `${m.label}: ${m.message}.`;
    });
  }, [latest, metricStates]);

  const lastUpdate = latest
    ? new Date(latest.created_at).toLocaleString("it-IT")
    : "Nessun dato";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SAF Climate</strong>
            <span>Growbox AI Control</span>
          </div>
        </div>

        <nav>
          <a className="active">Overview</a>
          <a>Climate</a>
          <a>AI Insights</a>
          <a>Automation</a>
          <a>History</a>
        </nav>

        <div className="device-mini">
          <span className="online-dot"></span>
          <div>
            <strong>ESP32 Test Unit</strong>
            <p>Cloud sync attivo</p>
          </div>
        </div>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live Environment</p>
            <h1>Dashboard Growbox</h1>
            <p className="subtitle">
              Ultimo aggiornamento: {lastUpdate}
            </p>
          </div>

          <div className={`status-pill ${globalStatus.className}`}>
            <span />
            {globalStatus.label}
          </div>
        </header>

        <section className="stage-panel">
          <div>
            <h2>Fase pianta</h2>
            <p>{plantStages[plantStage].note}</p>
          </div>

          <div className="stage-buttons">
            {Object.entries(plantStages).map(([key, stage]) => (
              <button
                key={key}
                className={plantStage === key ? "active" : ""}
                onClick={() => setPlantStage(key)}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </section>

        {loading && <p className="loading">Caricamento dati...</p>}

        {!loading && !latest && (
          <section className="panel empty-state">
            <h2>Nessun dato ricevuto</h2>
            <p>Controlla ESP32, WiFi e tabella Supabase.</p>
          </section>
        )}

        {latest && (
          <>
            <section className="hero-grid">
              <div className={`health-card ${globalStatus.className}`}>
                <p>Growbox score</p>
                <h2>{score}/100</h2>
                <strong>{globalStatus.label}</strong>
                <span>
                  Valutazione basata sui target della fase{" "}
                  {plantStages[plantStage].label}.
                </span>
              </div>

              <div className="ai-card">
                <div className="section-title">
                  <h2>AI Insights</h2>
                  <span>Logic preview</span>
                </div>

                <ul>
                  {aiInsights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="metric-grid">
              {metricStates.map((metric) => (
                <MetricCard
                  key={metric.key}
                  metric={metric}
                  active={activeMetric === metric.key}
                  onClick={() => setActiveMetric(metric.key)}
                />
              ))}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{activeMetricData.label}</h2>
                  <p>
                    Target: {activeMetricData.ideal[0]}–
                    {activeMetricData.ideal[1]} {activeMetricData.unit}
                  </p>
                </div>

                <div className="range-buttons">
                  {ranges.map(([value, label]) => (
                    <button
                      key={value}
                      className={timeRange === value ? "active" : ""}
                      onClick={() => setTimeRange(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="main-chart">
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 20, right: 18, left: -20, bottom: 8 }}
                  >
                    <defs>
                      <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={activeMetricData.color}
                          stopOpacity={0.45}
                        />
                        <stop
                          offset="95%"
                          stopColor={activeMetricData.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b" }} />
                    <Area
                      type="monotone"
                      dataKey={activeMetricData.key}
                      stroke={activeMetricData.color}
                      fill="url(#activeGradient)"
                      strokeWidth={3}
                      dot={false}
                      name={activeMetricData.label}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="two-col">
              <section className="panel">
                <div className="section-title">
                  <h2>Device Status</h2>
                  <span>Live</span>
                </div>

                <div className="status-list">
                  <StatusRow label="ESP32" value="Online" state="good" />
                  <StatusRow label="Sensore DHT22" value="OK" state="good" />
                  <StatusRow label="Supabase Sync" value="Attivo" state="good" />
                  <StatusRow label="Update rate" value="30 sec" state="info" />
                </div>
              </section>

              <section className="panel">
                <div className="section-title">
                  <h2>Automazioni</h2>
                  <span>Preview</span>
                </div>

                <div className="automation-list">
                  <Automation label="Umidificatore" active={latest.humidity < activeTarget("humidity", plantStage)[0]} />
                  <Automation label="Estrattore" active={latest.temperature > activeTarget("temperature", plantStage)[1]} />
                  <Automation label="Riscaldamento" active={latest.temperature < activeTarget("temperature", plantStage)[0]} />
                  <Automation label="Allarme VPD" active={latest.vpd > activeTarget("vpd", plantStage)[1]} />
                </div>
              </section>
            </section>

            <section className="panel">
              <button className="log-toggle" onClick={() => setShowLogs(!showLogs)}>
                {showLogs ? "Nascondi log letture" : "Mostra log letture"}
              </button>

              {showLogs && (
                <div className="reading-list">
                  {[...readings].reverse().slice(0, 20).map((row) => (
                    <article className="reading-card" key={row.id}>
                      <strong>{new Date(row.created_at).toLocaleString("it-IT")}</strong>
                      <div>
                        <span>{row.temperature} °C</span>
                        <span>{row.humidity} %</span>
                        <span>{row.vpd} kPa</span>
                        <span>{row.dew_point} °C</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function activeTarget(key, stage) {
  return plantStages[stage].targets[key];
}

function MetricCard({ metric, active, onClick }) {
  return (
    <button className={`metric-card ${metric.state} ${active ? "active" : ""}`} onClick={onClick}>
      <div className="metric-top">
        <p>{metric.label}</p>
        <span className="metric-dot" style={{ background: metric.color }} />
      </div>

      <h2>
        {metric.value.toFixed(2)} <span>{metric.unit}</span>
      </h2>

      <div className={`metric-action ${metric.state}`}>
        {metric.message}
      </div>

      <small>
        Target: {metric.ideal[0]}–{metric.ideal[1]} {metric.unit}
      </small>
    </button>
  );
}

function StatusRow({ label, value, state }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={state}>{value}</strong>
    </div>
  );
}

function Automation({ label, active }) {
  return (
    <div className="automation-row">
      <span>{label}</span>
      <div className={`toggle ${active ? "on" : ""}`}>
        <i />
      </div>
    </div>
  );
}