import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface BrandDocument extends Document {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const BrandSchema = new Schema<BrandDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true },
  },
  {
    timestamps: true,
    collection: "brands",
  },
);

export const BrandModel: Model<BrandDocument> =
  mongoose.models.Brand || mongoose.model<BrandDocument>("Brand", BrandSchema);
