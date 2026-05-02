import { Switch, Route, Router as WouterRouter } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import SetupInfo from "@/pages/setup/info";
import SetupTeams from "@/pages/setup/teams";
import SetupPlayers from "@/pages/setup/players";
import SetupExtras from "@/pages/setup/extras";
import GameCapture from "@/pages/game/capture";
import BoxScore from "@/pages/game/box-score";
import { LocalModeBadge } from "@/components/local-mode-badge";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/setup/:gameId/info" component={SetupInfo} />
      <Route path="/setup/:gameId/teams" component={SetupTeams} />
      <Route path="/setup/:gameId/players" component={SetupPlayers} />
      <Route path="/setup/:gameId/extras" component={SetupExtras} />
      <Route path="/game/:gameId" component={GameCapture} />
      <Route path="/game/:gameId/box" component={BoxScore} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
        {LOCAL_MODE_ENABLED && <LocalModeBadge />}
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;
