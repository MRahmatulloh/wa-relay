import mongoose from 'mongoose';

const placeCacheSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, unique: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const PlaceCache = mongoose.model('PlaceCache', placeCacheSchema);
