"""Offline checks, no API calls: python -B data/vision-growingsoy/check_segment.py."""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch

from PIL import Image
import segment as s


def response(polygons, status="assessed"):
    return json.dumps({"status": status, "reason": "Comprobación sintética, no inferencia.",
                       "limitations": [], "polygons": polygons})


def envelope(text):
    return json.dumps({"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"thought": True, "text": "ignored"}, {"text": text}]}}]}).encode("utf-8")


def main():
    triangle = [[0, 0], [500, 0], [0, 500]]
    _, mask = s.detection(response([triangle]), (10, 6))
    expected = {(x, y) for y, width in enumerate((6, 4, 3, 1)) for x in range(width)}
    assert {(x, y) for y in range(6) for x in range(10) if mask.getpixel((x, y))} == expected
    assert s.metrics(mask, None)["weed_pct"] == 100 * 14 / 60
    _, duplicate = s.detection(response([triangle, triangle]), (10, 6))
    assert duplicate.tobytes() == mask.tobytes()
    _, edge = s.detection(response([[[700, 700], [1000, 700], [1000, 1000]]]), (10, 6))
    assert edge.getpixel((9, 5)) and not edge.getpixel((0, 0))
    _, empty = s.detection(response([]), mask.size)
    assert s.metrics(empty, empty) == {"weed_pct": 0, "absolute_error_pp": 0, "iou": None, "both_empty": True}
    assert s.metrics(mask, mask)["iou"] == 1
    assert s.metrics(empty, mask)["iou"] == 0
    _, mixed = s.detection(response([triangle, [[700, 700], [1000, 700], [1000, 1000]]]), mask.size)
    assert s.metrics(mixed, mask)["iou"] == 14 / (60 - mixed.histogram()[0])
    _, abstain = s.detection(response([], "not_assessable"), mask.size)
    assert abstain is None and s.metrics(abstain, mask)["weed_pct"] is None
    invalid = [response([triangle] * 65), response([triangle * 43]),
               response([triangle], "not_assessable"), response([], "estimated"), "{}", "null", "[]",
               response([]).replace('"polygons": []', '"polygons": [], "polygons": []')]
    for polygon in ([], [[0, 0], [1, 1]], [[0, 0], [1, 1], [2, 2]],
                    [[0, 0], [100, 0], [100, 100], [0, 100]],
                    [[0, 0], [50, 0], [100, 0], [100, 100], [0, 100]],
                    [[500, 0], [1000, 500], [500, 1000], [0, 500]],
                    [[0, 0], [900, 800], [0, 900], [700, 0]],
                    [[0, 0], [500, 0], [200, 0], [0, 500]],
                    [[0, 0], [1001, 0], [0, 500]], [[0, 0], [-1, 0], [0, 500]],
                    [[False, 0], [500, 0], [0, 500]], [["0", 0], [500, 0], [0, 500]],
                    [[float("nan"), 0], [500, 0], [0, 500]],
                    [[float("inf"), 0], [500, 0], [0, 500]], triangle + [triangle[0]]):
        invalid.append(response([polygon]))
    for bad in invalid:
        try:
            s.detection(bad, (10, 6))
        except ValueError:
            pass
        else:
            raise AssertionError(f"Accepted invalid: {bad}")
    assert s.response_text(envelope(response([]))) == response([])
    for raw in (b"null", b"{}", b'{"candidates": []}', envelope(response([])).replace(b"STOP", b"MAX_TOKENS")):
        try:
            s.response_text(raw)
        except ValueError:
            pass
        else:
            raise AssertionError("Accepted incomplete API response")
    body = s.payload(b"image-only", "image/jpeg", "prompt soja")
    assert base64.b64decode(body["contents"][0]["parts"][1]["inlineData"]["data"]) == b"image-only"
    assert set(body) == {"contents", "generationConfig"} and len(body["contents"][0]["parts"]) == 2
    provider_polygons = body["generationConfig"]["responseJsonSchema"]["properties"]["polygons"]
    assert "maxItems" not in provider_polygons and "maxItems" not in provider_polygons["items"]
    with patch.object(s.http.client, "HTTPSConnection") as connection:
        connection.return_value.request.side_effect = TimeoutError
        transport, raw = s.http_once(body, "synthetic-secret")
        assert transport["api_error"] and raw == b""
        assert connection.return_value.request.call_count == 1
        connection.return_value.close.assert_called_once()
    with patch.object(s.http.client, "HTTPSConnection") as connection:
        connection.return_value.getresponse.return_value.status = 429
        connection.return_value.getresponse.return_value.read.return_value = b"quota synthetic-secret"
        transport, raw = s.http_once(body, "synthetic-secret")
        assert transport["api_error"] == "HTTP_429" and b"synthetic-secret" not in raw
        assert connection.return_value.request.call_count == 1
    with patch.object(s.subprocess, "run", side_effect=subprocess.TimeoutExpired("test", 30)) as child:
        transport, raw = s.request_once(body, "synthetic-secret")
        assert transport["api_error"] and raw == b"" and child.call_args.kwargs["timeout"] == 30
        assert "synthetic-secret" not in str(child.call_args.args)
    rgb = Image.new("RGB", mask.size, (80, 100, 120))
    sheet = s.comparison(rgb, mask, mask, ["", "", ""])
    painted = sheet.crop((10, 44, 20, 50))
    assert {(x, y) for y in range(6) for x in range(10) if painted.getpixel((x, y)) != rgb.getpixel((x, y))} == expected
    with tempfile.TemporaryDirectory() as temp:
        runs = Path(temp)
        with patch.object(s, "RUNS", runs), patch.dict(s.os.environ, {"GEMINI_API_KEY": ""}), patch.object(s, "request_once") as send:
            run = s.run_experiment()
            assert run["requests_sent"] == 0 and run["summary"]["mae_pp"] is None
            send.assert_not_called()
        with patch.object(s, "RUNS", runs), patch.dict(s.os.environ, {"GEMINI_API_KEY": "synthetic-secret"}), patch.object(s, "request_once") as send:
            run = s.run_experiment()
            assert run["blocked_reason"] == "project_without_billing_not_confirmed"
            send.assert_not_called()
        synthetic = [( {"http_status": 200, "api_error": None}, envelope(text)) for text in
                     (response([]), response([triangle]), "broken", response([], "not_assessable"))]
        with patch.object(s, "RUNS", runs), patch.dict(s.os.environ, {"GEMINI_API_KEY": "synthetic-secret"}), patch.object(s, "request_once", side_effect=synthetic) as send:
            run = s.run_experiment(True)
            assert send.call_count == run["requests_sent"] == 4
            assert [r["id"] for r in run["results"]] == [*s.IDS, "control"]
            # Dos respuestas evaluables: la abstencion y la respuesta invalida quedan fuera del MAE.
            # Cada par evaluable cae en IoU o en "ambas vacias", nunca en los dos ni en ninguno.
            assert run["summary"]["mae_n"] == 2
            assert run["summary"]["iou_n"] + run["summary"]["both_empty_n"] == 2
            assert run["results"][-1]["control_pass"] is True
            run = s.run_experiment(True)
            assert run["requests_sent"] == 0 and send.call_count == 4
            assert run["blocked_reason"] == "four_request_experiment_already_reserved"
        # Un nombre distinto reserva su propio presupuesto; la reserva anterior sigue en pie.
        with (patch.object(s, "RUNS", runs),
              patch.dict(s.os.environ, {"GEMINI_API_KEY": "synthetic-secret"}),
              patch.object(s, "request_once", side_effect=list(synthetic)) as send):
            run = s.run_experiment(True, "otro-experimento")
            assert run["experiment"] == "otro-experimento" and run["requests_sent"] == 4
            assert (runs / "otro-experimento.started.json").exists()
            assert (runs / f"{s.EXPERIMENT}.started.json").exists()
        # La declaracion de gasto asumido tambien abre la puerta, y queda registrada aparte.
        with (patch.object(s, "RUNS", runs),
              patch.dict(s.os.environ, {"GEMINI_API_KEY": "synthetic-secret"}),
              patch.object(s, "request_once", side_effect=list(synthetic))):
            run = s.run_experiment(False, "con-facturacion", billing_acknowledged=True)
            assert run["blocked_reason"] != "project_without_billing_not_confirmed"
            assert run["billing_acknowledged_by_operator"] is True
            assert run["free_project_confirmed_by_operator"] is False
        with patch.object(s, "RUNS", runs / "failure"), patch.dict(s.os.environ, {"GEMINI_API_KEY": "synthetic-secret"}), patch.object(
                s, "request_once", return_value=({"http_status": 429, "api_error": "HTTP_429"}, b"quota")) as send:
            run = s.run_experiment(True)
            assert run["requests_sent"] == send.call_count == 1
            assert run["summary"]["counts"] == {"api_error": 1, "blocked": 3}
            assert all(r["weed_pct"] is None for r in run["results"])
        assert not any(b"synthetic-secret" in p.read_bytes() for p in runs.rglob("*") if p.is_file())
    contract = "Devuelve exclusivamente un objeto JSON"
    v1 = s.ROOT / "prompt-segmentation-v1.txt"
    v2 = s.ROOT / "prompt-segmentation-v2.txt"
    for path in (v1, v2):
        assert "{{" not in s.render_prompt(path, "soja")
    # v2 solo cambia la parte discriminante: el contrato debe seguir igual para comparar corridas.
    texts = [path.read_text(encoding="utf-8") for path in (v1, v2)]
    assert texts[0][texts[0].index(contract):] == texts[1][texts[1].index(contract):]
    assert "{{MORFOLOGIA_CULTIVO}}" in texts[1] and "trifolio" in s.render_prompt(v2, "soja")
    try:
        s.render_prompt(v2, "maiz")
    except ValueError:
        pass
    else:
        raise AssertionError("Un cultivo sin morfologia declarada debe fallar")
    print("OK: coordinates, union, denominator, zero/abstention, invalid polygons/JSON, IoU, exact paint, transport, free gate, four-request budget and prompt v1/v2 rendering. No network.")


if __name__ == "__main__":
    main()
