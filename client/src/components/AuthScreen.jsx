import { useState } from "react";
import { api } from "../api.js";

export function AuthScreen({ onUser }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = mode === "login"
        ? await api.login({ email, password })
        : await api.register({ name, email, password });
      onUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <section className="auth-copy">
          <h1>Lane Draft</h1>
          <p>Turn an operating procedure into a swimlane diagram your team can review, edit, and export.</p>
          <ul className="auth-points">
            <li>Upload a Word or PDF procedure. No pasting.</li>
            <li>Check the extracted steps before a diagram is drawn.</li>
            <li>Each account keeps its own private projects.</li>
          </ul>
        </section>
        <form className="auth-form" onSubmit={submit}>
          <h2>{mode === "login" ? "Sign in" : "Create an account"}</h2>
          {mode === "register" && (
            <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
          )}
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></label>
          {error && <div className="banner bad">{error}</div>}
          <button className="button primary" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          <button className="button ghost" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Need an account?" : "Already have an account?"}
          </button>
        </form>
      </div>
    </div>
  );
}
