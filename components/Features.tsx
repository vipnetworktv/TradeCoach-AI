export default function Features() {

    const features = [

      {

        icon: "↻",

        title: "Automatic Trade Import",

        description:

          "Connect your broker once and let TradeCoach AI automatically import and organize your completed trades.",

      },

      {

        icon: "✦",

        title: "AI Trade Grading",

        description:

          "Every trade receives a grade, a breakdown of what went well, and clear suggestions for improvement.",

      },

      {

        icon: "◫",

        title: "Performance Analytics",

        description:

          "See your win rate, profit factor, best trading times, strongest setups, and recurring mistakes.",

      },

      {

        icon: "⌁",

        title: "Coaching Reports",

        description:

          "Receive daily, weekly, and monthly reports showing where you are improving and what still needs work.",

      },

    ];

  

    return (

      <section

        id="features"

        className="border-t border-slate-800/80 px-6 py-24"

      >

        <div className="mx-auto max-w-7xl">

          <div className="mx-auto max-w-3xl text-center">

            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">

              Built for serious traders

            </p>

  

            <h2 className="mt-4 text-4xl font-extrabold md:text-5xl">

              Everything you need to improve your trading

            </h2>

  

            <p className="mt-6 text-lg leading-8 text-slate-400">

              TradeCoach AI turns your actual trading history into clear,

              personalized coaching you can use every day.

            </p>

          </div>

  

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">

            {features.map((feature) => (

              <div

                key={feature.title}

                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-cyan-400/50"

              >

                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-2xl text-cyan-400">

                  {feature.icon}

                </div>

  

                <h3 className="text-xl font-bold">{feature.title}</h3>

  

                <p className="mt-3 leading-7 text-slate-400">

                  {feature.description}

                </p>

              </div>

            ))}

          </div>

        </div>

      </section>

    );

  }


