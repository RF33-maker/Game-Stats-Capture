import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/login";
import LeaguesHub from "@/pages/leagues";
import LeagueDetail from "@/pages/league-detail";
import SetupInfo from "@/pages/setup/info";
import SetupTeams from "@/pages/setup/teams";
import SetupPlayers from "@/pages/setup/players";
import SetupExtras from "@/pages/setup/extras";
import GameCapture from "@/pages/game/capture";
import BoxScore from "@/pages/game/box-score";
import LinkPlayers from "@/pages/game/link-players";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Stats from "@/pages/stats";
import Help from "@/pages/help";
import Organizer from "@/pages/organizer";
import { ProtectedRoute } from "@/components/protected-route";
import { RequireLeagueRole } from "@/components/require-league-role";
import { LocalModeBadge } from "@/components/local-mode-badge";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/leagues">
        <ProtectedRoute>
          <LeaguesHub />
        </ProtectedRoute>
      </Route>
      <Route path="/leagues/:leagueId">
        <ProtectedRoute>
          <LeagueDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/stats">
        <ProtectedRoute>
          <Stats />
        </ProtectedRoute>
      </Route>
      <Route path="/organizer">
        <ProtectedRoute>
          <Organizer />
        </ProtectedRoute>
      </Route>
      <Route path="/help" component={Help} />
      <Route path="/setup/:gameId/info">
        <ProtectedRoute>
          <RequireLeagueRole min="admin">
            <SetupInfo />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/setup/:gameId/teams">
        <ProtectedRoute>
          <RequireLeagueRole min="scorer">
            <SetupTeams />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/setup/:gameId/players">
        <ProtectedRoute>
          <RequireLeagueRole min="scorer">
            <SetupPlayers />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/setup/:gameId/extras">
        <ProtectedRoute>
          <RequireLeagueRole min="scorer">
            <SetupExtras />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/game/:gameId">
        <ProtectedRoute>
          <RequireLeagueRole min="scorer">
            <GameCapture />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/game/:gameId/link">
        <ProtectedRoute>
          <RequireLeagueRole min="scorer">
            <LinkPlayers />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route path="/game/:gameId/box">
        <ProtectedRoute>
          <RequireLeagueRole min="viewer">
            <BoxScore />
          </RequireLeagueRole>
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// The capture screen shows the badge inline in its header instead.
function FloatingLocalModeBadge() {
  const [onCapture] = useRoute("/game/:gameId");
  if (onCapture) return null;
  return <LocalModeBadge />;
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
        <FloatingLocalModeBadge />
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;
