import { useEffect } from "react";
import { data } from "../data";
import { useData } from "../lib/useData";
import { Audiences, Footer, Header, Hero, HowItWorks, Trades, Trust } from "./landing/sections";
import "./landing/landing.css";

/** The main website. It stays short on purpose: the product is the app behind these buttons. */
export function Landing() {
  const categories = useData(() => data.listCategories(), []);
  const { reload } = categories;

  useEffect(() => data.onCategoriesChanged(reload), [reload]);

  return (
    <div className="lp-root flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Hero categories={categories.data} />
        <HowItWorks />
        <Trades query={categories} />
        <Audiences />
        <Trust />
      </main>
      <Footer />
    </div>
  );
}
