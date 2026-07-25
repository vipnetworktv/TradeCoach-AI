import { Suspense } from "react";

import ReportArticlePage from "./page.client";

export default function ReportArticleRoute() {
  return (
    <Suspense
      fallback={
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-400">
          Loading report...
        </div>
      }
    >
      <ReportArticlePage />
    </Suspense>
  );
}
