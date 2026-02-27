import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import { X } from "lucide-react";
import { useToast } from "./components/ui/Toast";
import { useHotkey } from "./hooks/useHotkey";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";

// AI Orb — animated voice bars that react to dictation state
const AIOrb = ({ state }) => {
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const count = isRecording ? 7 : 5;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2.5 }}>
      {Array.from({ length: count }, (_, i) => {
        const center = Math.floor(count / 2);
        const dist = Math.abs(i - center);
        const height = isRecording ? 14 : isProcessing ? 9 : 6;
        const anim = isRecording || isProcessing ? "ai-bar-wave" : "ai-bar-breathe";
        const dur = isRecording
          ? `${0.5 + dist * 0.09}s`
          : isProcessing
            ? `${0.85 + i * 0.11}s`
            : `${2.0 + i * 0.22}s`;
        const delay = `${i * 0.07}s`;
        return (
          <div
            key={i}
            style={{
              width: 2.5,
              height,
              borderRadius: 2,
              background: "rgba(255,255,255,0.9)",
              transformOrigin: "center",
              animation: `${anim} ${dur} ease-in-out ${delay} infinite`,
            }}
          />
        );
      })}
    </div>
  );
};

// Enhanced Tooltip Component
const Tooltip = ({ children, content, emoji }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        {children}
      </div>
      {isVisible && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-1 py-1 text-popover-foreground bg-popover border border-border rounded-md whitespace-nowrap z-10 transition-opacity duration-150 shadow-lg"
          style={{ fontSize: "9.7px", maxWidth: "96px" }}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-popover"></div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: data.message,
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `\u201c${w}\u201d`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-emerald-100/90 hover:text-white
                bg-emerald-500/15 hover:bg-emerald-500/25
                border border-emerald-400/20 hover:border-emerald-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || toastCount > 0) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isCommandMenuOpen, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    const resizeWindow = () => {
      if (isCommandMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isCommandMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isCommandMenuOpen, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const { isRecording, isProcessing, toggleListening, cancelRecording, cancelProcessing } =
    useAudioRecording(toast, {
      onToggle: handleDictationToggle,
    });

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen]);

  // Determine current mic state
  const getMicState = () => {
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();

  const getMicButtonProps = () => {
    const base = "rounded-full flex items-center justify-center relative overflow-hidden";
    const size = { width: 44, height: 44 };
    const t0 = "all 0.25s cubic-bezier(0.4,0,0.2,1)";

    switch (micState) {
      case "idle":
        return {
          className: base,
          style: {
            ...size,
            cursor: "pointer",
            transition: t0,
            background: "linear-gradient(145deg, oklch(0.12 0.02 270) 0%, oklch(0.17 0.07 285) 100%)",
            boxShadow:
              "0 0 0 1px oklch(1 0 0 / 0.07), 0 4px 18px oklch(0 0 0 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.06)",
          },
          tooltip: t("app.mic.hotkeyToSpeak", { hotkey }),
        };
      case "hover":
        return {
          className: base,
          style: {
            ...size,
            cursor: "pointer",
            transition: t0,
            background: "linear-gradient(145deg, oklch(0.19 0.07 280) 0%, oklch(0.26 0.14 290) 100%)",
            boxShadow:
              "0 0 0 1px oklch(0.65 0.2 290 / 0.32), 0 4px 24px oklch(0 0 0 / 0.5), 0 0 22px oklch(0.6 0.2 290 / 0.38)",
            transform: "scale(1.07)",
          },
          tooltip: t("app.mic.hotkeyToSpeak", { hotkey }),
        };
      case "recording":
        return {
          className: base,
          style: {
            ...size,
            cursor: "pointer",
            transition: t0,
            background: "linear-gradient(145deg, oklch(0.43 0.23 295) 0%, oklch(0.38 0.25 305) 100%)",
            boxShadow:
              "0 0 0 1.5px oklch(0.76 0.18 290 / 0.5), 0 4px 20px oklch(0 0 0 / 0.4), 0 0 30px oklch(0.55 0.23 295 / 0.62)",
          },
          tooltip: t("app.mic.recording"),
        };
      case "processing":
        return {
          className: base,
          style: {
            ...size,
            cursor: "not-allowed",
            transition: t0,
            background: "linear-gradient(145deg, oklch(0.32 0.2 260) 0%, oklch(0.38 0.22 270) 100%)",
            boxShadow:
              "0 0 0 1px oklch(0.65 0.18 260 / 0.4), 0 4px 20px oklch(0 0 0 / 0.4), 0 0 22px oklch(0.5 0.2 260 / 0.48)",
          },
          tooltip: t("app.mic.processing"),
        };
      default:
        return {
          className: base,
          style: { ...size, cursor: "pointer", transition: t0 },
          tooltip: t("app.mic.clickToSpeak"),
        };
    }
  };

  const micProps = getMicButtonProps();

  return (
    <div className="dictation-window">
      {/* Bottom-right voice button - window expands upward/leftward */}
      <div className="fixed bottom-6 right-6 z-50">
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
        >
          {(isRecording || isProcessing) && isHovered && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                isRecording ? cancelRecording() : cancelProcessing();
              }}
              className="group/cancel w-5 h-5 rounded-full bg-surface-2/90 hover:bg-destructive border border-border hover:border-destructive/70 flex items-center justify-center transition-colors duration-150 shadow-sm backdrop-blur-sm"
            >
              <X
                size={10}
                strokeWidth={2.5}
                className="text-foreground group-hover/cancel:text-destructive-foreground transition-colors duration-150"
              />
            </button>
          )}
          <Tooltip content={micProps.tooltip}>
            {/* Wrapper gives sonar rings a fixed origin to expand from */}
            <div className="relative" style={{ width: 44, height: 44 }}>
              {/* Sonar pulse rings — recording state */}
              {micState === "recording" && (
                <>
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      animation: "ai-sonar-ring 1.9s ease-out infinite",
                      border: "1.5px solid rgba(167,139,250,0.55)",
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      animation: "ai-sonar-ring 1.9s ease-out 0.72s infinite",
                      border: "1px solid rgba(167,139,250,0.3)",
                    }}
                  />
                </>
              )}

              {/* Spinning gradient arc — processing state */}
              {micState === "processing" && (
                <div
                  className="pointer-events-none rounded-full"
                  style={{
                    position: "absolute",
                    top: -3,
                    left: -3,
                    right: -3,
                    bottom: -3,
                    borderRadius: "50%",
                    background:
                      "conic-gradient(from 0deg, rgba(129,140,248,0.65) 0deg, transparent 200deg)",
                    animation: "ai-spin-arc 1.4s linear infinite",
                  }}
                />
              )}

              <button
                ref={buttonRef}
                onMouseDown={(e) => {
                  setIsCommandMenuOpen(false);
                  setDragStartPos({ x: e.clientX, y: e.clientY });
                  setHasDragged(false);
                  handleMouseDown(e);
                }}
                onMouseMove={(e) => {
                  if (dragStartPos && !hasDragged) {
                    const distance = Math.sqrt(
                      Math.pow(e.clientX - dragStartPos.x, 2) +
                        Math.pow(e.clientY - dragStartPos.y, 2)
                    );
                    if (distance > 5) {
                      setHasDragged(true);
                    }
                  }
                }}
                onMouseUp={(e) => {
                  handleMouseUp(e);
                  setDragStartPos(null);
                }}
                onClick={(e) => {
                  if (!hasDragged) {
                    setIsCommandMenuOpen(false);
                    toggleListening();
                  }
                  e.preventDefault();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!hasDragged) {
                    setWindowInteractivity(true);
                    setIsCommandMenuOpen((prev) => !prev);
                  }
                }}
                onFocus={() => setIsHovered(true)}
                onBlur={() => setIsHovered(false)}
                className={micProps.className}
                style={{
                  ...micProps.style,
                  cursor: isDragging ? "grabbing" : micProps.style?.cursor,
                }}
              >
                {/* Inner shimmer highlight */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.11) 0%, transparent 55%)",
                  }}
                />
                <AIOrb state={micState} />
              </button>
            </div>
          </Tooltip>
          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              className="absolute bottom-full right-0 mb-3 w-48 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-sm"
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  toggleListening();
                }}
              >
                {isRecording
                  ? t("app.commandMenu.stopListening")
                  : t("app.commandMenu.startListening")}
              </button>
              <div className="h-px bg-border" />
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
