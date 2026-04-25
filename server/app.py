import json
import os
import time

from flask import Flask, jsonify, send_from_directory
from flask_sock import Sock

BASE_DIR      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DASHBOARD_DIR = os.path.join(BASE_DIR, 'dashboard')
DATA_DIR      = os.path.join(BASE_DIR, 'data')

LOG_FILES = {
    'vps': '/tmp/pidash_logs_vps.log',
    'pi5': '/tmp/pidash_logs_pi5.log',
}

BACKFILL_LINES = 80

app  = Flask(__name__, static_folder=None)
sock = Sock(app)

os.makedirs(DATA_DIR, exist_ok=True)


# ── Static ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(DASHBOARD_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(DASHBOARD_DIR, filename)


# ── REST ──────────────────────────────────────────────────────────────────────

@app.route('/api/builds')
def api_builds():
    path = os.path.join(DATA_DIR, 'builds.json')
    if not os.path.exists(path):
        return jsonify([])
    with open(path) as f:
        return jsonify(json.load(f))

@app.route('/api/verse')
def api_verse():
    path = os.path.join(DATA_DIR, 'verse.json')
    if not os.path.exists(path):
        return jsonify({'text': 'No verse cached yet.', 'reference': ''})
    with open(path) as f:
        return jsonify(json.load(f))


# ── WebSocket log tail ────────────────────────────────────────────────────────

@sock.route('/ws/logs/<host>')
def ws_logs(ws, host):
    if host not in LOG_FILES:
        ws.send(f'[unknown host: {host}]')
        return

    log_path = LOG_FILES[host]

    # wait up to 10s for log file to exist (log_streamer may still be starting)
    for _ in range(20):
        if os.path.exists(log_path):
            break
        time.sleep(0.5)
    else:
        ws.send(f'[log file not found: {log_path}]')
        return

    try:
        with open(log_path) as f:
            # backfill last N lines so screen isn't blank on connect
            all_lines = f.readlines()
            for line in all_lines[-BACKFILL_LINES:]:
                ws.send(line.rstrip('\n'))

            # tail: seek to end, stream new lines as they arrive
            f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    ws.send(line.rstrip('\n'))
                else:
                    time.sleep(0.1)
    except Exception:
        # client disconnected — exit cleanly
        return


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # threaded=True lets each WS connection run in its own thread
    app.run(host='0.0.0.0', port=5000, threaded=True)
