import React, { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Bot,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

// Staged iPhone-friendly page. Status comes from CAREFA, never from a click or localStorage.
// API is injectable so the UI can be tested without touching a real account.
const defaultApi = {
  async status() {
    const r = await base44.functions.invoke("carefaAiCompanionConnections", {
      action: "status",
    });
    return r.data || r;
  },
  async withdraw() {
    return base44.functions.invoke("carefaAiCompanionConnections", {
      action: "withdraw",
    });
  },
  async disconnect(connectionId) {
    return base44.functions.invoke("carefaAiCompanionConnections", {
      action: "disconnect",
      connection_id: connectionId,
    });
  },
};
const labels = {
  not_connected: "Not connected",
  awaiting_authorisation: "Awaiting authorisation",
  expired: "Expired — reconnect to continue",
  disconnected: "Disconnected",
  connection_failed: "Connection failed",
  awaiting_chatgpt: "Finish in ChatGPT",
  awaiting_verification: "Authorised — waiting for a collection read",
  connected: "Connected",
  reconnect_required: "Reconnect required",
};
export default function MyAiAssistants({ api = defaultApi }) {
  const [state, setState] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const result = await api.status();
      if (
        result.provider !== "ChatGPT" ||
        result.read_only !== true ||
        !labels[result.status]
      )
        throw Error("Invalid status");
      if (version === requestVersion.current) setState(result);
    } catch {
      if (version !== requestVersion.current) return;
      setState(null);
      setError("We could not check your connection. Please try again.");
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }, [api]);
  useEffect(() => {
    refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      ++requestVersion.current;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const disconnect = async () => {
    if (!state?.connection_id && !state?.terminal_consent) return;
    setBusy(true);
    setError("");
    try {
      if (state?.terminal_consent && api.withdraw) await api.withdraw();
      else await api.disconnect(state.connection_id);
      setConfirm(false);
      await refresh();
    } catch {
      setError(
        "We could not confirm the change. Check your connection status before trying again.",
      );
      setBusy(false);
    }
  };
  // Backend-supplied URL is revalidated in the browser before navigation.
  let launch = null;
  try {
    const u = new URL(state?.listing_url);
    if (
      u.origin === "https://chatgpt.com" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      /^\/(plugins|apps)\/[A-Za-z0-9_-]+$/.test(u.pathname)
    )
      launch = u.href;
  } catch {}
  return (
    <div
      className="min-h-screen bg-background text-foreground pb-28"
      style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}
    >
      <header className="carefa-page-masthead px-4 pt-8 pb-5">
        <p className="text-primary text-xs font-bold uppercase tracking-widest">
          Your collecting companion
        </p>
        <h1 className="font-heading font-black text-2xl mt-2">
          My AI Assistants
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your collection. Your assistant. You stay in control.
        </p>
      </header>
      <main className="max-w-lg mx-auto px-4 space-y-4">
        <details className="carefa-luxe-panel rounded-2xl border border-border bg-card p-4">
          <summary className="min-h-12 flex items-center font-bold cursor-pointer">
            Add My AI Assistant
          </summary>
          <a
            href="#chatgpt-connection"
            className="min-h-12 flex items-center text-primary"
          >
            Choose ChatGPT
          </a>
          <p className="text-xs text-muted-foreground">
            Continue below to approve read-only access. Choosing an assistant
            does not connect it.
          </p>
        </details>
        <section
          id="chatgpt-connection"
          className="carefa-luxe-panel rounded-3xl border border-primary/40 bg-card p-5"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="text-primary" size={26} />
            </div>
            <div className="flex-1">
              <h2 className="font-heading font-bold text-lg">ChatGPT</h2>
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground"
              >
                {busy
                  ? "Checking…"
                  : state
                    ? labels[state.status]
                    : "Connection unavailable"}
              </p>
            </div>
            {!busy && state?.status === "connected" && (
              <CheckCircle2
                className="text-primary"
                aria-label="Connection verified"
              />
            )}
          </div>
          <p className="mt-3 text-xs text-primary">
            CAREFA account:{" "}
            {state?.collector_label || "your signed-in collector"}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Ask your usual ChatGPT about your Pokémon collection, collecting
            goals and binder ideas.
          </p>
          <div className="rounded-2xl bg-primary/10 p-3 mt-4 flex gap-2">
            <ShieldCheck className="text-primary shrink-0" size={20} />
            <p className="text-sm">
              <strong>Read-only access.</strong> Your AI cannot add, remove,
              sell or edit cards, profiles, achievements or settings.
            </p>
          </div>
          {state?.status === "connected" ? (
            <a
              className="mt-4 min-h-12 w-full rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2"
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open ChatGPT <ExternalLink size={17} />
            </a>
          ) : launch && state?.available ? (
            <a
              className="mt-4 min-h-12 w-full rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2"
              href={launch}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue in ChatGPT <ChevronRight size={18} />
            </a>
          ) : (
            <p className="mt-4 p-3 rounded-xl border border-border text-sm text-muted-foreground">
              ChatGPT connection is being prepared for collectors. It is not
              available to connect from this page yet.
            </p>
          )}
          <button
            onClick={refresh}
            disabled={busy}
            className="min-h-12 mt-2 w-full flex items-center justify-center gap-2 text-sm text-primary disabled:opacity-50"
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            Check connection
          </button>
          {state?.verified_at && (
            <p className="text-xs text-muted-foreground">
              CAREFA read-only access last verified{" "}
              {new Date(state.verified_at).toLocaleString()}. ChatGPT may ask
              you to reconnect.
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-heading font-bold">How connecting works</h2>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
            <li>Open CAREFA’s listing in ChatGPT and choose Connect.</li>
            <li>
              Sign into the CAREFA account you want to share and approve
              read-only access.
            </li>
            <li>Return to ChatGPT and ask about your collection.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-3">
            CAREFA and ChatGPT are separate apps. Signing in to ChatGPT happens
            with ChatGPT; CAREFA never asks for your ChatGPT password.
          </p>
        </section>
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="min-h-8 font-bold cursor-pointer">
            What your AI can read
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc pl-5">
            <li>Cards, quantities, variants and languages</li>
            <li>Available collection values, set progress and missing cards</li>
            <li>Collector Scores, badges and supported achievement progress</li>
            <li>Your wishlist and binder themes</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Some progress information may be unavailable until verified.
            Passwords, email addresses, private purchase notes and messages are
            excluded. Collection text is shared as information, not
            instructions.
          </p>
        </details>
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">Try asking</h2>
          <ul className="mt-2 text-sm text-muted-foreground space-y-2">
            <li>“What could I collect next?”</li>
            <li>“How close am I to my next Kanto badge?”</li>
            <li>“Suggest a fire-themed binder from my cards.”</li>
          </ul>
        </section>
        {(state?.connection_id ||
          (state?.terminal_consent && state?.permission_granted)) && (
          <button
            onClick={() => setConfirm(true)}
            disabled={busy}
            className="min-h-12 w-full rounded-xl border border-border text-sm"
          >
            {state?.terminal_consent
              ? "Withdraw all V1 ChatGPT access"
              : "Disconnect this CAREFA connection"}
          </button>
        )}
        {confirm && (
          <section
            role="group"
            aria-labelledby="disconnect-title"
            className="rounded-2xl border border-primary/40 bg-card p-4"
          >
            <h2 id="disconnect-title" className="font-bold">
              Disconnect ChatGPT?
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {state?.terminal_consent
                ? "This revokes all V1 ChatGPT links and pending approvals for this CAREFA account. A completely new authorisation is required to reconnect."
                : "This stops future CAREFA reads through this connection."}{" "}
              Information already shared with ChatGPT is not deleted.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                className="min-h-12 flex-1 border border-border rounded-xl"
                onClick={() => setConfirm(false)}
              >
                Keep connected
              </button>
              <button
                className="min-h-12 flex-1 bg-primary text-primary-foreground rounded-xl"
                disabled={busy}
                onClick={disconnect}
              >
                Disconnect access
              </button>
            </div>
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
