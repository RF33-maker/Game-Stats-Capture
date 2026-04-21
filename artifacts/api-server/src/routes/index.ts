import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import teamsRouter from "./teams";
import playersRouter from "./players";
import statsRouter from "./stats";
import playByPlayRouter from "./playByPlay";
import aggregatesRouter from "./aggregates";
import seedRouter from "./seed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gamesRouter);
router.use(teamsRouter);
router.use(playersRouter);
router.use(statsRouter);
router.use(playByPlayRouter);
router.use(aggregatesRouter);
router.use(seedRouter);

export default router;
