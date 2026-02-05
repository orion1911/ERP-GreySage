"""
Simple HTTP server for testing greysage-dashboard
Serves static files from public/ and handles /api/process endpoint
"""
import os
import sys
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# Add api directory to path
api_dir = Path(__file__).parent / "api"
sys.path.insert(0, str(api_dir))

PORT = 3000


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve from public directory
        super().__init__(*args, directory=str(Path(__file__).parent / "public"), **kwargs)

    def do_GET(self):
        if self.path == "/api/process" or self.path.startswith("/api/process?"):
            self.handle_api()
        else:
            super().do_GET()

    def handle_api(self):
        import time
        start_time = time.time()

        try:
            import process

            # Use local Excel file for testing
            excel_path = Path(__file__).parent.parent / "MAKINGS.xlsx"
            if excel_path.exists():
                with open(excel_path, "rb") as f:
                    excel_bytes = f.read()
            else:
                raise FileNotFoundError("MAKINGS.xlsx not found")

            all_rows = process.process_all_sheets(excel_bytes)

            if not all_rows:
                response_data = {
                    "rows": [],
                    "client_summary": [],
                    "washer_summary": [],
                    "total_pcs": 0,
                    "total_making": 0,
                    "total_in_washing": 0,
                    "total_out_washing": 0,
                    "timestamp": __import__("datetime").datetime.now().isoformat(),
                    "processing_time": round(time.time() - start_time, 2),
                }
            else:
                import pandas as pd
                from datetime import datetime

                master = pd.DataFrame(all_rows)

                # Client summary
                client_summary = (
                    master.groupby("CLIENT", as_index=False, sort=False)
                    .agg({"MAKING": "sum", "IN_WASHING": "sum", "OUT_WASHING": "sum"})
                    .sort_values("MAKING", ascending=False)
                )
                client_summary["TOTAL"] = client_summary[
                    ["MAKING", "IN_WASHING", "OUT_WASHING"]
                ].sum(axis=1)

                # Washer summary
                washer_data = master[master["WASHING"].str.len() > 0]
                if not washer_data.empty:
                    washer_summary = (
                        washer_data.groupby("WASHING", as_index=False, sort=False)
                        .agg({"IN_WASHING": "sum", "OUT_WASHING": "sum"})
                        .rename(columns={"WASHING": "WASHER"})
                    )
                    # PENDING = items currently at washer (IN_WASHING represents items waiting to be completed)
                    washer_summary["PENDING"] = washer_summary["IN_WASHING"]
                    washer_summary["TOTAL"] = (
                        washer_summary["IN_WASHING"] + washer_summary["OUT_WASHING"]
                    )
                    washer_summary = washer_summary.sort_values("PENDING", ascending=False)
                else:
                    washer_summary = pd.DataFrame(
                        columns=["WASHER", "IN_WASHING", "OUT_WASHING", "PENDING", "TOTAL"]
                    )

                # Breakdown with LOT numbers
                breakdown = (
                    master.groupby(["CLIENT", "WASHING"], as_index=False, sort=False)
                    .agg(
                        {
                            "PCS": "sum",
                            "MAKING": "sum",
                            "IN_WASHING": "sum",
                            "OUT_WASHING": "sum",
                            "LOT_NO": lambda x: ", ".join(sorted(set(v for v in x if v))),
                        }
                    )
                )
                # Add lot count
                breakdown["LOT_COUNT"] = breakdown["LOT_NO"].apply(
                    lambda x: len(x.split(", ")) if x else 0
                )
                breakdown = breakdown.sort_values(["CLIENT", "PCS"], ascending=[True, False])

                response_data = {
                    "rows": breakdown.to_dict(orient="records"),
                    "client_summary": client_summary.to_dict(orient="records"),
                    "washer_summary": washer_summary.to_dict(orient="records"),
                    "total_pcs": sum(r["PCS"] for r in all_rows),
                    "total_making": sum(r["MAKING"] for r in all_rows),
                    "total_in_washing": sum(r["IN_WASHING"] for r in all_rows),
                    "total_out_washing": sum(r["OUT_WASHING"] for r in all_rows),
                    "timestamp": datetime.now().isoformat(),
                    "processing_time": round(time.time() - start_time, 2),
                }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


if __name__ == "__main__":
    print(f"Starting server on http://localhost:{PORT}")
    print(f"Open http://localhost:{PORT}/index.html to view dashboard")
    print("Press Ctrl+C to stop\n")

    server = HTTPServer(("localhost", PORT), DashboardHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        server.server_close()
