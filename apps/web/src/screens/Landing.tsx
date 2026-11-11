import { useEffect } from "react";
import { data } from "../data";
import { useData } from "../lib/useData";
import { LiveAdda } from "./landing/LiveAdda";
import { Audiences, FinalCta, Footer, Header, Hero, HowItWorks, TradeRibbon, TrySection, Trust } from "./landing/sections";
import "./landing/landing.css";

/** How often the live count and map refresh while the page is open. */
const LIVE_REFRESH_MS = 60_000;

/** The main website. Every trade, count and pin on it comes from the live API. */
export function Landing() {
  const categories = useData(() => data.listCategories(), []);
  const workers = useData(() => data.listWorkers(), [], { reloadOn: ["worker.status"] });
  const areas = useData(() => data.getAreas(), []);
  const reloadCategories = categories.reload;
  const reloadWorkers = workers.reload;

  useEffect(() => data.onCategoriesChanged(reloadCategories), [reloadCategories]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reloadWorkers();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [reloadWorkers]);

  return (
    <div className="lp-root flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Hero categories={categories.data} workers={workers.data} />
        <TradeRibbon query={categories} />
        <TrySection>
          <LiveAdda categories={categories.data} workers={workers.data} areas={areas.data} />
        </TrySection>
        <HowItWorks />
        <Audiences />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
