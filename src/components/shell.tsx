"use client";

import clsx from "clsx";
import { Menu, PanelLeftOpen } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { IconButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

interface ShellState {
  openDrawer: () => void;
  /** The desktop sidebar is put away: pages show the way back to it, and to a new chat. */
  sidebarHidden: boolean;
  showSidebar: () => void;
}

const ShellContext = createContext<ShellState>({ openDrawer: () => {}, sidebarHidden: false, showSidebar: () => {} });

export const useShell = () => useContext(ShellContext);

/** The button just pressed is gone or inert now: focus the one that took its place. */
function focusLater(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarHidden = useAppStore((s) => s.settings.sidebarHidden);
  const setSidebarHidden = useAppStore((s) => s.setSidebarHidden);
  const close = () => setDrawerOpen(false);
  const showSidebar = () => {
    setSidebarHidden(false);
    focusLater("sidebar-hide");
  };

  return (
    <ShellContext value={{ openDrawer: () => setDrawerOpen(true), sidebarHidden, showSidebar }}>
      {/* The side insets keep a phone on its side clear of the notch. */}
      <div className="flex h-dvh overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        {/* Desktop sidebar. Put away, it slides to zero width and goes inert, so Tab skips it. */}
        <aside
          inert={sidebarHidden}
          className={clsx(
            "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:block",
            sidebarHidden ? "w-0" : "w-72",
          )}
        >
          <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar">
            <Sidebar
              hide={{
                id: "sidebar-hide",
                label: t("nav.hideSidebar"),
                onClick: () => {
                  setSidebarHidden(true);
                  focusLater("sidebar-show");
                },
              }}
            />
          </div>
        </aside>

        {/* Phone drawer, also for a phone on its side */}
        <div className={clsx("fixed inset-0 z-40 md:hidden", !drawerOpen && "pointer-events-none")} inert={!drawerOpen}>
          <div
            className={clsx("absolute inset-0 bg-overlay transition-opacity duration-200", drawerOpen ? "opacity-100" : "opacity-0")}
            onClick={close}
          />
          <aside
            aria-label={t("menu")}
            className={clsx(
              "absolute inset-y-0 left-0 flex w-[85%] max-w-[calc(20rem+env(safe-area-inset-left))] flex-col bg-sidebar pl-[env(safe-area-inset-left)] shadow-2xl transition-transform duration-200",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar
              onNavigate={close}
              hide={{
                label: t("nav.closeMenu"),
                onClick: () => {
                  close();
                  focusLater("drawer-open");
                },
              }}
            />
          </aside>
        </div>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ShellContext>
  );
}

export function PageHeader({
  title,
  children,
  bordered = true,
}: {
  title?: ReactNode;
  children?: ReactNode;
  bordered?: boolean;
}) {
  const t = useT();
  const { openDrawer, sidebarHidden, showSidebar } = useShell();
  return (
    <header className={clsx("flex h-14 shrink-0 items-center gap-1 px-2 md:px-4", bordered && "border-b border-border")}>
      <IconButton id="drawer-open" label={t("openMenu")} onClick={openDrawer} className="md:hidden">
        <Menu className="size-5" />
      </IconButton>
      {sidebarHidden && (
        <span className="hidden md:contents">
          <IconButton id="sidebar-show" label={t("nav.showSidebar")} onClick={showSidebar}>
            <PanelLeftOpen className="size-5" />
          </IconButton>
        </span>
      )}
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}
