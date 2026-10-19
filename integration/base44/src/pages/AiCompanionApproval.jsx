import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
// Staged protected route. Approval is explicit and tied to the account shown.
export default function AiCompanionApproval() {
  const [flow, setFlow] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const callback = new URLSearchParams(window.location.search).get("cb");
  const invoke = async (input) => {
    const r = await base44.functions.invoke("carefaAiCompanionApproval", input);
    return r.data || r;
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await invoke({
          action: "begin",
          callback_url: callback,
        });
        const approval = await invoke({
          action: "approval",
          connection_id: pending.connection_id,
        });
        if (!cancelled) setFlow(approval);
      } catch {
        if (!cancelled)
          setError(
            "This request expired or the account changed. Start again from ChatGPT.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callback]);
  const decide = async (action) => {
    if (!flow || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await invoke({
        action,
        ...(action === "approve" ? { consent_approved: true } : {}),
        connection_id: flow.connection_id,
      });
      const target = new URL(r.redirect_url),
        original = new URL(callback);
      if (
        target.origin !== original.origin ||
        target.pathname !== original.pathname ||
        target.searchParams.get("state") !==
          original.searchParams.get("state") ||
        target.protocol !== "https:"
      )
        throw Error();
      window.location.assign(target.href);
    } catch {
      setError(
        "Approval could not finish. Check your CAREFA account and start again from ChatGPT.",
      );
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-background text-foreground px-4 pt-8 pb-28">
      <section className="carefa-luxe-panel bg-card border border-primary/40 rounded-3xl p-5 max-w-lg mx-auto">
        <p className="text-primary text-xs font-bold uppercase tracking-widest">
          CAREFA AI Companion
        </p>
        <h1 className="font-heading text-2xl font-black mt-3">
          Share read-only access with ChatGPT?
        </h1>
        <p className="mt-4 text-sm">
          CAREFA account:{" "}
          <strong>
            {flow?.collector_label || "Checking your signed-in account…"}
          </strong>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Your assistant can read your cards, quantities, available values, set
          progress, Collector Scores, achievements, wishlist and binder
          information. Unavailable information stays unavailable.
        </p>
        <p className="mt-3 text-sm font-bold text-primary">
          It cannot add, delete, sell or edit cards, profiles, achievements or
          settings.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Passwords, email addresses, private purchase notes and messages are
          excluded. Information already shared with ChatGPT may remain in your
          chat after you disconnect.
        </p>
        <p className="mt-3 text-sm">
          Wrong CAREFA account? Cancel and start again after signing into the
          account you want to share. Safari and your Home Screen app may use
          different sessions.
        </p>
        <div className="flex flex-col gap-3 mt-5">
          <button
            disabled={!flow || busy}
            onClick={() => decide("approve")}
            className="min-h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
          >
            Approve read-only access
          </button>
          <button
            disabled={!flow || busy}
            onClick={() => decide("deny")}
            className="min-h-12 rounded-xl border border-border disabled:opacity-50"
          >
            Deny access
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
