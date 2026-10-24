import { Link } from "wouter";
import { Brand } from "@/components/brand";
import { LegalFooter } from "@/components/auth-shell";
import { AppMenu } from "@/components/app-menu";
import { LEGAL_VERSION } from "@/lib/site";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <div className="sa-topline" />
      <header className="px-6 h-16 flex items-center justify-between">
        <Link href="/"><Brand /></Link>
        <AppMenu />
      </header>
      <main className="flex-1 px-6 py-8">
        <article className="max-w-3xl mx-auto space-y-4 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-primary [&_a:hover]:underline [&_strong]:text-foreground">
          <p className="sa-eyebrow">Legal</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground">{title}</h1>
          <p className="text-xs">Version {LEGAL_VERSION}. This is a working draft and needs review by a qualified legal adviser before it is relied on.</p>
          {children}
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
