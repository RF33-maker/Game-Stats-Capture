# Scorers Table: new domain, sign-in and hand-over checklist

Written 2026-10-22. The code side is done in the PR this file ships with. What is
left is owner-only: choosing the name, DNS, and settings in the Supabase dashboard.
Nothing below has been done yet. No domain has been bought, no DNS or Auth setting
has been changed, and no account was created on production while checking.

## Where things stand

| Thing | Now |
| --- | --- |
| Hosting | Static Vercel project `swish-stats-capture` (team `rhys-farrells-projects`), deployed with `scripts/deploy-capture.sh` |
| Hostnames on the project | `scorerstable.swishassistant.com` (the canonical one in the page), `table.swishassistant.com`, `capture.swishassistant.com`, `swish-stats-capture.vercel.app` |
| DNS for swishassistant.com | Namecheap (nameservers `dns1/dns2.registrar-servers.com`); Vercel DNS holds no records. The new domain goes at Namecheap too, to keep everything in one place |
| Accounts | Supabase Auth in project `omkwqpcgttrgvbhcxgqf`, **shared with the live swishassistant.com** |
| Auth public settings (read from `/auth/v1/settings`) | email sign-up on, email confirmation required, no Google/Apple/etc., no anonymous users |
| Not readable by me (needs the dashboard) | Site URL, redirect allow-list, email templates, SMTP sender |

## What changed in code (so a stranger can use it on any domain)

- **Create account** on the login page (name optional, password rules the same as the site, terms checkbox, "check your email" screen with resend). Before this, the only sign-up was a link to swishassistant.com.
- **Forgot password now works.** The reset email used to come back to the project's Site URL, and this app had no page to receive it. New `/reset-password` page; the email asks to return to the address the person is on.
- **Email sign-in link** (magic link) that never creates an account; `/auth/confirm` receives sign-up and sign-in links. It handles both link shapes (tokens in the URL, or `?token_hash=` with a confirm button so mail scanners cannot burn the link).
- Friendlier errors ("confirm your email first", already registered, rate limit).
- **Terms of use** and **Privacy policy** pages, linked from sign-up, home, help and the login footer. Drafts; see the owner list.
- One place for the address and names: `src/lib/site.ts` plus build variables (`VITE_SITE_URL`, `VITE_OPERATOR_NAME`, `VITE_OPERATOR_LEGAL`, `VITE_CONTACT_EMAIL`, `VITE_PARTNER_NAME`, `VITE_PARTNER_URL`). The canonical link, share image, structured data, `sitemap.xml` and `robots.txt` are generated from `VITE_SITE_URL` at build, so a new domain is a variable and a redeploy. (Defaults keep today's values.)
- Stale names fixed: menu said "SwishStats", "SwishStats Organizer", "Swish Organiser"; printed game report and footers named swishassistant.com.
- First-run: the empty League hub now shows a five-step "how to start" (create league, add teams and players, schedule a game, score it, hand a game code to another scorer).

## Owner checklist: do these in order

### 0. Decide first

- [ ] **The domain name.** Buy it at Namecheap (same account as swishassistant.com). Leave it on Namecheap's default nameservers (Domain > Nameservers: "Namecheap BasicDNS"), so DNS stays in Advanced DNS. Send me the name and I will prepare the exact commands; I will not add it to Vercel or touch Supabase until you say yes.
- [ ] **One shared login or its own?** Today anyone who signs up here gets a real swishassistant.com account, and the other way round. For a sale, a buyer will want their own Supabase project. The capture tables are in `supabase/migrations/` and can be applied to a new project, but publishing a game and the team/player directory read the Swish site's tables, so that is a bigger piece of work. If it is not done before launch, tell the buyer plainly.
- [ ] **Keep "by Swish Assistant"?** It is in the logo lockup, the share image (`public/opengraph.jpg` has it drawn in, so it needs re-exporting if you change it), the menu and the legal pages. Text is now driven by `VITE_OPERATOR_NAME`; the hoop logo file (`src/assets/swish-assistant-logo.png`, `public/*.png` icons) is still the Swish mark.

### 1. Supabase Auth, before the domain goes live (dashboard > Authentication)

Do not change the **Site URL**. Leaving it alone is what keeps swishassistant.com logins working; this app sends its own redirect addresses.

- [ ] **URL Configuration > Redirect URLs:** add `https://NEWDOMAIN/**` (and `https://www.NEWDOMAIN/**` if used). Keep every swishassistant.com entry. Check that `https://scorerstable.swishassistant.com/**` and `https://table.swishassistant.com/**` are already in the list (or a `https://*.swishassistant.com/**` wildcard). If one is missing, sign-up and reset emails sent from that address land on the main site instead.
- [ ] **Email Templates** (Confirm signup, Magic link, Reset password). Open each and look at the button link.
  - `{{ .ConfirmationURL }}` is fine: it honours the redirect above.
  - `{{ .SiteURL }}/auth/confirm?token_hash=...` sends **everyone, including new Scorers Table users, to swishassistant.com**. Tell me and we pick: edit the template (Supabase templates can branch on `{{ .Data.signed_up_via }}`, which this app sets to `scorers-table` on sign-up; worth testing because magic-link and reset emails for older accounts have no such value), or use a separate project (step 0).
  - Wording: subject and body still say Swish? The templates are shared by every app on the project.
- [ ] **SMTP Settings / sender:** with the built-in Supabase mailer, mail comes from a generic address and is limited to a few emails an hour, which a launch will hit. Use your own SMTP (Resend, Postmark, etc.) with a sender on your domain and set SPF/DKIM there. Set the sender name to the product name.
- [ ] **Password policy:** the app enforces 8+ characters with upper, lower and a number, like the site. Setting the same minimum in Authentication > Providers > Email stops anyone going round the form.
- [ ] Optional: CAPTCHA (Turnstile/hCaptcha) under Authentication > Attack Protection, once strangers can sign up. Say if you want it wired into the form.

### 2. Vercel and DNS (after you give the explicit yes)

I will run, from `~/Developer/Game-Stats-Capture`:

```bash
vercel domains add NEWDOMAIN swish-stats-capture
```

Then in Namecheap: Domain List > Manage NEWDOMAIN > **Advanced DNS** > Host Records. Delete the default parking records first (the `CNAME www` pointing to `parkingpage.namecheap.com` and any `URL Redirect Record` on `@`), then add:

| Host | Type | Value | TTL |
| --- | --- | --- | --- |
| `@` | A Record | `76.76.21.21` | Automatic |
| `www` | CNAME Record | `cname.vercel-dns.com` | Automatic |

Vercel prints the exact values when the domain is added (newer projects get project-specific names); use those if they differ. Namecheap needs the host as `@`/`www`, not the full name. Wait until Vercel shows the domain as Valid; the certificate is issued automatically.

### 3. Point the build at the new address and deploy

- [ ] In `artifacts/swish-stats/.env.local` add `VITE_SITE_URL=https://NEWDOMAIN` (plus any operator variables from `.env.example`).
- [ ] `scripts/deploy-capture.sh --prod`
- [ ] Check `https://NEWDOMAIN/robots.txt`, `/sitemap.xml`, and View Source for the canonical.

### 4. Test it end to end (a real mailbox you own, not a made-up address)

- [ ] Create account, receive the email, check the link's host is the new domain, land signed in.
- [ ] Sign out, "Forgot password?", reset, signed in.
- [ ] "Email me a sign-in link".
- [ ] Sign in at swishassistant.com with the same account. Accounts created here do not go through the site's own register endpoint, so they have no `member_profiles` or consent record there; confirm that page behaves.
- [ ] Create a league, add two teams, schedule a game, open the game's code on a second device and join with it.
- [ ] Install to the home screen on a tablet, go offline, reopen.

### 5. Before launch to the public

- [ ] **Lawyer review of `/terms` and `/privacy`.** They are plain drafts written for this app (accounts, game data, offline storage, Supabase/Vercel/Google Fonts, under-18 players) and say so on the page. Bump `LEGAL_VERSION` in `src/lib/site.ts` when the text changes.
- [ ] **Account deletion and data export:** not in the app. The privacy page tells people to email `VITE_CONTACT_EMAIL`; make sure someone answers it.
- [ ] Confirm the company name and contact email in the legal pages are the ones you want a buyer to inherit.

## Keeping old addresses safe

**Do not redirect or remove `table.`, `capture.` or `scorerstable.` yet.** A scorer's unsynced games live in that address's browser storage; a redirect to a new address starts them with an empty app and the work stays stranded. Leave the old hostnames serving the app (the canonical link already tells search engines which one counts) until every device has synced, then retire them.

## Rollback

Every step above leaves swishassistant.com untouched, so rollback only concerns the new address:

1. Vercel: `vercel domains rm NEWDOMAIN` (or Project > Settings > Domains > Remove). The old hostnames keep working throughout.
2. If the new build misbehaves: `vercel rollback` (or promote the previous deployment in the dashboard), and set `VITE_SITE_URL` back (or remove it) in `.env.local`.
3. DNS: delete the A/CNAME rows.
4. Supabase: removing `https://NEWDOMAIN/**` from the redirect list is optional and harmless. Do not touch the Site URL. If an email template was edited, restore the saved original text (copy it somewhere before editing).
