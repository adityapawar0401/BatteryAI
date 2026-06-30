# Browser inference

The frontend includes the common browser-provider boundary and ONNX Runtime Web dependency. Oxford V1 advertises browser ML as unavailable because the current `torch.export` ONNX route stops on a data-dependent causal-mask guard in `BatteryHistoryTransformer`. An ONNX file alone would not be enough: dynamic sequence and batch parity, browser loading, asset integrity and preprocessing parity must all pass before the profile can be enabled.

The UI explains this capability state and continues to support validation, local pairing and browser-local suggestions.
