# Oxford V1 input contract

Each CSV row is one ordered point on one Oxford curve. `sequence_id` groups points; `point_index` is contiguous from zero; `time_s` is nondecreasing. Identity, source/target checkpoints, and modality are constant within a sequence.

Measured inputs are time in seconds, voltage in volts, capacity coordinate in ampere-hours, and temperature in kelvin. The adapter converts Oxford mAh and Celsius before export. ICA `dQ/dV` and DVA `dV/dQ` are deterministically derived by unsmoothed first differences, and invalid zero-denominator intervals are masked. Current is unavailable in Oxford, represented as zero only after scaling, and excluded by its validity mask. Missing required measurements are rejected.

The authoritative machine-readable definition is `packages/contracts/oxford-input-schema.json`. The included fixture is a complete real `Cell1` C1 charge curve from `cyc0000` forecasting `cyc0100`; because the final checkpoint trained on all cells, it verifies software behavior rather than unbiased performance.
