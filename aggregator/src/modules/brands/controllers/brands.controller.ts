import type { Request, Response } from "express";
import { BrandService } from "../services/brand.service.js";

export class BrandsController {
  constructor(private readonly brandService: BrandService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const brands = await this.brandService.getTrackedBrands();
    res.json({ brands, count: brands.length });
  };
}
