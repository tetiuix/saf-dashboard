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
  Legend,
} from "recharts";

export default function App() {
  const [readings, setReadings] = useState([]);
  const [timeRange, setTimeRange] = useState("1h");
  const [loading, setLoading] = useState(true);

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

  const status = useMemo(() => {
    if (!latest) return { label: "Offline", className: "danger" };

    if (latest.vpd > 1.4 || latest.temperature > 28 || latest.humidity < 45) {
      return { label: "Attenzione", className: "warning" };
    }

    if (latest.vpd >= 0.9 && latest.vpd <= 1.4) {
      return { label: "Stabile", className: "good" };
    }

    return { label: "Fuori range", className: "warning" };
  }, [latest]);

  const chartData = readings.map((row) => ({
    ...row,
    time: new Date(row.created_at).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">SAF Climate System</p>
          <h1>Dashboard Growbox</h1>
          <p className="subtitle">ESP32 + DHT22 + Supabase Cloud</p>
        </div>

        <div className={`status-pill ${status.className}`}>
          <span></span>
          {status.label}
        </div>
      </header>

      {loading && <p>Caricamento dati...</p>}

      {!loading && !latest && (
        <section className="empty-state">
          <h2>Nessun dato ricevuto</h2>
          <p>Controlla che ESP32 sia acceso e che Supabase riceva righe.</p>
        </section>
      )}

      {latest && (
        <>
          <section className="cards">
            <MetricCard title="Temperatura" value={latest.temperature} unit="°C" />
            <MetricCard title="Umidità" value={latest.humidity} unit="%" />
            <MetricCard title="VPD" value={latest.vpd} unit="kPa" />
            <MetricCard title="Dew Point" value={latest.dew_point} unit="°C" />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Andamento climatico</h2>
                <p>
                  Intervallo: {timeRange} · Letture: {readings.length}
                </p>
              </div>

              <div className="range-buttons">
                {[
                  ["15m", "15 min"],
                  ["1h", "1 ora"],
                  ["1d", "1 giorno"],
                  ["1w", "1 settimana"],
                ].map(([value, label]) => (
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

            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: -18, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="temperature" name="Temp °C" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="humidity" name="UR %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vpd" name="VPD" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="dew_point" name="Dew Point" stroke="#a855f7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <h2>Ultime letture</h2>

            <div className="reading-list">
              {[...readings].reverse().slice(0, 12).map((row) => (
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
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({ title, value, unit }) {
  return (
    <article className="metric-card">
      <p>{title}</p>
      <h2>
        {value} <span>{unit}</span>
      </h2>
    </article>
  );
}