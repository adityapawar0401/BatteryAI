# Preflight report

All required supplied paths were found, including `model.pt`, the Oxford `.mat` file, artifact manifests, preprocessing state and source snapshot. The checkpoint is 167,947,919 bytes and SHA-256 `1d070a4d3e9a8fd3883b7e9110bd9e68226ff98cc0e9692c961286cdb053b610`, matching `model.pt.sha256`.

The checkpoint is a Python dictionary with `model_state`, optimizer/scheduler states, preprocessing state, configuration, metrics and metadata; it is not TorchScript. Strict loading reconstructs a 19,508,239-parameter universal superset with 273 state entries. Source commit is `7314f7674924b66df88c5ad848f60f2ea1357398`.

Oxford runtime input is a curve sequence containing time (seconds), voltage (volts), capacity coordinate (Ah), and temperature (K). ICA and DVA are first-difference derived channels. Current is unavailable and masked. The model receives core `[batch, sequence, 4]`, diagnostic `[batch, sequence, 6]`, per-point/feature validity masks, expert availability masks, and one-event history tensors. Only core operational, diagnostic curve, usage aging and residual are active.

SOH head outputs standardized Gaussian location and positive scale. Physical SOH is `location * 7.33991813659668 + 85.38360595703125`; predictive standard deviation is `scale * 7.33991813659668`. The RUL head was not trained. Primary risks are variable checkpoint spacing, no final held-out Oxford set, limited 4 GB VRAM and the current ONNX export guard.
