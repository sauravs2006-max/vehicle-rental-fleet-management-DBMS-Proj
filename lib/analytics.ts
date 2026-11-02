import { getMongo } from "./mongo";

/**
 * MongoDB aggregation pipeline - fleet fuel / telematics analytics.
 * Raw sensor readings -> per-vehicle efficiency and driving-behaviour scorecard.
 */
export async function fleetTelematicsSummary(days = 30) {
  const db = await getMongo();
  const since = new Date(Date.now() - days * 86_400_000);
  return db.collection("telematics").aggregate([
    { $match: { ts: { $gte: since } } },
    { $group: {
        _id: "$vehicle_id",
        readings:    { $sum: 1 },
        distance_km: { $sum: "$distance_km" },
        fuel_litres: { $sum: "$fuel_litres" },
        energy_kwh:  { $sum: "$energy_kwh" },
        avg_speed:   { $avg: "$speed_kmph" },
        max_temp:    { $max: "$engine_temp_c" },
        harsh_brakes: { $sum: { $cond: ["$harsh_brake", 1, 0] } },
        harsh_accels: { $sum: { $cond: ["$harsh_accel", 1, 0] } },
    } },
    { $addFields: {
        km_per_litre: { $cond: [{ $gt: ["$fuel_litres", 0] }, { $round: [{ $divide: ["$distance_km", "$fuel_litres"] }, 1] }, null] },
        harsh_events_per_100km: { $cond: [{ $gt: ["$distance_km", 0] },
            { $round: [{ $multiply: [{ $divide: [{ $add: ["$harsh_brakes", "$harsh_accels"] }, "$distance_km"] }, 100] }, 2] }, 0] },
    } },
    { $addFields: { driving_score: { $max: [0, { $round: [{ $subtract: [100, { $multiply: ["$harsh_events_per_100km", 4] }] }, 0] }] } } },
    { $project: { _id: 0, vehicle_id: "$_id", readings: 1, distance_km: { $round: ["$distance_km", 0] },
        fuel_litres: { $round: ["$fuel_litres", 1] }, energy_kwh: { $round: ["$energy_kwh", 1] },
        avg_speed: { $round: ["$avg_speed", 1] }, max_temp: 1, harsh_brakes: 1, harsh_accels: 1,
        km_per_litre: 1, harsh_events_per_100km: 1, driving_score: 1 } },
    { $sort: { driving_score: 1 } },
  ]).toArray();
}
