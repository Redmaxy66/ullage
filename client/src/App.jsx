import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { Home } from "./components/Home.jsx";
import { Workspace } from "./components/Workspace.jsx";

export function App() {
  const [user, setUser] = useState(undefined);
  const [projectId, setProjectId] = useState(null);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="boot">Loading Lane Draft…</div>;
  if (!user) return <AuthScreen onUser={setUser} />;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setProjectId(null)} type="button">Lane Draft</button>
        <div className="topbar-user">
          <span>{user.name}</span>
          <button className="button ghost" type="button" onClick={async () => { await api.logout(); setUser(null); setProjectId(null); }}>Sign out</button>
        </div>
      </header>
      {projectId
        ? <Workspace projectId={projectId} onHome={() => setProjectId(null)} />
        : <Home onOpen={setProjectId} />}
    </div>
  );
}
