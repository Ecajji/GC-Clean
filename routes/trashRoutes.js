import express from "express";
import {
  addTrash,
  checkCollector,
  getLeaderboard,
} from "../controllers/trashController.js";

const router = express.Router();

router.post("/add", addTrash);
router.get("/check-collector", checkCollector);
router.get("/leaderboard", getLeaderboard);

export default router;
