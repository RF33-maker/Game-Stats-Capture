import { ChevronRight } from "lucide-react";
import { SITE, LEGAL_VERSION, appUrl } from "@/lib/site";

// The legal tick box on the sign-up form, with the key points to read inline.
// The full /terms and /privacy pages say the same things at more length: change
// them together and bump LEGAL_VERSION in lib/site.ts, which is stored with each
// sign-up as the record of which wording was accepted.

const linkClass = "font-medium text-primary hover:underline underline-offset-2";

/** Opens in a new tab so the half-filled sign-up form is not lost. */
function NewTabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function SignupTerms({ agreed, onChange }: { agreed: boolean; onChange: (agreed: boolean) => void }) {
  const termsUrl = appUrl("/terms");
  const privacyUrl = appUrl("/privacy");

  return (
    <div className="space-y-2" data-testid="signup-terms">
      <label className="flex items-start gap-2.5 text-sm text-muted-foreground cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={agreed}
          onChange={(e) => onChange(e.target.checked)} data-testid="terms-checkbox" />
        <span>
          I'm 18 or over and I accept the <NewTabLink href={termsUrl}>terms</NewTabLink> and{" "}
          <NewTabLink href={privacyUrl}>privacy policy</NewTabLink>. I understand that my personal data is handled
          under UK GDPR and the Data Protection Act 2018, and that this login is a single {SITE.partnerName} account
          that also works on {SITE.partnerHost}.
        </span>
      </label>

      <details className="group pl-[26px]" data-testid="terms-key-points">
        <summary className="inline-flex items-center gap-1 cursor-pointer select-none list-none text-sm font-medium text-primary hover:underline underline-offset-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          Read the key points
        </summary>

        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3.5 text-xs leading-relaxed text-muted-foreground space-y-3">
          <ul className="space-y-2.5">
            <li>
              <strong className="text-foreground">Who we are.</strong> {SITE.operatorLegal}, trading as {SITE.operator}, runs {SITE.name}.
              We are the controller of your personal data. Contact:{" "}
              <a href={`mailto:${SITE.contactEmail}`} className={linkClass}>{SITE.contactEmail}</a>.
            </li>
            <li>
              <strong className="text-foreground">The law.</strong> We handle your personal data under the UK General Data Protection
              Regulation (UK GDPR) and the Data Protection Act 2018.
            </li>
            <li>
              <strong className="text-foreground">What we keep for your account.</strong> Your email address, your password (stored only
              as a hash by our sign-in provider), your name if you give one, and the date and version of the terms you accept now.
              What you score and publish is kept too, as the privacy policy explains.
            </li>
            <li>
              <strong className="text-foreground">One account, two sites.</strong> This creates a single {SITE.partnerName} account:
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>The same email and password work on {SITE.name} and on {SITE.partnerHost}. You sign in on each separately.</li>
                <li>Games you publish from {SITE.name} are shown on {SITE.partnerHost}.</li>
                <li>
                  {SITE.partnerHost} keeps its own member profile and consent record for the account. The date and version of the
                  terms you accept here are recorded with the account, and {SITE.partnerHost} can copy them into its record.
                </li>
                <li>Because it is one account, changing the password, or closing the account, applies to both sites.</li>
              </ul>
            </li>
            <li>
              <strong className="text-foreground">Your rights.</strong> You can ask to see, correct, export or delete your personal data,
              to restrict or object to how it is used, or to close your account, by emailing {SITE.contactEmail}. If you are unhappy
              with how it is handled you can complain to the Information Commissioner's Office (ICO) at{" "}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className={linkClass}>
                ico.org.uk<span className="sr-only"> (opens in a new tab)</span>
              </a>.
            </li>
          </ul>
          <p>
            Read the full <NewTabLink href={termsUrl}>terms</NewTabLink> and <NewTabLink href={privacyUrl}>privacy policy</NewTabLink>.
            They open in a new tab, so you won't lose what you've typed. Version {LEGAL_VERSION}.
          </p>
        </div>
      </details>
    </div>
  );
}
