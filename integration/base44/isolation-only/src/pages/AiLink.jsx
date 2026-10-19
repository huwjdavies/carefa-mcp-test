import React from "react";
import { Link } from "react-router-dom";
// Do not retarget old callback transactions or silently migrate old permissions.
export default function AiLink() {
  return (
    <main className="bg-background text-foreground p-5 min-h-screen">
      <h1 className="font-heading font-bold text-2xl">
        Start a new connection
      </h1>
      <p className="mt-4 text-sm">
        This old approval request cannot connect to the isolated AI Companion.
        Cancel it in ChatGPT and start again using the approved test connection.
      </p>
      <Link
        className="min-h-12 flex items-center text-primary"
        to="/my-ai-assistants"
      >
        My AI Assistants
      </Link>
    </main>
  );
}
