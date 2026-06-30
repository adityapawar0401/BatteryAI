# Browser export report

The actual Oxford V1 model was loaded strictly and wrapped with tensor-only core, diagnostic and validity inputs. `torch.onnx.export(..., dynamo=True, opset_version=18)` was attempted with dynamic batch and sequence dimensions.

Export stopped before ONNX creation with `GuardOnDataDependentSymNode: Could not guard on data-dependent expression Eq(u0, 1)`. The source is causal-mask detection inside `BatteryHistoryTransformer`'s `TransformerEncoder`. No ONNX asset was retained, so Python ONNX parity, browser loading and browser batch parity are not applicable. The model profile correctly keeps browser ML unavailable. The full machine-readable outcome is in `docs/browser-export-data.json`.
