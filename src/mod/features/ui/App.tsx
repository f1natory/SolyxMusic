import { ThemeProvider } from "./contexts/ThemeContext";

import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@ui/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/components/ui/tooltip";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "@ui/components/ui/sonner";

import { Playground } from "@ui/components/playground";
import { IPChecker } from "@ui/components/ip-checker";
import { FontChanger } from "@ui/components/font-changer";
import { Devtools } from "@ui/components/devtools";
import { Downloader } from "@ui/components/downloader";
import { AutoBestQuality } from "@ui/components/auto-best-quality";
import { AutoLiker } from "@ui/components/auto-liker";
import { ExperimentsToggle } from "@ui/components/experiments-toggle";
import { ScaleChanger } from "@ui/components/scale-changer";
import { CustomThemes } from "@ui/components/custom-themes";
import { NewYearSnowfall, NewYearSnowfallAnimation } from "@ui/components/snowfall-animation";

import { BackgroundLayer } from "./components/visual/BackgroundLayer";
import { FullscreenVisualBackground } from "./components/visual/FullscreenVisualBackground";
import { NativeLyricsEnhancer } from "./components/visual/NativeLyricsEnhancer";
import { ExpandableCard } from "@ui/components/ui/expandable-card";

import { Button } from "./components/ui/button";

import { SolyxLogo } from "@ui/components/solyx-logo";

import { FaTelegramPlane, FaGithub } from "react-icons/fa";
import { Heart, ExternalLink } from "lucide-react";

const IS_DEV = false;
const TELEGRAM_CHANNEL_URL = "https://t.me/SolyxClub";
const F1NATORY_GITHUB_URL = "https://github.com/f1natory/SolyxMusic";
const ORIGINAL_MOD_URL = "https://github.com/Stephanzion/YandexMusicBetaMod";

export default function App() {
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(IS_DEV);
  const [devtoolsEnabled, setDevtoolsEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      setDevtoolsEnabled((await window.yandexMusicMod.getStorageValue("devtools/enabled")) || false);
    })();

    const cleanup = window.yandexMusicMod.onStorageChanged((key: string, value: any) => {
      if (key.includes("devtools/enabled")) setDevtoolsEnabled(value);
    });
    return () => { if (typeof cleanup === "function") cleanup(); };
  }, []);

  useEffect(() => {
    const targetSelector = 'div[class*="NavbarDesktopUserWidget_userProfileContainer"]';
    const containerId = "mod-sheet-container";

    const checkAndPlaceButton = () => {
      const targetElement = IS_DEV ? document.body : document.querySelector(targetSelector);
      let container = document.getElementById(containerId) as HTMLDivElement | null;

      if (targetElement) {
        if (!container) {
          container = document.createElement("div");
          container.id = containerId;
          container.style.display = "flex";
          container.style.justifyContent = "center";

          targetElement.parentNode?.insertBefore(container, targetElement);
        }
        setMountNode(container);
      } else {
        if (container) {
          container.remove();
        }
        setMountNode(null);
      }
    };

    checkAndPlaceButton();

    const observer = new MutationObserver(checkAndPlaceButton);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      const container = document.getElementById(containerId);
      if (container) {
        container.remove();
      }
    };
  }, []);

  const sheetTrigger = (
    <>
      <SheetTrigger className="flex w-full items-center justify-center gap-2.5 rounded-full border-2 border-[var(--ym-outline-color-primary-disabled)] p-[5px] text-[var(--ym-controls-color-primary-text-enabled_variant)] transition-colors duration-100 ease-in-out hover:bg-[var(--ym-surface-color-primary-enabled-list)] px-6">
        <SolyxLogo className="h-[25px] w-[25px] shrink-0" />
        <span className="trigger-text hidden lg:inline">Меню мода</span>
        <Toaster position="bottom-right" />
      </SheetTrigger>

      <NewYearSnowfallAnimation />
    </>
  );

  return (
    <ThemeProvider>

      <FullscreenVisualBackground />

      <NativeLyricsEnhancer />

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {mountNode && createPortal(sheetTrigger, mountNode)}
        <SheetContent side="left" className="w-full" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetTitle className="sr-only">Меню модификации</SheetTitle>
          <SheetDescription className="sr-only">Настройки и расширения Яндекс Музыки</SheetDescription>

          <div
            id="header"
            className="flex items-center justify-between px-4"
            style={{
              height: "var(--ym-spacer-size-xxxl)",
              backgroundColor: "var(--ym-background-color-primary-enabled-basic)",
            }}
          ></div>

          <div className="bg-secondary/20 m-3 mb-0 flex justify-between rounded-md border px-4 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <SolyxLogo className="h-6 w-6 shrink-0 text-foreground" />
              <span className="text-foreground text-base font-semibold">Solyx Music</span>
              <span className="text-muted-foreground text-xs font-semibold">v{import.meta.env.VITE_MOD_VERSION || "5.126.1"}</span>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Telegram-канал SolyxClub"
                    onClick={() => window.open(TELEGRAM_CHANNEL_URL, "_blank", "noreferrer")}
                  >
                    <FaTelegramPlane className="text-sky-500 h-[1.3rem]! w-[1.3rem]!" fill="currentColor" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Telegram-канал SolyxClub</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(F1NATORY_GITHUB_URL, "_blank", "noreferrer")}
                  >
                    <FaGithub className="text-foreground h-[1.3rem]! w-[1.3rem]!" fill="currentColor" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>GitHub f1natory</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <ScrollArea
            className="flex h-full flex-col p-1 pt-0 overflow-hidden overflow-x-auto overflow-y-auto rounded-md"
            viewportClassName="gap-2"
          >
            <Downloader />
            <NewYearSnowfall />
            <AutoLiker />
            <CustomThemes />
            <FontChanger />
            <ScaleChanger />
            <AutoBestQuality />

            <Devtools />

            {devtoolsEnabled && (
              <>
                <ExperimentsToggle />

              </>
            )}

            <ExpandableCard title="Credits" icon={<Heart className="h-4 w-4 text-red-500" />}>
              <div className="flex flex-col gap-2 pt-2 px-3 text-sm">
                <div
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer"
                  onClick={() => window.open(F1NATORY_GITHUB_URL, "_blank", "noreferrer")}
                >
                  <div className="flex items-center gap-2.5">
                    <FaGithub className="h-4 w-4 text-foreground" fill="currentColor" />
                    <span className="font-medium text-foreground">Solyx Music (f1natory)</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                <div
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer"
                  onClick={() => window.open(ORIGINAL_MOD_URL, "_blank", "noreferrer")}
                >
                  <div className="flex items-center gap-2.5">
                    <FaGithub className="h-4 w-4 text-muted-foreground" fill="currentColor" />
                    <span className="font-medium text-muted-foreground">Original Mod (Stephanzion)</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </ExpandableCard>

          </ScrollArea>

          <div className="m-4 flex flex-row">
            <Button variant="default" className="flex-1 opacity-0" onClick={() => setIsSheetOpen(false)}>
              Сохранить
            </Button>
            <Button variant="outline" className="text-foreground flex-1" onClick={() => setIsSheetOpen(false)}>
              Назад
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </ThemeProvider>
  );
}
