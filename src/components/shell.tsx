"use client";

import clsx from "clsx";
import { Menu } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { IconButton } from "@/components/ui";
import { useT } from "@/lib/i18n";

const ShellContext = createContext<{ openDrawer: () => void }>({ openDrawer: () => {} });

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

  return (
    <ShellContext value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
          <Sidebar />
        </aside>

        {/* Phone drawer */}
        <div className={clsx("fixed inset-0 z-40 md:hidden", !drawerOpen && "pointer-events-none")} inert={!drawerOpen}>
          <div
            className={clsx("absolute inset-0 bg-overlay transition-opacity duration-200", drawerOpen ? "opacity-100" : "opacity-0")}
            onClick={close}
          />
          <aside
            aria-label={t("menu")}
            className={clsx(
              "absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-sidebar shadow-2xl transition-transform duration-200",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar onNavigate={close} />
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
  const { openDrawer } = useContext(ShellContext);
  return (
    <header className={clsx("flex h-14 shrink-0 items-center gap-1 px-2 md:px-4", bordered && "border-b border-border")}>
      <IconButton label={t("openMenu")} onClick={openDrawer} className="md:hidden">
        <Menu className="size-5" />
      </IconButton>
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}
