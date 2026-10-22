import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>
        {SITE.name} is operated by {SITE.operatorLegal} (trading as {SITE.operator}), "we", "us". By creating an account or using
        the app you agree to these terms and to our <a href="/privacy">privacy policy</a>.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over, or old enough to consent to online services where you live, whichever is higher.</li>
        <li>Give a real email address you can read. You are responsible for your password and for what happens under your account.</li>
        <li>Accounts are shared with {SITE.partnerName}: the same email and password work on both, and signing out of one does not sign you out of the other.</li>
      </ul>

      <h2>Your leagues and games</h2>
      <ul>
        <li>What you enter (leagues, teams, players, scores, play-by-play) stays yours. You give us permission to store it, show it to the people you give access to, and publish it where you ask us to.</li>
        <li>If you publish a game to {SITE.partnerName}, it becomes visible there as that site shows competitions.</li>
        <li>Only enter information about people you are allowed to include. Take extra care with children's names and details, and get any consent your league or school requires.</li>
        <li>League admins decide who can view, score and manage. A game code gives one game's scoring access to whoever holds it, so share it carefully.</li>
      </ul>

      <h2>Using the app</h2>
      <ul>
        <li>Do not misuse the service, interfere with it, try to reach data you have not been given access to, or enter unlawful or abusive content.</li>
        <li>The app works offline and keeps unsent changes on your device until you are back online and signed in. Signing out or clearing the browser's data before changes have synced can lose them. Keep an eye on the sync status before you close up.</li>
        <li>We may suspend accounts that break these terms.</li>
      </ul>

      <h2>Our responsibility</h2>
      <p>
        We work to keep the service available and accurate, but it is provided as it is. We do not promise it is always available or free of errors, and
        we are not responsible for a result that is wrong because a play was entered wrongly or not synced. Nothing here limits liability that cannot be limited by law.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the version number when we do. Questions, or want your account closed:
        {" "}<a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
