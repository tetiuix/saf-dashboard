import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TIME_RANGES = [
  ["15m", "15 min"],
  ["1h", "1 ora"],
  ["1d", "1 giorno"],
  ["1w", "1 settimana"],
];

const PLANT_STAGES = {
  seedlingClone: {
    label: "Seedling / Clone",
    description: "Target basato sulla fase cloni del manuale Athena.",
    targets: {
      temperature: [23, 26],
      humidity: [65, 75],
      vpd: [0.8, 0.8],
      dew_point: null,
    },
  },
  veg: {
    label: "Vegetativa",
    description: "Crescita attiva: clima stabile e VPD basso-medio.",
    targets: {
      temperature: [22, 28],
      humidity: [58, 75],
      vpd: [0.8, 1.0],
      dew_point: null,
    },
  },
  flowerStretch: {
    label: "Fioritura Stretch",
    description: "Settimane 1-3: allungamento e transizione in fiore.",
    targets: {
      temperature: [25, 28],
      humidity: [60, 72],
      vpd: [1.0, 1.2],
      dew_point: null,
    },
  },
  flowerBulk: {
    label: "Fioritura Bulk",
    description: "Settimane 4-7: ingrossamento fiore.",
    targets: {
      temperature: [24, 26],
      humidity: [60, 70],
      vpd: [1.0, 1.2],
      dew_point: null,
    },
  },
  flowerFinish: {
    label: "Finitura",
    description: "Settimane 8-9: umidità più bassa e controllo muffe.",
    targets: {
      temperature: [18, 24],
      humidity: [50, 60],
      vpd: [1.2, 1.4],
      dew_point: null,
    },
  },
  dryCure: {
    label: "Dry / Cure",
    description: "Asciugatura e cura: focus su temperatura e umidità.",
    targets: {
      temperature: [15, 18],
      humidity: [55, 60],
      vpd: null,
      dew_point: null,
    },
  },
};

const METRICS = [
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
    lowText: "Dew point basso",
    highText: "Dew point alto",
  },
];

function getStoredStage() {
  const saved = localStorage.getItem("saf_plant_stage");
  return PLANT_STAGES[saved] ? saved : "veg";
}

function getStoredMetric() {
  const saved = localStorage.getItem("saf_active_metric");
  return METRICS.some((metric) => metric.key === saved) ? saved : "vpd";
}

function getStoredRange() {
  const saved = localStorage.getItem("saf_time_range");
  return TIME_RANGES.some(([value]) => value === saved) ? saved : "1h";
}

function formatDate(value) {
  if (!value) return "Mai";
  return new Date(value).toLocaleString("it-IT");
}

function formatTarget(target, unit) {
  if (!target) return "Solo monitoraggio";
  if (target[0] === target[1]) return `${target[0]} ${unit}`;
  return `${target[0]}–${target[1]} ${unit}`;
}

function getRangeStart(range) {
  const fromDate = new Date();

  if (range === "15m") fromDate.setMinutes(fromDate.getMinutes() - 15);
  if (range === "1h") fromDate.setHours(fromDate.getHours() - 1);
  if (range === "1d") fromDate.setDate(fromDate.getDate() - 1);
  if (range === "1w") fromDate.setDate(fromDate.getDate() - 7);

  return fromDate;
}

function getFreshness(latest) {
  if (!latest) return { online: false, label: "Offline", ageSeconds: null };

  const ageMs = Date.now() - new Date(latest.created_at).getTime();
  const ageSeconds = Math.round(ageMs / 1000);

  if (ageSeconds > 180) return { online: false, label: "Offline", ageSeconds };
  if (ageSeconds > 90) return { online: true, label: "In ritardo", ageSeconds };

  return { online: true, label: "Online", ageSeconds };
}

function getChartDomain(data, key, target) {
  const values = data
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));

  if (target) {
    values.push(target[0]);
    values.push(target[1]);
  }

  if (values.length === 0) return ["auto", "auto"];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = key === "vpd" ? 0.15 : 2;
    return [min - padding, max + padding];
  }

  const range = max - min;
  const padding = Math.max(range * 0.2, key === "vpd" ? 0.08 : 0.8);

  return [
    Number((min - padding).toFixed(2)),
    Number((max + padding).toFixed(2)),
  ];
}

export default function App() {
  const [readings, setReadings] = useState([]);
  const [timeRange, setTimeRange] = useState(getStoredRange);
  const [plantStage, setPlantStage] = useState(getStoredStage);
  const [activeMetric, setActiveMetric] = useState(getStoredMetric);
  const [stageUpdatedAt, setStageUpdatedAt] = useState(
    localStorage.getItem("saf_plant_stage_updated_at")
  );
  const [pendingStage, setPendingStage] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const [loading, setLoading] = useState(true);

  const activeStage = PLANT_STAGES[plantStage] || PLANT_STAGES.veg;
  const latest = readings[readings.length - 1];
  const freshness = getFreshness(latest);

  async function loadReadings(range = timeRange) {
    const fromDate = getRangeStart(range);

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

  useEffect(() => {
    localStorage.setItem("saf_time_range", timeRange);
  }, [timeRange]);

  useEffect(() => {
    localStorage.setItem("saf_active_metric", activeMetric);
  }, [activeMetric]);

  const metrics = useMemo(() => {
    return METRICS.map((metric) => ({
      ...metric,
      ideal: activeStage.targets[metric.key] || null,
    }));
  }, [activeStage]);

  const chartData = useMemo(() => {
    return readings.map((row) => ({
      ...row,
      time: new Date(row.created_at).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  }, [readings]);

  const metricStates = useMemo(() => {
    if (!latest) return [];

    return metrics.map((metric) => {
      const value = Number(latest[metric.key]);

      if (!Number.isFinite(value)) {
        return {
          ...metric,
          value: null,
          state: "info",
          message: "Dato non disponibile",
          direction: "info",
        };
      }

      if (!metric.ideal) {
        return {
          ...metric,
          value,
          state: "info",
          message: "Solo monitoraggio",
          direction: "info",
        };
      }

      const [min, max] = metric.ideal;

      if (value < min) {
        return {
          ...metric,
          value,
          state: "warning",
          message: metric.lowText,
          direction: "low",
        };
      }

      if (value > max) {
        return {
          ...metric,
          value,
          state: "danger",
          message: metric.highText,
          direction: "high",
        };
      }

      return {
        ...metric,
        value,
        state: "good",
        message: "Valore ottimale",
        direction: "ok",
      };
    });
  }, [latest, metrics]);

  const score = useMemo(() => {
    if (!latest || !freshness.online) return 0;

    const scored = metricStates.filter((m) => m.ideal && m.value !== null);
    if (scored.length === 0) return 0;

    const good = scored.filter((m) => m.state === "good").length;
    return Math.round((good / scored.length) * 100);
  }, [latest, freshness.online, metricStates]);

  const globalStatus = useMemo(() => {
    if (!latest || !freshness.online)
      return { label: "Offline", className: "danger" };

    if (score >= 90) return { label: "Ottimale", className: "good" };
    if (score >= 60) return { label: "Da regolare", className: "warning" };

    return { label: "Critico", className: "danger" };
  }, [latest, freshness.online, score]);

  const activeMetricData =
    metrics.find((metric) => metric.key === activeMetric) || metrics[0];

  const activeMetricState =
    metricStates.find((metric) => metric.key === activeMetric) || null;

  const yDomain = useMemo(() => {
    return getChartDomain(chartData, activeMetricData.key, activeMetricData.ideal);
  }, [chartData, activeMetricData]);

  const recommendedActions = useMemo(() => {
    if (!latest) return ["In attesa dei dati dal dispositivo."];

    if (!freshness.online) {
      return [
        "Dispositivo offline: controlla alimentazione ESP32.",
        "Verifica che il WiFi sia attivo.",
        "Controlla che Supabase riceva nuove righe.",
      ];
    }

    const actions = metricStates
      .filter((m) => m.ideal && m.state !== "good")
      .map((m) => {
        if (m.key === "humidity" && m.direction === "low") {
          return "Aumenta umidità: attiva umidificatore o riduci estrazione.";
        }

        if (m.key === "humidity" && m.direction === "high") {
          return "Abbassa umidità: aumenta estrazione o deumidificazione.";
        }

        if (m.key === "temperature" && m.direction === "low") {
          return "Aumenta temperatura: valuta riscaldamento o minore estrazione.";
        }

        if (m.key === "temperature" && m.direction === "high") {
          return "Abbassa temperatura: aumenta ventilazione o riduci calore lampada.";
        }

        if (m.key === "vpd" && m.direction === "low") {
          return "VPD basso: riduci umidità o aumenta leggermente temperatura.";
        }

        if (m.key === "vpd" && m.direction === "high") {
          return "VPD alto: aumenta umidità o abbassa temperatura.";
        }

        return `${m.label}: ${m.message}.`;
      });

    if (actions.length === 0) {
      return [
        "Parametri nel target della fase selezionata.",
        "Mantieni configurazione attuale.",
        "Continua monitoraggio trend VPD.",
      ];
    }

    return actions;
  }, [latest, freshness.online, metricStates]);

  const events = useMemo(() => {
    const list = [];

    if (!latest) return list;

    if (!freshness.online) {
      list.push({
        type: "danger",
        title: "Dispositivo offline",
        text: `Ultimo dato ricevuto ${freshness.ageSeconds}s fa.`,
      });
    }

    metricStates.forEach((m) => {
      if (m.ideal && m.state !== "good") {
        list.push({
          type: m.state,
          title: `${m.label}: ${m.message}`,
          text: `${m.value.toFixed(2)} ${m.unit} · Target ${formatTarget(
            m.ideal,
            m.unit
          )}`,
        });
      }
    });

    if (list.length === 0) {
      list.push({
        type: "good",
        title: "Ambiente stabile",
        text: "Tutti i valori con target sono nel range della fase selezionata.",
      });
    }

    return list;
  }, [latest, freshness, metricStates]);

  function requestStageChange(stageKey) {
    if (stageKey === plantStage) return;
    setPendingStage(stageKey);
  }

  function confirmStageChange() {
    if (!pendingStage || !PLANT_STAGES[pendingStage]) return;

    const now = new Date().toISOString();

    setPlantStage(pendingStage);
    setStageUpdatedAt(now);

    localStorage.setItem("saf_plant_stage", pendingStage);
    localStorage.setItem("saf_plant_stage_updated_at", now);

    setPendingStage(null);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SAF Climate</strong>
            <span>Growbox OS</span>
          </div>
        </div>

        <nav>
          <a className="active">Overview</a>
          <a>Climate</a>
          <a>Grow Profile</a>
          <a>Alerts</a>
        </nav>

        <div className="device-mini">
          <span className={`online-dot ${freshness.online ? "on" : "off"}`}></span>
          <div>
            <strong>ESP32 Test Unit</strong>
            <p>{freshness.label}</p>
          </div>
        </div>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live Environment</p>
            <h1>Dashboard Growbox</h1>
            <p className="subtitle">
              Ultimo dato: {latest ? formatDate(latest.created_at) : "nessun dato"}
            </p>
          </div>

          <div className={`status-pill ${globalStatus.className}`}>
            <span />
            {globalStatus.label}
          </div>
        </header>

        <section className="profile-panel">
          <div>
            <p className="eyebrow">Grow Profile</p>
            <h2>{activeStage.label}</h2>
            <p>{activeStage.description}</p>
            <small>Profilo salvato · Ultima modifica: {formatDate(stageUpdatedAt)}</small>
          </div>

          <div className="stage-buttons">
            {Object.entries(PLANT_STAGES).map(([key, stage]) => (
              <button
                key={key}
                className={plantStage === key ? "active" : ""}
                onClick={() => requestStageChange(key)}
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
                <span>Valutazione basata su fase {activeStage.label}.</span>
              </div>

              <div className="ai-card">
                <div className="section-title">
                  <h2>Azioni consigliate</h2>
                  <span>Smart logic</span>
                </div>

                <ul>
                  {recommendedActions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="target-strip">
              {metrics
                .filter((metric) => metric.key !== "dew_point")
                .map((metric) => (
                  <div key={metric.key}>
                    <span>{metric.label}</span>
                    <strong>{formatTarget(metric.ideal, metric.unit)}</strong>
                  </div>
                ))}
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
                    Target profilo:{" "}
                    {formatTarget(activeMetricData.ideal, activeMetricData.unit)}
                  </p>
                </div>

                <div className="range-buttons">
                  {TIME_RANGES.map(([value, label]) => (
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
                    margin={{ top: 20, right: 14, left: -22, bottom: 8 }}
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

                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      allowDataOverflow={false}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "var(--tooltip-bg)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        borderRadius: "12px",
                      }}
                      labelStyle={{ color: "var(--text)" }}
                    />

                    {activeMetricData.ideal && (
                      <>
                        <ReferenceLine
                          y={activeMetricData.ideal[0]}
                          stroke="var(--green)"
                          strokeDasharray="4 4"
                        />
                        <ReferenceLine
                          y={activeMetricData.ideal[1]}
                          stroke="var(--green)"
                          strokeDasharray="4 4"
                        />
                      </>
                    )}

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

              {activeMetricState && (
                <div className={`chart-advice ${activeMetricState.state}`}>
                  <strong>{activeMetricState.message}</strong>
                  <span>
                    Valore attuale:{" "}
                    {activeMetricState.value !== null
                      ? activeMetricState.value.toFixed(2)
                      : "--"}{" "}
                    {activeMetricState.unit}
                  </span>
                </div>
              )}
            </section>

            <section className="two-col">
              <section className="panel">
                <div className="section-title">
                  <h2>Device Status</h2>
                  <span>{freshness.label}</span>
                </div>

                <div className="status-list">
                  <StatusRow
                    label="ESP32"
                    value={freshness.online ? "Online" : "Offline"}
                    state={freshness.online ? "good" : "danger"}
                  />
                  <StatusRow label="Sensore DHT22" value="OK" state="good" />
                  <StatusRow label="Supabase Sync" value="Attivo" state="good" />
                  <StatusRow
                    label="Ultimo update"
                    value={freshness.ageSeconds ? `${freshness.ageSeconds}s fa` : "Live"}
                    state="info"
                  />
                </div>
              </section>

              <section className="panel">
                <div className="section-title">
                  <h2>Eventi & Alert</h2>
                  <button className="tiny-button" onClick={() => setShowEvents(!showEvents)}>
                    {showEvents ? "Nascondi" : "Mostra"}
                  </button>
                </div>

                {showEvents && (
                  <div className="event-list">
                    {events.map((event, index) => (
                      <article key={index} className={`event-card ${event.type}`}>
                        <strong>{event.title}</strong>
                        <p>{event.text}</p>
                      </article>
                    ))}
                  </div>
                )}
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

      {pendingStage && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="eyebrow">Conferma modifica</p>
            <h2>Cambiare fase pianta?</h2>
            <p>
              Stai passando da <strong>{activeStage.label}</strong> a{" "}
              <strong>{PLANT_STAGES[pendingStage].label}</strong>.
            </p>
            <p>Questo cambierà target climatici, score e azioni consigliate.</p>

            <div className="modal-actions">
              <button onClick={() => setPendingStage(null)}>Annulla</button>
              <button className="confirm" onClick={confirmStageChange}>
                Conferma cambio fase
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MetricCard({ metric, active, onClick }) {
  return (
    <button
      className={`metric-card ${metric.state} ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="metric-top">
        <p>{metric.label}</p>
        <span className="metric-dot" style={{ background: metric.color }} />
      </div>

      <h2>
        {metric.value !== null ? metric.value.toFixed(2) : "--"}{" "}
        <span>{metric.unit}</span>
      </h2>

      <div className={`metric-action ${metric.state}`}>{metric.message}</div>

      <small>Target: {formatTarget(metric.ideal, metric.unit)}</small>
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