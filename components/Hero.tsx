import Link from "next/link";



export default function Hero() {

  return (

    <section className="mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-2">

      <div>

        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">

          TradeCoach AI

        </p>



        <h1 className="text-5xl font-extrabold leading-tight md:text-7xl">

          Become the Trader

          <br />

          <span className="text-cyan-400">You Were Meant To Be.</span>

        </h1>



        <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300">

          Connect your broker account. Every trade is automatically imported,

          analyzed by AI, and turned into actionable coaching that helps you

          become a more disciplined and consistent trader.

        </p>



        <div className="mt-10 flex flex-wrap gap-4">

          <Link

            href="/signup"

            className="rounded-xl bg-cyan-500 px-8 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400"

          >

            Start Your Free 7-Day Trial

          </Link>



          <Link

            href="/login"

            className="rounded-xl border border-slate-700 px-8 py-4 font-semibold transition hover:border-cyan-400 hover:text-cyan-400"

          >

            Log In

          </Link>

        </div>



        <p className="mt-4 text-sm text-slate-500">

          No long-term contracts. Cancel anytime.

        </p>

      </div>



      <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">

        <div className="mb-6 flex items-center justify-between">

          <h2 className="text-xl font-bold">

            TradeCoach <span className="text-cyan-400">AI</span>

          </h2>



          <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400">

            Connected

          </div>

        </div>



        <div className="space-y-4">

          <div className="rounded-xl bg-slate-800 p-5">

            <p className="text-slate-400">Win Rate</p>



            <h3 className="mt-2 text-4xl font-bold text-cyan-400">74%</h3>

          </div>



          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-xl bg-slate-800 p-5">

              <p className="text-slate-400">Profit Factor</p>



              <h3 className="mt-2 text-2xl font-bold">2.61</h3>

            </div>



            <div className="rounded-xl bg-slate-800 p-5">

              <p className="text-slate-400">AI Grade</p>



              <h3 className="mt-2 text-2xl font-bold text-cyan-400">A</h3>

            </div>

          </div>



          <div className="rounded-xl bg-slate-800 p-5">

            <p className="text-slate-400">AI Recommendation</p>



            <p className="mt-3 leading-7 text-slate-200">

              Your longs have a 78% win rate. Consider avoiding counter-trend

              shorts until market structure changes.

            </p>

          </div>

        </div>

      </div>

    </section>

  );

}


