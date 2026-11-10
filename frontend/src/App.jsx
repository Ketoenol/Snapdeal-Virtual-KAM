
import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Phone, PhoneOff, Bot,
  TrendingDown, Package, ShoppingCart, Activity,
  ClipboardList, CheckCircle2, Clock
} from "lucide-react";
import "./App.css";

// Updated API URL for local development and production deployment
const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/chat`;

const metrics = [
  { label: "Monthly Sales", value: "₹1,35,000", change: "-32.5%", icon: TrendingDown },
  { label: "Total Orders", value: "270", change: "-32.5%", icon: ShoppingCart },
  { label: "Cancellation Rate", value: "14%", change: "+9 pp", icon: Activity },
  { label: "Out of Stock", value: "18", change: "+13", icon: Package }
];

const initialActions = [
  {
    id: 1,
    priority: "HIGH PRIORITY",
    title: "Investigate cancellation reasons",
    description: "Review cancelled orders from the last 7 days and identify the top 2 cancellation reasons.",
    status: "Pending"
  },
  {
    id: 2,
    priority: "MEDIUM PRIORITY",
    title: "Review pending dispatches",
    description: "Check pending shipments daily and identify orders at risk of dispatch delays.",
    status: "Pending"
  },
  {
    id: 3,
    priority: "MEDIUM PRIORITY",
    title: "Verify inventory and listings",
    description: "Update stock for 18 unavailable products and pause listings that cannot be fulfilled.",
    status: "Pending"
  }
];

function cleanForSpeech(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [actions, setActions] = useState(initialActions);

  const historyRef = useRef([]);
  const recognitionRef = useRef(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const loadingRef = useRef(false);
  const speakingRef = useRef(false);

  const completedCount = actions.filter(
    (action) => action.status === "Completed"
  ).length;

  const updateActionStatus = (id, status) => {
    setActions((prev) =>
      prev.map((action) =>
        action.id === id ? { ...action, status } : action
      )
    );
  };

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setListening(false);

      if (transcript) sendMessage(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition:", event.error);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      activeRef.current = false;
      recognition.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = (text) => {
    return new Promise((resolve) => {
      if (mutedRef.current || !window.speechSynthesis) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const spokenText = cleanForSpeech(text);

      if (!spokenText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = "en-IN";
      utterance.rate = 0.95;

      speakingRef.current = true;

      utterance.onend = () => {
        speakingRef.current = false;
        resolve();
      };

      utterance.onerror = () => {
        speakingRef.current = false;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const listen = () => {
    if (
      !activeRef.current ||
      mutedRef.current ||
      loadingRef.current ||
      speakingRef.current
    ) return;

    if (!recognitionRef.current) {
      alert("Please use Chrome or Edge for voice recognition.");
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.log("Microphone:", error.message);
    }
  };

  const sendMessage = async (message) => {
    const cleanMessage = message.trim();

    if (!cleanMessage || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: cleanMessage }
    ]);

    setInput("");

    const previousHistory = [...historyRef.current];

    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanMessage,
          history: previousHistory
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      const reply = String(data.reply || "").trim();

      console.log("Complete Gemini reply:", reply);
      console.log("Reply length:", reply.length);

      if (!reply) {
        throw new Error("AI returned an empty response.");
      }

      historyRef.current = [
        ...previousHistory,
        { role: "user", text: cleanMessage },
        { role: "assistant", text: reply }
      ].slice(-20);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply }
      ]);

      loadingRef.current = false;
      setLoading(false);

      await speak(reply);

      if (activeRef.current && !mutedRef.current) {
        setTimeout(listen, 800);
      }

    } catch (error) {
      console.error("Chat error:", error);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Sorry, ${error.message}` }
      ]);

      loadingRef.current = false;
      setLoading(false);

      if (activeRef.current && !mutedRef.current) {
        setTimeout(listen, 800);
      }
    }
  };

  const startCall = async () => {
    if (activeRef.current) return;

    activeRef.current = true;
    setActive(true);
    historyRef.current = [];

    const greeting =
      "Hello! Welcome to Snapdeal Virtual KAM. I'm here to help improve your store's performance. How can I assist you today?";

    setMessages([{ role: "assistant", text: greeting }]);

    await speak(greeting);

    if (activeRef.current && !mutedRef.current) {
      listen();
    }
  };

  const endCall = () => {
    activeRef.current = false;
    setActive(false);
    setListening(false);
    speakingRef.current = false;

    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  };

  const toggleMute = () => {
    const next = !muted;

    mutedRef.current = next;
    setMuted(next);

    if (next) {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      setListening(false);
    } else if (activeRef.current && !loadingRef.current) {
      listen();
    }
  };

  return (
    <main className="dashboard">

      {/* HEADER */}
      <header className="topbar">
        <div className="brand">
          <img
            src="/snapdeal-logo.svg"
            alt="Snapdeal"
            className="snapdeal-logo"
          />

          <div className="brand-divider"></div>

          <div className="brand-copy">
            <h2>Virtual KAM</h2>
            <small>AI SELLER ASSISTANT</small>
          </div>
        </div>

        <div className="status">
          <span /> SYSTEM ONLINE
        </div>
      </header>

      {/* WELCOME BANNER */}
      <section className="welcome welcome-banner">
        <div className="welcome-content">
          <p className="eyebrow">SNAPDEAL SELLER EXPERIENCE</p>

          <h1>Good day, Sharma Fashion Store.</h1>

          <p>
            Your Virtual Key Account Manager is ready to help you
            understand performance, resolve challenges and grow
            your business.
          </p>

          <div className="welcome-tags">
            <span>AI POWERED</span>
            <span>VOICE ENABLED</span>
            <span>SELLER FIRST</span>
          </div>
        </div>

        <div className="welcome-decoration">
          <div className="welcome-circle circle-one"></div>
          <div className="welcome-circle circle-two"></div>
          <div className="welcome-mark">S</div>
        </div>
      </section>

      {/* PERFORMANCE METRICS */}
      <section className="metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article className="metric-card" key={metric.label}>
              <div className="metric-heading">
                <span>{metric.label}</span>
                <Icon size={19} />
              </div>

              <h2>{metric.value}</h2>
              <small>{metric.change} vs last month</small>
            </article>
          );
        })}
      </section>

      {/* BUSINESS INSIGHTS */}
      <section className="insights">
        <div>
          <p className="eyebrow">BUSINESS INSIGHT</p>
          <h2>Sales need attention</h2>

          <p>
            Sales declined from ₹2,00,000 to ₹1,35,000.
            Cancellation rates and out-of-stock products increased.
            Let's investigate the reasons together.
          </p>
        </div>

        <TrendingDown size={38} />
      </section>

      {/* ACTION TRACKER */}
      <section className="action-tracker">
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px"
        }}>
          <div style={{
            display: "flex",
            gap: "12px",
            alignItems: "center"
          }}>
            <ClipboardList color="#E40046" size={25} />

            <div>
              <p className="eyebrow">AI-DRIVEN EXECUTION</p>
              <h2 style={{ margin: 0 }}>Seller Action Tracker</h2>
            </div>
          </div>

          <span style={{
            color: "#159957",
            fontSize: "12px",
            fontWeight: "700"
          }}>
            {completedCount}/{actions.length} COMPLETED
          </span>
        </div>

        <div style={{
          height: "7px",
          background: "#eceef1",
          borderRadius: "10px",
          overflow: "hidden",
          marginBottom: "22px"
        }}>
          <div style={{
            height: "100%",
            width: `${(completedCount / actions.length) * 100}%`,
            background: "#159957",
            borderRadius: "10px",
            transition: "width 0.3s"
          }} />
        </div>

        <div style={{ display: "grid", gap: "13px" }}>
          {actions.map((action) => (
            <article
              key={action.id}
              style={{
                padding: "17px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap"
              }}
            >
              <div style={{ flex: "1", minWidth: "220px" }}>
                <span style={{
                  color: action.priority === "HIGH PRIORITY"
                    ? "#E40046"
                    : "#b7791f",
                  fontSize: "9px",
                  fontWeight: "800",
                  letterSpacing: "1px"
                }}>
                  {action.priority}
                </span>

                <h3 style={{
                  margin: "7px 0",
                  fontSize: "14px",
                  color: "#292d34"
                }}>
                  {action.title}
                </h3>

                <p style={{
                  fontSize: "11px",
                  lineHeight: "1.7",
                  margin: 0
                }}>
                  {action.description}
                </p>
              </div>

              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                {action.status === "Completed" ? (
                  <CheckCircle2 color="#159957" size={18} />
                ) : (
                  <Clock color="#b7791f" size={18} />
                )}

                <select
                  value={action.status}
                  onChange={(e) =>
                    updateActionStatus(action.id, e.target.value)
                  }
                  style={{
                    background: "#f8f9fb",
                    color: "#343a40",
                    border: "1px solid #e5e8ed",
                    borderRadius: "7px",
                    padding: "9px",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </article>
          ))}
        </div>

        <p style={{
          fontSize: "10px",
          marginTop: "17px"
        }}>
          Suggested actions based on mock seller data.
          Update statuses as tasks are completed.
        </p>
      </section>

      {/* VIRTUAL KAM ASSISTANT */}
      <section className="assistant">

        <div className="assistant-header">
          <div className="bot-icon">
            <Bot size={25} />
          </div>

          <div>
            <h2>Virtual Key Account Manager</h2>
            <p>Powered by Gemini AI</p>
          </div>

          <span className="live-status">
            {active ? "CALL ACTIVE" : "READY"}
          </span>
        </div>

        {/* CONVERSATION */}
        <div className="conversation">
          {messages.length === 0 ? (
            <div className="empty">
              <Bot size={42} />
              <h3>Let's grow your business.</h3>
              <p>
                Start a voice conversation with your AI assistant.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                className={`message ${msg.role}`}
                key={index}
              >
                <strong>
                  {msg.role === "user"
                    ? "SELLER"
                    : "AI ASSISTANT"}
                </strong>

                <p>{msg.text}</p>
              </div>
            ))
          )}

          {loading && (
            <p className="typing">AI is thinking...</p>
          )}
        </div>

        {/* VOICE CONTROLS */}
        <div className="voice-controls">
          <button
            className="call-button"
            onClick={active ? endCall : startCall}
          >
            {active ? <PhoneOff size={17} /> : <Phone size={17} />}
            {active ? "END CALL" : "START CALL"}
          </button>

          <button
            className={`mic-button ${listening ? "listening" : ""}`}
            onClick={() => {
              if (listening) {
                recognitionRef.current?.stop();
              } else {
                listen();
              }
            }}
            disabled={!active || loading || muted}
          >
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
            {listening ? "STOP LISTENING" : "SPEAK"}
          </button>

          <button
            className="mute-button"
            onClick={toggleMute}
          >
            {muted ? "UNMUTE" : "MUTE"}
          </button>
        </div>

        {/* TEXT INPUT */}
        <form
          className="text-input"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
          >
            SEND
          </button>
        </form>
      </section>

      <footer>
        SNAPDEAL VIRTUAL KAM · AI-POWERED SELLER SUPPORT
      </footer>

    </main>
  );
}

export default App;
