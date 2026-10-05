import React, { useEffect } from "react";
import { useGameStore } from "../store/game-store";

export const NotificationToast: React.FC = () => {
  const notification = useGameStore((s) => s.tableNotification);
  const dismiss = useGameStore((s) => s.dismissNotification);
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const hostApproveRebuy = useGameStore((s) => s.hostApproveRebuy);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      dismiss();
    }, 7000);
    return () => clearTimeout(timer);
  }, [notification, dismiss]);

  if (!notification) return null;

  const isHost = Boolean(myPlayerId && currentView?.hostId === myPlayerId);
  const isDealer = Boolean(myPlayerId && currentView?.dealerId === myPlayerId);
  const canApprove = (isHost || isDealer) && notification.type === "chip_request" && notification.playerId;

  const handleApprove = () => {
    if (notification.playerId) {
      hostApproveRebuy(notification.playerId, notification.amount);
      dismiss();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        minWidth: "320px",
        maxWidth: "460px",
        backgroundColor: "rgba(17, 24, 39, 0.96)",
        backdropFilter: "blur(12px)",
        border: notification.type === "chip_approved" ? "1px solid #10b981" : "1px solid #f59e0b",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 15px rgba(245, 158, 11, 0.2)",
        padding: "16px 20px",
        color: "#f3f4f6",
        animation: "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>
            {notification.type === "chip_approved" ? "💰" : "🪙"}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: notification.type === "chip_approved" ? "#34d399" : "#fbbf24" }}>
              {notification.type === "chip_approved" ? "Chips Added" : "Chip Request"}
            </div>
            <div style={{ fontSize: "13px", color: "#e5e7eb", marginTop: "2px" }}>
              {notification.message}
            </div>
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: "none",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px",
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {canApprove && (
        <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={dismiss}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              color: "#d1d5db",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Ignore
          </button>
          <button
            onClick={handleApprove}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              backgroundColor: "#f59e0b",
              color: "#000",
              fontWeight: 600,
              border: "none",
              fontSize: "12px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(245, 158, 11, 0.4)",
            }}
          >
            Approve {notification.amount?.toLocaleString()} Chips
          </button>
        </div>
      )}
    </div>
  );
};
