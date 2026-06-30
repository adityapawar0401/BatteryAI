from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_inputs" / "source"
sys.path.insert(0, str(SOURCE))

from battery_pimoe.config.schemas import DatasetConfig  # noqa: E402
from battery_pimoe.data.adapters.oxford import OxfordDatasetAdapter  # noqa: E402


FIELDS = [
    "sequence_id",
    "cell_id",
    "source_checkpoint",
    "target_checkpoint",
    "modality",
    "point_index",
    "time_s",
    "voltage_V",
    "capacity_Ah",
    "temperature_K",
    "actual_soh",
]


def main() -> None:
    raw = ROOT / "_inputs" / "raw" / "oxford" / "Oxford_Battery_Degradation_Dataset_1.mat"
    config = DatasetConfig(
        dataset_id="oxford_battery_degradation_dataset_1",
        root=raw,
        source_format="oxford_matlab",
        adapter="oxford",
        battery_id_field="cell_id",
        event_id_field="checkpoint_modality",
        field_map={"time": "t", "voltage": "v", "capacity_coordinate": "q", "cell_temperature": "T"},
        unit_map={"t": "second", "v": "volt", "q": "milliampere_hour", "T": "celsius"},
        derived_current={"enabled": False, "method": "first_difference", "sign_convention": "as_measured_capacity_coordinate"},
        event_ontology={"C1ch": "controlled_charge", "C1dc": "controlled_discharge", "OCVch": "pseudo_ocv_charge", "OCVdc": "pseudo_ocv_discharge"},
        target_construction={
            "soh": {"enabled": True, "reference_strategy": "first_valid_configured_reference_checkpoint", "reference_checkpoint": None, "prediction_horizon": "next_checkpoint", "same_checkpoint_input_includes_capacity_endpoint": False},
            "rul": {"enabled": False, "axis": "observed_checkpoints", "endpoint_definition": "disabled", "censoring": "disabled", "method": "disabled"},
        },
        split_strategy={"strategy": "leave_one_cell_out", "seed": 123},
        audit={"ica_dva": {"smoothing": {"enabled": False}, "differentiation_method": "first_difference", "interpolation_method": "none", "min_valid_points": 1, "min_valid_fraction": 0.0}, "physics_state_enabled": False},
    )
    histories = OxfordDatasetAdapter(config).load()
    chosen = None
    target_checkpoint = None
    actual_soh = None
    for history in histories:
        checkpoints: dict[int, list] = {}
        ids: dict[int, str] = {}
        for event in history.events:
            index = int(event.static_metadata["checkpoint_index"])
            checkpoints.setdefault(index, []).append(event)
            ids[index] = str(event.checkpoint_id)
        ordered = sorted(checkpoints)
        for position, index in enumerate(ordered[:-1]):
            event = next((item for item in checkpoints[index] if item.static_metadata.get("oxford_modality") == "C1ch" and item.modalities["core"].modality_available), None)
            labelled = next((item for item in checkpoints[index] if item.targets.masks.get("soh")), None)
            if event is not None and labelled is not None:
                chosen = event
                target_checkpoint = ids[ordered[position + 1]]
                actual_soh = float(labelled.targets.values["soh"])
                break
        if chosen is not None:
            break
    if chosen is None or target_checkpoint is None or actual_soh is None:
        raise RuntimeError("No legitimate C1ch Oxford transition was found")
    values = chosen.modalities["core"].values
    output = ROOT / "apps" / "web" / "public" / "fixtures" / "oxford-real-example.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    sequence_id = f"{chosen.battery_id}:{chosen.checkpoint_id}->{target_checkpoint}"
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for index, (time_s, voltage, capacity, temperature) in enumerate(zip(values["time_s"], values["voltage_V"], values["capacity_Ah"], values["temperature_K"])):
            writer.writerow({
                "sequence_id": sequence_id,
                "cell_id": chosen.battery_id,
                "source_checkpoint": chosen.checkpoint_id,
                "target_checkpoint": target_checkpoint,
                "modality": "C1ch",
                "point_index": index,
                "time_s": float(time_s),
                "voltage_V": float(voltage),
                "capacity_Ah": float(capacity),
                "temperature_K": float(temperature),
                "actual_soh": actual_soh,
            })
    template = ROOT / "apps" / "web" / "public" / "fixtures" / "oxford-template.csv"
    template.write_text(",".join(FIELDS) + "\n", encoding="utf-8")
    print(json.dumps({"fixture": str(output.relative_to(ROOT)), "rows": index + 1, "sequence_id": sequence_id, "actual_soh": actual_soh}, indent=2))


if __name__ == "__main__":
    main()
