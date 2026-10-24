import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        {SITE.name} is operated by {SITE.operatorLegal} (trading as {SITE.operator}), who decides how your personal information is used.
        Contact: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li><strong>Your account:</strong> email address, a password (stored only as a hash by our sign-in provider), an optional name, and when you accepted these terms.</li>
        <li><strong>What you score:</strong> leagues, teams, players (names and shirt numbers, and any link to their profile on {SITE.partnerName}), venues, officials, games, and every play, shot and foul you record.</li>
        <li><strong>Who has access:</strong> which accounts are members of which league, and which accounts joined a game with a code.</li>
        <li><strong>On your device:</strong> the app keeps a working copy of your leagues and games in your browser's storage so it keeps working with no signal. We use no advertising or analytics trackers.</li>
      </ul>

      <h2>Why, and who sees it</h2>
      <ul>
        <li>To run the app: sign you in, sync your games between devices, and let the people you give access to see and score them.</li>
        <li>When you publish a game, its box score, plays and player names are shown on {SITE.partnerName}.</li>
        <li>Players' names are visible to the other members of the league they are in.</li>
        <li>We do not sell personal information.</li>
      </ul>

      <h2>Services we use</h2>
      <ul>
        <li>A database and sign-in provider, which stores your account and game data and lets you sign in.</li>
        <li>A hosting provider, which serves the app to your device.</li>
        <li>Google Fonts for the typefaces, which means your device asks Google's servers for them when the page loads.</li>
        <li>Your email provider carries the confirmation and reset emails we send.</li>
      </ul>
      <p>
        The names of these providers, and where your data is held, are available on request: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>

      <h2>Children</h2>
      <p>
        Accounts are for adults. Leagues may include players under 18, so organisers should only enter what they are entitled to and obtain any consent
        required. Tell us and we will remove a child's details.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us to see, correct, export or delete your information, or close your account, by emailing {SITE.contactEmail}. Where the law applies you can also
        complain to your data protection regulator (in the UK, the ICO). We keep information while your account is open and for a short time after for backups and legal records.
      </p>
    </LegalPage>
  );
}
