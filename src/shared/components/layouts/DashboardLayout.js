"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import { useUserRole } from "../UserRoleProvider";

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: "info",
  };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const { role } = useUserRole();
  const isSubUser = role === "sub_user";
  const isBasicChat = pathname === "/dashboard/basic-chat";
  const isFocusUI = pathname === "/dashboard/focus-ui";
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/startup-notices", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { notices: [] })
      .then((data) => {
        if (cancelled) return;
        for (const notice of data.notices || []) {
          addNotification(notice);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [addNotification]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${style.wrapper}`}
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] leading-5">{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current"
                    aria-label="Dismiss notification"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {/* Mobile sidebar overlay */}
      {!isSubUser && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      {!isSubUser && (
        <div className="hidden lg:flex">
          <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        </div>
      )}

      {/* Sidebar - Mobile */}
      {!isSubUser && (
        <div
          className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-col flex-1 h-full min-w-0 relative isolate transition-colors duration-300">
        <div className="landing-grid absolute inset-0 pointer-events-none -z-10" aria-hidden="true" />
        <Header key={pathname} onMenuClick={() => setSidebarOpen(true)} showMenuButton={!isSubUser} />
        <div className={`flex-1 custom-scrollbar ${isBasicChat ? "" : "p-6 lg:p-10"} ${isBasicChat || isFocusUI ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
          <div className={isBasicChat
            ? "flex-1 w-full h-full flex flex-col"
            : isFocusUI
              ? "mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col"
              : "max-w-7xl mx-auto"}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
