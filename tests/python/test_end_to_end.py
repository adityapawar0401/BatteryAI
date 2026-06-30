from __future__ import annotations

import json


def test_real_fixture_to_normalized_result_and_static_shell(cpu_engine, inference_request, root):
    actual = cpu_engine.predict(inference_request)
    expected = json.loads((root / "apps" / "web" / "public" / "fixtures" / "oxford-expected-output.json").read_text(encoding="utf-8"))
    result = actual.results[0]
    assert result.predicted_soh == expected["results"][0]["predicted_soh"]
    assert result.model_sha256 == expected["results"][0]["model_sha256"]
    assert result.backend == "local-pytorch"
    assert (root / "apps" / "web" / "dist" / "index.html").is_file()
