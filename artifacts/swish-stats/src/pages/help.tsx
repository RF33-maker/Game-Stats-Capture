import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Cloud,
  Share2,
  Trophy,
  BarChart3,
  ClipboardList,
  ExternalLink,
} from "lucide-react";

const STEPS = [
  {
    icon: Camera,
    title: "Capture",
    desc: "Track every play live courtside with fast, tap-friendly controls built for scorekeepers.",
  },
  {
    icon: Cloud,
    title: "Host",
    desc: "Stats sync straight into your Swish Assistant league so standings stay up to date.",
  },
  {
    icon: Share2,
    title: "Share",
    desc: "Publish polished box scores and standings to your community the moment the buzzer sounds.",
  },
];

const FAQ = [
  {
    q: "What is the League Hub?",
    a: "Your home base. Create leagues, invite scorers and admins, schedule games, and jump into live capture.",
  },
  {
    q: "What is the SwishStats Organizer?",
    a: "A single place to manage teams and player rosters across all of your leagues and games.",
  },
  {
    q: "How do roles work?",
    a: "Each league member is a viewer, scorer, or admin. Admins manage the league and set up games, scorers capture live stats, and viewers follow along.",
  },
  {
    q: "Do I need an account?",
    a: "Yes. Swish Stats requires signing in so your leagues, games, and stats stay tied to your account across devices.",
  },
];

export default function Help() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
          <div>
            <p className="sa-eyebrow mb-2">Help</p>
            <h1 className="text-4xl md:text-5xl font-bold">Help &amp; about</h1>
            <p className="text-muted-foreground mt-1">
              Everything you need to get the most out of Swish Stats.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">What is Swish Stats?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Swish Stats is a fast, broadcast-style stat capture platform for
              basketball leagues of any size — from pickup runs to organized
              seasons. Capture games live, generate full FIBA-style box scores
              instantly, and keep your league organized in one connected
              workflow.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Capture. Host. Share.</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="sa-card p-5 space-y-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Where to find things</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureRow
                icon={Trophy}
                title="League Hub"
                desc="Leagues, members, and games."
              />
              <FeatureRow
                icon={BarChart3}
                title="Stats / Analytics"
                desc="Totals across your leagues."
              />
              <FeatureRow
                icon={ClipboardList}
                title="Organizer"
                desc="Teams and player rosters."
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Frequently asked</h2>
            <div className="divide-y sa-card overflow-hidden">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="p-5">
                  <h3 className="font-semibold text-sm">{q}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <Card className="bg-gradient-to-br from-card to-primary/5 border-primary/20">
            <CardContent className="p-6 sm:p-8 space-y-3">
              <h2 className="text-2xl font-bold">
                In partnership with Swish Assistant
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Swish Stats works hand-in-hand with Swish Assistant. Capture
                stats courtside, push them straight to your Swish Assistant
                league, and share box scores with your community — all from one
                connected workflow.
              </p>
              <a
                href="https://www.swishassistant.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Visit swishassistant.com
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} Swish Stats. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Trophy;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 sa-card p-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
