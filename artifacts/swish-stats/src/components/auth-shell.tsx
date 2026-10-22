import { Link } from "wouter";
import { Brand } from "@/components/brand";
import { SITE } from "@/lib/site";

/** The plain centred card used by the pages an emailed link opens. */
export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-background text-foreground">
      <div className="sa-topline" />
      <header className="px-6 h-16 flex items-center">
        <Link href="/"><Brand /></Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-6 py-10">
        <div className="sa-card p-6 md:p-8 w-full max-w-md space-y-5">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            {intro && <p className="mt-2 text-sm text-muted-foreground">{intro}</p>}
          </div>
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-6 py-5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      <span>&copy; {new Date().getFullYear()} {SITE.operator}</span>
      <Link href="/terms" className="hover:text-foreground hover:underline underline-offset-2">Terms</Link>
      <Link href="/privacy" className="hover:text-foreground hover:underline underline-offset-2">Privacy</Link>
      <a href={`mailto:${SITE.contactEmail}`} className="hover:text-foreground hover:underline underline-offset-2">Contact</a>
    </footer>
  );
}
