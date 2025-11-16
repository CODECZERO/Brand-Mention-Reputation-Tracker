import { Router } from "express";
import { BrandsController } from "../controllers/brands.controller.js";

export const createBrandsRouter = (controller: BrandsController): Router => {
  const router = Router();

  router.get("/", controller.list);

  return router;
};
