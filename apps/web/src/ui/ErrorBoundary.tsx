import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useSettings } from "../lib/settings";
import { Button } from "./primitives";

function Fallback() {
  const { t } = useSettings();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <TriangleAlert className="h-14 w-14 text-busy-500" aria-hidden />
      <h1 className="text-2xl">{t("کچھ گڑبڑ ہو گئی", "Kuch garbar ho gayi", "Something went wrong")}</h1>
      <Button onClick={() => window.location.reload()}>{t("دوبارہ کوشش کریں", "Dobara koshish karein", "Try again")}</Button>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
