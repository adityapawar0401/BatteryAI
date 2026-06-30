from __future__ import annotations

import argparse

import uvicorn

from .app import startup_banner


def main() -> None:
    parser = argparse.ArgumentParser(description="BatteryAI loopback inference service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost"}:
        parser.error("BatteryAI binds to loopback only")
    print(startup_banner(args.host, args.port), flush=True)
    uvicorn.run("services.local_inference.app:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
