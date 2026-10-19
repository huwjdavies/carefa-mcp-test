import React from "react";
import { Navigate } from "react-router-dom";
// No provider boolean controls or legacy entity writes in the isolated V1 app.
export default function AIConnectTest() {
  return <Navigate to="/my-ai-assistants" replace />;
}
