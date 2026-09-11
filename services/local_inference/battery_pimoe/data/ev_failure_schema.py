"""Leak-free runtime fields for the EV failure snapshot task."""

VERSION = "ev_failure_snapshot_v1"
GROUPS = {
    "core_operational": ["cell_voltage_avg", "cell_temperature_avg"],
    "usage_aging": ["cycle_count", "vehicle_age_years", "odometer_km"],
    "chemistry_geometry": ["battery_chemistry"],
    "pack_context": ["battery_capacity_kwh", "pack_voltage", "cell_voltage_std"],
    "physics_state": ["state_of_charge", "depth_of_discharge", "internal_resistance"],
    "residual": [
        "charging_cycles_last_month", "fast_charge_ratio", "average_charge_power_kw",
        "average_charging_time", "overnight_charging_ratio", "home_charging_ratio",
        "charging_interruptions", "overcharge_events", "average_speed",
        "average_trip_distance", "regenerative_braking_usage", "highway_driving_ratio",
        "daily_distance", "average_ambient_temperature", "maximum_temperature",
        "minimum_temperature", "humidity", "altitude", "last_service_days",
    ],
}
NUMERIC_INPUTS = [field for expert, fields in GROUPS.items() if expert != "chemistry_geometry" for field in fields]
