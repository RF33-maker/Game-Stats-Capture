import { HardDrive, RotateCcw } from "lucide-react";
import { resetLocalData } from "@/lib/local-mode";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LocalModeBadge() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-amber-500/90 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-amber-400/50">
      <HardDrive className="w-3.5 h-3.5" />
      <span>LOCAL MODE</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-amber-950 hover:bg-amber-600/30 hover:text-amber-950 rounded-full"
            onClick={() => {
              if (confirm("Reset all local data? This will erase all games, teams, players, and stats.")) {
                resetLocalData();
              }
            }}
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset local data</TooltipContent>
      </Tooltip>
    </div>
  );
}
