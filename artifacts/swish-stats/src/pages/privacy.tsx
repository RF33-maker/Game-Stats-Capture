import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        {SITE.name} is operated by {SITE.operatorLegal} (trading as {SITE.operator}), "we", "us". {SITE.operatorLegal} is the controller of the
        personal information described here: it decides how and why it is used. We handle it under the UK General Data Protection Regulation
        (UK GDPR) and the Data Protection Act 2018. Contact: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>Your account:</strong> email address, a password (stored only as a hash by our sign-in provider), an optional name, and the date you
          accepted these terms with the version number you accepted (shown at the top of the terms and of this page).
        </li>
        <li><strong>What you score:</strong> leagues, teams, players (names and shirt numbers, and any link to their profile on {SITE.partnerName}), venues, officials, games, and every play, shot and foul you record.</li>
        <li><strong>Who has access:</strong> which accounts are members of which league, and which accounts joined a game with a code.</li>
        <li><strong>On your device:</strong> the app keeps a working copy of your leagues and games in your browser's storage so it keeps working with no signal. We use no advertising or analytics trackers.</li>
      </ul>

      <h2>One account for {SITE.name} and {SITE.partnerName}</h2>
      <p>
        {SITE.name} and {SITE.partnerName} ({SITE.partnerHost}) share the same sign-in accounts. Creating an account here creates a
        {" "}{SITE.partnerName} account, and the same email and password work on both. What that means for your information:
      </p>
      <ul>
        <li>The account itself (email address, password hash, name and the record of the terms you accepted) is a single account used by both products. You sign in on each separately.</li>
        <li>Games you publish from {SITE.name} are shown on {SITE.partnerName}, including box scores, plays and player names.</li>
        <li>
          {SITE.partnerName} keeps its own member profile and consent record for the account. The date and version of the terms you accept here are
          recorded with the account, and {SITE.partnerName} can copy them into its record. How {SITE.partnerName} uses your information is
          described in <a href={`${SITE.partnerUrl}/privacy`} target="_blank" rel="noopener noreferrer">its privacy policy</a>.
        </li>
        <li>It is one account, so changing the password, or closing the account, applies to both.</li>
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
      <p>
        <em>Some of these services may handle information outside the UK. The safeguards that apply to that are still to be confirmed in legal review.</em>
      </p>

      <h2>Children</h2>
      <p>
        Accounts are for adults. Leagues may include players under 18, so organisers should only enter what they are entitled to and obtain any consent
        required. Tell us and we will remove a child's details.
      </p>

      <h2>Your rights</h2>
      <p>Under UK GDPR and the Data Protection Act 2018 you can ask us to:</p>
      <ul>
        <li>give you a copy of your personal information (access) and, where it applies, a portable copy of it;</li>
        <li>correct information that is wrong;</li>
        <li>delete your information, or close your account;</li>
        <li>restrict how we use your information, or object to a use of it.</li>
      </ul>
      <p>
        These rights have limits set by law and some apply only in certain situations. To use any of them, email{" "}
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. We will reply within one month, as the law requires. Because
        your login is one account for {SITE.name} and {SITE.partnerName}, a request to close it applies to both.
      </p>
      <p>
        If you are unhappy with how your information is handled, you can complain to the Information Commissioner's Office (ICO), the UK data
        protection regulator, at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep information while your account is open and for a short time after for backups and legal records.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy and will change the version number when we do. The version you accepted is recorded with your account.
      </p>
    </LegalPage>
  );
}
