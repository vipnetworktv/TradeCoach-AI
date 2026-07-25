export default function HowItWorks() {
    const steps = [
      {
        number: "1",
        title: "Connect Your Broker",
        description:
          "Securely connect your supported broker and choose which funded or personal accounts you want TradeCoach AI to track.",
      },
      {
        number: "2",
        title: "Trade Normally",
        description:
          "Continue trading exactly as you do today. Every completed trade is automatically imported and organized for you.",
      },
      {
        number: "3",
        title: "Receive AI Coaching",
        description:
          "Review AI trade grades, discover your strengths and weaknesses, and receive personalized coaching based on your actual performance.",
      },
    ];
  
    return (
      <section
        id="how-it-works"
        className="border-t border-slate-800/80 bg-slate-900/30 px-6 py-24"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Simple Setup
            </p>
  
            <h2 className="mt-4 text-4xl font-extrabold md:text-5xl">
              Connect Once. Improve Every Day.
            </h2>
  
            <p className="mt-6 text-lg leading-8 text-slate-400">
              TradeCoach AI works quietly in the background while you trade,
              giving you personalized coaching after every session.
            </p>
          </div>
  
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-8 transition hover:border-cyan-400/40"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-xl font-extrabold text-slate-950">
                  {step.number}
                </div>
  
                <h3 className="text-2xl font-bold">
                  {step.title}
                </h3>
  
                <p className="mt-4 leading-7 text-slate-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
  
          <div className="mt-16 text-center">
            <button className="rounded-xl bg-cyan-500 px-8 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400">
              Start Your Free 7-Day Trial
            </button>
  
            <p className="mt-4 text-sm text-slate-500">
              No long-term contracts • Cancel anytime
            </p>
          </div>
        </div>
      </section>
    );
  }