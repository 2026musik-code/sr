export const PYTHON_API_SCRIPT = `#!/data/data/com.termux/files/usr/bin/python3
from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os

app = Flask(__name__)
# Izinkan Origin dari website manapun agar bisa di remote dari browser
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "status": "online", 
        "message": "Termux API is Active!", 
        "instruction": "Masukkan IP ini ke dalam input URL di Web UI."
    })

@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({"status": "ok", "message": "Termux API is online!"})

@app.route('/api/execute', methods=['POST'])
def execute():
    data = request.json
    command = data.get('command', '')
    
    if not command:
        return jsonify({"error": "No command provided"}), 400
        
    try:
        # Jalankan command di Termux Shell
        result = subprocess.run(
            command, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=60
        )
        return jsonify({
            "status": "success" if result.returncode == 0 else "error",
            "output": result.stdout,
            "error": result.stderr,
            "code": result.returncode
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e), "output": ""}), 500

if __name__ == '__main__':
    print("\\033[0;32m╔══════════════════════════════════════╗\\033[0m")
    print("\\033[0;32m║      TERMUX WEB API - RUNNING        ║\\033[0m")
    print("\\033[0;32m╚══════════════════════════════════════╝\\033[0m")
    print("▶ Server REST API berjalan di latar...")
    print("▶ Buka dashboard web Anda dan koneksikan ke IP Termux ini.")
    print("▶ Tekan CTRL+C untuk mematikan API\\n")
    # Jalankan server
    app.run(host='0.0.0.0', port=5000)
`;
