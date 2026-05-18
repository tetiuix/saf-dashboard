import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const ranges = [
  ["15m", "15 min"],
  ["1h", "1 ora"],
  ["1d", "1 giorno"],
  ["1w", "1 settimana"],
];

const metrics = [
  {
    key: "temperature",
    label: "Temperatura",
    unit: "°C",
    color: "#ef4444",
    ideal: [20, 25],
    lowText: "Aumenta temperatura",
    highText: "Abbassa temperatura",
  },
  {
    key: "humidity",
    label: "Umidità",
    unit: "%",
    color: "#3b82f6",
    ideal: [50, 65],
    lowText: "Aumenta umidità",
    highText: "Abbassa umidità",
  },
  {
    key: "vpd",
    label: "VPD",
    unit: "kPa",
    color: "#22c55e",
    ideal: [0.9, 1.4],
    lowText: "VPD basso",
    highText: "VPD alto",
  },
  {
    key: "dew_point",
    label: "Dew Point",
    unit: "°C",
    color: "#a855f7",
    ideal: [12, 18],
    lowText: "Punto rugiada basso",
    highText: "Rischio condensa",
  },
];

export default function App() {
  const [readings, setReadings] = useState([]);
  const [timeRange, setTimeRange] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

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

  const chartData = readings.map((row) => ({
    ...row,
    time: new Date(row.created_at).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const globalStatus = useMemo(() => {
    if (!latest) return { text: "Offline", className: "danger" };

    const warnings = metrics.filter((m) => {
      const value = Number(latest[m.key]);
      return value < m.ideal[0] || value > m.ideal[1];
    });

    if (warnings.length === 0) return { text: "Stabile", className: "good" };
    if (warnings.length <= 2) return { text: "Da regolare", className: "warning" };
    return { text: "Critico", className: "danger" };
  }, [latest]);

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">SAF Climate System</p>
          <h1>Dashboard Growbox</h1>
          <p className="subtitle">ESP32 · DHT22 · Supabase Cloud</p>
        </div>

        <div className={`status-pill ${globalStatus.className}`}>
          <span />
          {globalStatus.text}
        </div>
      </header>

      {loading && <p className="loading">Caricamento dati...</p>}

      {!loading && !latest && (
        <section className="panel">
          <h2>Nessun dato ricevuto</h2>
          <p>Controlla ESP32, WiFi e tabella Supabase.</p>
        </section>
      )}

      {latest && (
        <>
          <section className="metric-grid">
            {metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} latest={latest} />
            ))}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Andamento climatico</h2>
                <p>Intervallo: {timeRange} · Letture: {readings.length}</p>
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

            <div className="single-charts">
              {metrics.map((metric) => (
                <MiniChart
                  key={metric.key}
                  metric={metric}
                  chartData={chartData}
                />
              ))}
            </div>
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
    </main>
  );
}

function MetricCard({ metric, latest }) {
  const value = Number(latest[metric.key]);
  const [min, max] = metric.ideal;

  let state = "ok";
  let message = "Valore ottimale";

  if (value < min) {
    state = "warning";
    message = metric.lowText;
  }

  if (value > max) {
    state = "danger";
    message = metric.highText;
  }

  return (
    <article className={`metric-card ${state}`}>
      <div className="metric-top">
        <p>{metric.label}</p>
        <span className="metric-dot" style={{ background: metric.color }} />
      </div>

      <h2>
        {value.toFixed(2)} <span>{metric.unit}</span>
      </h2>

      <div className={`metric-action ${state}`}>
        {message}
      </div>

      <small>
        Range ideale: {min}–{max} {metric.unit}
      </small>
    </article>
  );
}

function MiniChart({ metric, chartData }) {
  return (
    <article className="chart-card">
      <div className="chart-title">
        <h3>{metric.label}</h3>
        <span style={{ color: metric.color }}>
          {metric.unit}
        </span>
      </div>

      <div className="chart-mobile-fix">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 12, left: -24, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={metric.key}
              name={metric.label}
              stroke={metric.color}
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}