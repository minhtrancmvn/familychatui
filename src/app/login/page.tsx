"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { Button, FullScreenLoader, LANG_OPTIONS, Segmented } from "@/components/ui";
import { APP_NAME } from "@/lib/config";
import { useLang, useT } from "@/lib/i18n";
import { useAppStore, useHydrated } from "@/lib/store";

export default function LoginPage() {
  const t = useT();
  const lang = useLang();
  const hydrated = useHydrated();
  const unlocked = useAppStore((s) => s.unlocked);
  const unlock = useAppStore((s) => s.unlock);
  const setDeviceLanguage = useAppStore((s) => s.setDeviceLanguage);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated && unlocked) router.replace("/profiles");
  }, [hydrated, unlocked, router]);

  if (!hydrated || unlocked) return <FullScreenLoader />;

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-accent-soft to-bg px-4 py-4">
      <div className="flex justify-end">
        <Segmented label={t("language")} value={lang} options={LANG_OPTIONS} onChange={setDeviceLanguage} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size={56} />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                const result = await unlock(password);
                if (result === "ok") {
                  router.replace("/profiles");
                  return;
                }
                setError(result === "wrong" ? t("login.wrong") : t("login.wait", { seconds: result.wait }));
                setPassword("");
              } catch {
                setError(t("error.generic"));
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <label htmlFor="family-password" className="mb-1.5 block text-sm font-medium">
              {t("login.label")}
            </label>
            <div className="relative">
              <input
                id="family-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                aria-invalid={error !== null}
                aria-describedby={error ? "password-error" : undefined}
                className="h-12 w-full rounded-xl border border-border bg-surface pl-3.5 pr-12 text-[15px] outline-none focus:border-accent aria-[invalid=true]:border-danger"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? t("login.hide") : t("login.show")}
                className="absolute right-0.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && (
              <p id="password-error" role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={!password || busy}>
              {t("login.submit")}
            </Button>
            <p className="mt-3 text-center text-xs text-muted">{t("login.remember")}</p>
          </form>

        </div>
      </div>
    </div>
  );
}
