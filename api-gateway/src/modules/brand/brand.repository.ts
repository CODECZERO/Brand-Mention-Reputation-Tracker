import { BrandModel } from "./brand.model";

export interface BrandRecord {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function findCurrentBrand(): Promise<BrandRecord | null> {
  const doc = await BrandModel.findOne().sort({ createdAt: -1 }).lean<BrandRecord>().exec();
  if (!doc) {
    return null;
  }

  return {
    name: doc.name,
    slug: doc.slug,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  } satisfies BrandRecord;
}

export async function replaceCurrentBrand(name: string, slug: string): Promise<BrandRecord> {
  await BrandModel.deleteMany({}).exec();
  const created = await BrandModel.create({ name, slug });
  const plain = created.toObject();

  return {
    name: plain.name,
    slug: plain.slug,
    createdAt: new Date(plain.createdAt),
    updatedAt: new Date(plain.updatedAt),
  } satisfies BrandRecord;
}
