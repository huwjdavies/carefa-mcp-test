import React from 'react';
import {Link} from 'react-router-dom';
// ISOLATED APP ONLY: replaces the legacy Grant/Revoke boolean control.
export default function AiConnectConsentCard(){return <section className="carefa-luxe-panel bg-card border border-primary/40 rounded-2xl p-4 space-y-3">
 <h2 className="font-bold">My AI Assistants</h2><p className="text-sm text-muted-foreground">Manage verified read-only access for your signed-in CAREFA account. Connecting always requires a fresh approval; an old permission switch cannot reconnect an assistant.</p>
 <Link className="min-h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center" to="/my-ai-assistants">Manage AI access</Link>
 </section>;}
