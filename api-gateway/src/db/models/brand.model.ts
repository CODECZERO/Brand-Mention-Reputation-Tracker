import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface BrandKeywordDocument {
  _id: Types.ObjectId;
  value: string;
  createdAt: Date;
}

export interface BrandDocument extends Document {
  name: string;
  slug: string;
  aliases: string[];
  rssFeeds: string[];
  keywords: BrandKeywordDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const KeywordSchema = new Schema<BrandKeywordDocument>(
  {
    value: { type: String, required: true, trim: true },
  },
  {
    _id: true,
    timestamps: { createdAt: true, updatedAt: false },
    id: false,
  },
);

const BrandSchema = new Schema<BrandDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    aliases: { type: [String], default: [] },
    rssFeeds: { type: [String], default: [] },
    keywords: { type: [KeywordSchema], default: [] },
  },
  {
    timestamps: true,
    collection: "brands",
    versionKey: false,
  },
);

BrandSchema.index({ slug: 1 });

export const BrandModel: Model<BrandDocument> =
  mongoose.models.Brand || mongoose.model<BrandDocument>("Brand", BrandSchema);
