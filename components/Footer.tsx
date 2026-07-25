export default function Footer() {
    const year = new Date().getFullYear();
  
    return (
      <footer className="border-t border-slate-800/80 bg-slate-950 px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-10 md:flex-row">
            {/* Logo */}
            <div>
              <h2 className="text-2xl font-bold">
                TradeCoach <span className="text-cyan-400">AI</span>
              </h2>
  
              <p className="mt-3 max-w-sm leading-7 text-slate-400">
                AI-powered coaching built around your real trading history.
                Discover your strengths, eliminate your weaknesses, and become a
                more consistent trader.
              </p>
            </div>
  
            {/* Navigation */}
            <div className="flex flex-wrap justify-center gap-8 text-slate-400">
              <a
                href="#features"
                className="transition hover:text-cyan-400"
              >
                Features
              </a>
  
              <a
                href="#how-it-works"
                className="transition hover:text-cyan-400"
              >
                How It Works
              </a>
  
              <a
                href="#pricing"
                className="transition hover:text-cyan-400"
              >
                Pricing
              </a>
  
              <a
                href="#"
                className="transition hover:text-cyan-400"
              >
                Privacy
              </a>
  
              <a
                href="#"
                className="transition hover:text-cyan-400"
              >
                Terms
              </a>
  
              <a
                href="#"
                className="transition hover:text-cyan-400"
              >
                Contact
              </a>
            </div>
          </div>
  
          <div className="mt-12 border-t border-slate-800 pt-8 text-center text-sm text-slate-500">
            © {year} TradeCoach AI. All rights reserved.
          </div>
        </div>
      </footer>
    );
  }