/**
 * OrgGuard
 *
 * Wraps any route that requires the user to belong to an organisation.
 * If they have none, redirects to /org/setup.
 */

import { Navigate } from "react-router-dom";
import { useOrg } from "../context/OrgContext";

export default function OrgGuard({ children }) {
  const { org, orgs, loading } = useOrg();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Geist',system-ui,sans-serif", color: "#A8A89A", fontSize: "14px",
        background: "#FAFAF8",
      }}>
        Loading…
      </div>
    );
  }

  if (!org && orgs.length === 0) {
    return <Navigate to="/org/setup" replace />;
  }

  return children;
}
