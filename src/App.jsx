import { useEffect, useState } from "react";
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
      .limit(2000);

    if (error) {
      console.error("Errore Supabase:", error);
      return;
    }

    setReadings(data);
  }

  useEffect(() => {
    loadReadings(timeRange);

    const interval = setInterval(() => {
      loadReadings(timeRange);
    }, 5000);

    return () => clearInterval(interval);
  }, [timeRange]);

  function changeRange(range) {
    setTimeRange(range);
    loadReadings(range);
  }

  const latest = readings[readings.length - 1];

  return (
    <main className="dashboard">
      <h1>SAF Climate Dashboard</h1>

      {!latest && <p>Nessun dato ricevuto in questo intervallo.</p>}

      {latest && (
        <>
          <section className="cards">
            <Card title="Temperatura" value={latest.temperature} unit="°C" />
            <Card title="Umidità" value={latest.humidity} unit="%" />
            <Card title="VPD" value={latest.vpd} unit="kPa" />
            <Card title="Dew Point" value={latest.dew_point} unit="°C" />
          </section>

          <div className="range-buttons">
            <button
              type="button"
              className={timeRange === "1h" ? "active" : ""}
              onClick={() => changeRange("1h")}
            >
              1 ora
            </button>

            <button
              type="button"
              className={timeRange === "1d" ? "active" : ""}
              onClick={() => changeRange("1d")}
            >

              
              1 giorno
            </button>

            <button
            type="button"
            className={timeRange === "15m" ? "active" : ""}
            onClick={() => changeRange("15m")}
            >
            15 min
            </button>

            <button
              type="button"
              className={timeRange === "1w" ? "active" : ""}
              onClick={() => changeRange("1w")}
            >
              1 settimana
            </button>
          </div>

          <section className="chart-box">
            <h2>Andamento nel tempo</h2>

            <p>
           Intervallo attivo: {timeRange} — Letture caricate: {readings.length}
           </p>

            

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={readings}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="created_at"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />

                <YAxis />

                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value).toLocaleString("it-IT")
                  }
                />

                <Legend />

                <Line
                  type="monotone"
                  dataKey="temperature"
                  name="Temperatura °C"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />

                <Line
                  type="monotone"
                  dataKey="humidity"
                  name="Umidità %"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />

                <Line
                  type="monotone"
                  dataKey="vpd"
                  name="VPD kPa"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />

                <Line
                  type="monotone"
                  dataKey="dew_point"
                  name="Dew Point °C"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <h2>Ultime letture</h2>

          <table>
            <thead>
              <tr>
                <th>Ora</th>
                <th>Temp</th>
                <th>Umidità</th>
                <th>VPD</th>
                <th>Dew Point</th>
              </tr>
            </thead>

            <tbody>
              {[...readings].reverse().slice(0, 20).map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString("it-IT")}</td>
                  <td>{row.temperature} °C</td>
                  <td>{row.humidity} %</td>
                  <td>{row.vpd} kPa</td>
                  <td>{row.dew_point} °C</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

function Card({ title, value, unit }) {
  return (
    <div className="card">
      <p>{title}</p>
      <h2>
        {value} <span>{unit}</span>
      </h2>
    </div>
  );
}