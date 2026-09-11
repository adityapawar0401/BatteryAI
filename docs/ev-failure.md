# EV failure inference

BatteryAI loads `oxford_ev_failure_v1_full` server-side and verifies SHA-256 `24f985e578fb8db4610a4019e0e894a4e151e1f888622057c4ef6b356f1647e2` before inference. The checkpoint's validation-selected classification threshold is `0.3624247610569`.

`POST /api/predict/failure` requires the standard `X-BatteryAI-Token` header and a JSON body shaped as `{"snapshot": {...}}`. The snapshot accepts `battery_chemistry` (`LFP`, `LTO`, `NCA`, or `NMC`) and these numeric source-unit fields:

- Operational: `cell_voltage_avg` (V), `cell_temperature_avg` (°C)
- Usage/aging: `cycle_count`, `vehicle_age_years`, `odometer_km`, `daily_distance`, `last_service_days`
- Pack: `battery_capacity_kwh`, `pack_voltage` (V), `cell_voltage_std` (V)
- Physics: `state_of_charge` (%), `depth_of_discharge` (%), `internal_resistance` (mΩ)
- Charging: `charging_cycles_last_month`, `fast_charge_ratio`, `average_charge_power_kw`, `average_charging_time` (minutes), `overnight_charging_ratio`, `home_charging_ratio`, `charging_interruptions`, `overcharge_events`
- Driving/environment: `average_speed`, `average_trip_distance`, `regenerative_braking_usage` (%), `highway_driving_ratio`, `average_ambient_temperature` (°C), `maximum_temperature` (°C), `minimum_temperature` (°C), `humidity` (%), `altitude` (m)

Numeric fields may be explicitly `null`; the exact trained missing mask is preserved. The service never imputes a user-visible fabricated value. Unit conversion, train-fitted clipping, standardization, chemistry vocabulary encoding and missing masking come from checkpoint preprocessing metadata. Brand, manufacturer, model, identifiers, `battery_failure`, derived health scores and leakage-prone proxy fields are forbidden by the strict request contract.

The response contains `failure_probability`, `failure_flag`, `decision_threshold`, `model_version`, `model_sha256`, device and latency. `POST /api/predict/failure/batch` accepts `{"snapshots": [...]}` with 1–256 snapshots and preserves input order in `results`.

This capability estimates classification risk from an independent snapshot. It does not provide remaining useful life, a failure date, a safety guarantee, or a claim that a battery is safe.

## Validation performance

On the current Windows host, measured after one warm-up pass: CPU single-snapshot median 13.0 ms (five runs), CPU batch-256 218.3 ms, CUDA single-snapshot median 31.4 ms, and CUDA batch-256 114.0 ms. A fresh CPU engine object verified and loaded the checkpoint in 0.326 s. These are host measurements, not service-level latency guarantees.
