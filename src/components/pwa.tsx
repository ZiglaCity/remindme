"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Icon } from "./icon";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const InstallContext = createContext<{
  prompt: InstallEvent | null;
  installed: boolean;
  install(): void;
}>({ prompt: null, installed: false, install() {} });
const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
export function PwaProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const requestedUpdate = useRef(false);
  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    let disposed = false;
    const onControllerChange = () => {
      if (requestedUpdate.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (disposed) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              !disposed &&
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWaiting(worker);
          });
        });
      })
      .catch(() => {
        /* Installation is optional; the online app remains usable. */
      });
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [enabled]);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }
  return (
    <InstallContext.Provider
      value={{
        prompt,
        installed,
        install: () => {
          void install().catch(() => setPrompt(null));
        },
      }}
    >
      {children}
      {!online && (
        <div className="connection-banner" role="status">
          <Icon name="wifi" size={18} />
          <span>
            You’re offline. Changes can’t be saved until you reconnect.
          </span>
        </div>
      )}
      {waiting && (
        <div className="update-toast" role="status">
          <span>A fresh version is ready. Save your edits first.</span>
          <button
            onClick={() => {
              requestedUpdate.current = true;
              waiting.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Update app <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
    </InstallContext.Provider>
  );
}
export function InstallCard() {
  const { prompt, installed, install } = useContext(InstallContext);
  const [instructions, setInstructions] = useState(false);
  return (
    <section className="settings-card install-card">
      <span className="settings-icon">
        <Icon name="download" size={24} />
      </span>
      <div>
        <p className="eyebrow">TAKE A LITTLE CLARITY WITH YOU</p>
        <h2>Make yourself at home.</h2>
        <p>Keep RemindMe a tap away on your home screen.</p>
        <button
          className="button button-outline"
          onClick={() => (prompt ? install() : setInstructions(!instructions))}
        >
          {installed ? "Installation options" : "Install RemindMe"}
          <Icon name="arrow" size={16} />
        </button>
        {instructions && (
          <p className="install-instructions">
            Already installed? Open RemindMe from your home screen. Otherwise,
            use your browser’s Install app option. On iPhone or iPad, open in
            Safari, then choose Share → Add to Home Screen. Installation
            requires HTTPS or localhost.
          </p>
        )}
      </div>
    </section>
  );
}
