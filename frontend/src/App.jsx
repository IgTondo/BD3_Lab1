import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("Loading backend status...");

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        setStatus(`Backend: ${data.backend} | Redis: ${data.redis}`);
      } catch (error) {
        setStatus(`Request failed: ${error.message}`);
      }
    };

    loadStatus();
  }, []);

  return (
    <main className="page">
      <h1>Frontend template</h1>
      <p>{status}</p>
    </main>
  );
}
