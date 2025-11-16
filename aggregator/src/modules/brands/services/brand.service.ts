import type { TrackedBrand } from "../types/brand.js";
import { BrandRepository } from "../repositories/brand.repository.js";

export class BrandService {
  constructor(private readonly repository: BrandRepository) {}

  async getTrackedBrands(): Promise<TrackedBrand[]> {
    return this.repository.findAll();
  }
}
