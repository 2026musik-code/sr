export const FIXED_BASH_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash

# ============================================
# APP ANALYZER & REQUEST INSPECTOR - TERMUX
# By: SuperNinja | Full DevTools Suite (GUI Edition)
# ============================================

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
CYAN='\\033[0;36m'
NC='\\033[0m'

check_install() {
  if ! command -v "\$1" &> /dev/null; then
    echo -e "\${YELLOW}[*] Package '\$1' belum terinstall. Menginstall (\$2) otomatis...\${NC}"
    pkg update -y > /dev/null 2>&1
    pkg install -y "\$2" || { echo -e "\${RED}[!] Gagal menginstall \$2\${NC}"; return 1; }
  fi
  return 0
}

check_pip() {
  python3 -c "import \$1" &>/dev/null || {
    echo -e "\${YELLOW}[*] Python module '\$1' belum terinstall. Menginstall (\$2) otomatis...\${NC}"
    pip install \$2 || { echo -e "\${RED}[!] Gagal menginstall \$2\${NC}"; return 1; }
  }
  return 0
}

# Pastikan dialog terinstall untuk tampilan GUI (Clickable)
check_install dialog dialog || exit 1

menu() {
  choice=\$(dialog --clear --backtitle "Termux DevTools Suite by SuperNinja" \\
    --title "[ MENU UTAMA ]" \\
    --cancel-label "Keluar" \\
    --menu "Silakan KLIK menu di bawah atau gunakan panah:" 16 60 9 \\
    "1" "Analisa Aplikasi (APK Info)" \\
    "2" "HTTP Request Inspector" \\
    "3" "Web Scraper" \\
    "4" "Network Scanner" \\
    "5" "Jalankan Aplikasi / Server" \\
    "6" "API Tester (cURL & HTTPx)" \\
    "7" "Monitor Traffic Real-time" \\
    "8" "SSL/TLS Inspector" \\
    "9" "Keluar" \\
    3>&1 1>&2 2>&3)
}

# ── FUNGSI 1: Analisa APK ──────────────────
analyze_apk() {
  apk_input=\$(dialog --clear --title "[ APK ANALYZER ]" --inputbox "Masukkan path APK (atau nama package):" 10 50 3>&1 1>&2 2>&3)
  [[ -z "\$apk_input" ]] && return
  
  clear
  if [[ -f "\$apk_input" ]]; then
    echo -e "\${BLUE}[*] Menganalisa APK: \$apk_input\${NC}"
    if command -v aapt &> /dev/null; then
      aapt dump badging "\$apk_input"
    else
      echo -e "\${YELLOW}[!] aapt tidak tersedia, menggunakan apktool...\${NC}"
      check_install apktool apktool || return
      apktool d "\$apk_input" -o /tmp/apk_output -f
      if [[ -f "/tmp/apk_output/AndroidManifest.xml" ]]; then
         cat /tmp/apk_output/AndroidManifest.xml
      fi
    fi
    echo -e "\\n\${YELLOW}[PERMISSIONS YANG DIMINTA:]\${NC}"
    unzip -p "\$apk_input" AndroidManifest.xml | strings | grep -i "permission"
  else
    echo -e "\${BLUE}[*] Menganalisa package: \$apk_input\${NC}"
    am dump "\$apk_input" 2>/dev/null || echo -e "\${RED}Gagal. Gunakan: adb shell dumpsys package \$apk_input\${NC}"
  fi
}

# ── FUNGSI 2: HTTP Request Inspector ──────
http_inspector() {
  check_install mitmproxy mitmproxy || return
  mitm_choice=\$(dialog --clear --title "[ HTTP REQUEST INSPECTOR ]" \\
    --menu "Pilih Mode mitmproxy:" 15 50 3 \\
    "1" "Interactive Mode" \\
    "2" "Browser UI (mitmweb)" \\
    "3" "Log ke file (mitmdump)" \\
    3>&1 1>&2 2>&3)
  [[ -z "\$mitm_choice" ]] && return
  
  clear
  case \$mitm_choice in
    1) mitmproxy --listen-port 8080 ;;
    2) 
       echo -e "\${YELLOW}Buka browser: http://localhost:8081\${NC}"
       mitmweb --listen-port 8080 --web-port 8081 
       ;;
    3) 
       out="/sdcard/traffic_\$(date +%Y%m%d_%H%M%S).mitm"
       echo -e "\${BLUE}Menyimpan log ke \$out\${NC}"
       mitmdump -w "\$out" --listen-port 8080 
       ;;
  esac
}

# ── FUNGSI 3: Web Scraper ──────────────────
web_scraper() {
  check_install python3 python || return
  check_pip bs4 "beautifulsoup4 requests" || return
  
  target_url=\$(dialog --clear --title "[ WEB SCRAPER ]" --inputbox "Masukkan URL target (cth: https://google.com):" 10 60 3>&1 1>&2 2>&3)
  [[ -z "\$target_url" ]] && return
  
  mode=\$(dialog --clear --title "[ MODE SCRAPING ]" --menu "Pilih Data yang Diambil:" 15 55 3 \\
    "1" "Basic HTML Info" \\
    "2" "Extract Semua Link" \\
    "3" "Extract Data via CSS" 3>&1 1>&2 2>&3)
  [[ -z "\$mode" ]] && return
  
  clear
  export TARGET_URL="\$target_url"
  export SCRAPE_MODE="\$mode"
  
  python3 << 'EOF'
import os
import requests
from bs4 import BeautifulSoup

url = os.environ.get("TARGET_URL")
mode = os.environ.get("SCRAPE_MODE")
headers = {"User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36"}

try:
    resp = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    if mode == "1":
        print(f"[TITLE]: {soup.title.string if soup.title else 'N/A'}")
        desc = soup.find("meta", {"name": "description"})
        if desc and "content" in desc.attrs:
            print(f"[META DESC]: {desc['content']}")
        print(f"[H1 Tags]: {[h.text.strip() for h in soup.find_all('h1')]}")
        
    elif mode == "2":
        links = [(a.text.strip(), a.get('href')) for a in soup.find_all('a', href=True)]
        for text, href in links[:30]:
            print(f"  📎 {text[:40]} -> {href}")
            
    elif mode == "3":
        selector = input("Masukkan CSS selector di terminal ini: ")
        elements = soup.select(selector)
        for el in elements:
            print(el.text.strip())
            
    print(f"\\n[✅] Status: {resp.status_code} | Size: {len(resp.content)} bytes")
    print("[🔑] Headers:")
    for k, v in list(resp.headers.items())[:5]:
        print(f"  {k}: {v}")
except Exception as e:
    print(f"[ERROR] {e}")
EOF
}

# ── FUNGSI 4: Network Scanner ──────────────
network_scanner() {
  check_install nmap nmap || return
  
  target=\$(dialog --clear --title "[ NETWORK SCANNER ]" --inputbox "Target IP/Domain/Range (e.g. 192.168.1.0/24):" 10 50 3>&1 1>&2 2>&3)
  [[ -z "\$target" ]] && return
  
  scan_type=\$(dialog --clear --title "[ TIPE SCAN ]" --menu "Pilih Mode:" 15 50 3 \\
    "1" "Quick Scan (-sn)" \\
    "2" "Port Scan (-p 1-1000)" \\
    "3" "Service Detection (-sV)" 3>&1 1>&2 2>&3)
  [[ -z "\$scan_type" ]] && return

  clear
  case \$scan_type in
    1) nmap -sn "\$target" ;;
    2) nmap -p 1-1000 "\$target" ;;
    3) nmap -sV --version-intensity 5 "\$target" ;;
  esac
}

# ── FUNGSI 5: Jalankan Aplikasi ────────────
run_application() {
  app_choice=\$(dialog --clear --title "[ JALANKAN APLIKASI ]" --menu "Pilih Lingkungan:" 15 50 4 \\
    "1" "Python Script" \\
    "2" "Node.js App" \\
    "3" "Flask/FastAPI/Django" \\
    "4" "Custom Command" 3>&1 1>&2 2>&3)
  [[ -z "\$app_choice" ]] && return
  
  clear
  case \$app_choice in
    1)
      check_install python3 python || return
      read -p "Path Python script: " script
      [[ -f "\$script" ]] && python3 "\$script" || echo -e "\${RED}File tidak ditemukan!\${NC}"
      ;;
    2)
      check_install node nodejs || return
      read -p "Path JS file: " jsfile
      [[ -f "\$jsfile" ]] && node "\$jsfile" || echo -e "\${RED}File tidak ditemukan!\${NC}"
      ;;
    3)
      check_install python3 python || return
      fw=\$(dialog --clear --title "[ PILIH FRAMEWORK ]" --menu "Pilihan:" 15 40 3 "1" "Flask" "2" "FastAPI" "3" "Django" 3>&1 1>&2 2>&3)
      [[ -z "\$fw" ]] && return
      clear
      case \$fw in
        1) check_pip flask flask || return; python3 -c "from flask import Flask; app=Flask(__name__); app.run(host='0.0.0.0',port=5000)" ;;
        2) check_pip fastapi "fastapi uvicorn" || return; python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 ;;
        3) check_pip django django || return; django-admin startproject myproject && cd myproject && python3 manage.py runserver 0.0.0.0:8000 ;;
      esac
      ;;
    4)
      read -p "Masukkan command: " cmd
      eval "\$cmd"
      ;;
  esac
}

# ── FUNGSI 6: API Tester ───────────────────
api_tester() {
  check_install python3 python || return
  check_pip httpx httpx || return

  api_url=\$(dialog --clear --title "[ API TESTER ]" --inputbox "Masukkan URL API:" 10 60 3>&1 1>&2 2>&3)
  [[ -z "\$api_url" ]] && return
  
  method_choice=\$(dialog --clear --title "[ API METHOD ]" --menu "Pilih Method:" 15 40 4 \\
    "1" "GET" "2" "POST" "3" "PUT" "4" "DELETE" 3>&1 1>&2 2>&3)
  [[ -z "\$method_choice" ]] && return
  
  clear
  case \$method_choice in
    1) METHOD="GET" ;; 2) METHOD="POST" ;; 3) METHOD="PUT" ;; 4) METHOD="DELETE" ;;
  esac
  
  read -p "Headers (JSON, opsional): " req_headers
  read -p "Body Data (JSON, opsional): " req_body
  
  export API_URL="\$api_url"
  export API_METHOD="\$METHOD"
  export API_HEADERS="\${req_headers:-{\}}"
  export API_BODY="\$req_body"

  python3 << 'EOF'
import os
import httpx
import json

url = os.environ.get("API_URL")
method = os.environ.get("API_METHOD")
headers_raw = os.environ.get("API_HEADERS", "{}")
body_raw = os.environ.get("API_BODY", "")

try:
    headers = json.loads(headers_raw) if headers_raw != "{}" else {}
except:
    print("[!] Gagal parsing JSON Headers. Abaikan.")
    headers = {}

content = body_raw if body_raw else None

try:
    with httpx.Client(follow_redirects=True) as client:
        resp = client.request(method=method, url=url, headers=headers, content=content)
        print(f"\\n[STATUS] {resp.status_code}")
        print(f"\\n[BODY]")
        try:
            print(json.dumps(resp.json(), indent=2))
        except:
            print(resp.text[:2000])
except Exception as e:
    print(f"[ERROR] Request Gagal: {e}")
EOF
}

# ── FUNGSI 7: Traffic Monitor ──────────────
traffic_monitor() {
  check_install tcpdump tcpdump || return
  check_install tsu tsu || return
  
  iface=\$(dialog --clear --title "[ TRAFFIC MONITOR ]" --inputbox "Interface (Kosongkan utk default wlan0):" 10 40 3>&1 1>&2 2>&3)
  iface=\${iface:-wlan0}
  
  clear
  echo -e "\${GREEN}[REAL-TIME TRAFFIC MONITOR]\${NC}"
  echo "Monitoring interface \$iface... (CTRL+C untuk berhenti)"
  
  if command -v sudo >/dev/null 2>&1; then
      sudo tcpdump -i "\$iface" -n -v 2>/dev/null
  else
      tsu -c "tcpdump -i \$iface -n -v" || echo -e "\${RED}[!] Gagal. Butuh akses root (tsu).\${NC}"
  fi
}

# ── FUNGSI 8: SSL Inspector ────────────────
ssl_inspector() {
  check_install openssl openssl-tool || return
  
  host=\$(dialog --clear --title "[ SSL/TLS INSPECTOR ]" --inputbox "Hostname (cth: google.com):" 10 50 3>&1 1>&2 2>&3)
  [[ -z "\$host" ]] && return
  
  clear
  port=443
  
  echo -e "\\n\${BLUE}[SSL Certificate Info]\${NC}"
  echo | openssl s_client -connect "\$host:\$port" -servername "\$host" 2>/dev/null | openssl x509 -noout -text | grep -E "(Subject:|Issuer:|Not Before|Not After|DNS:)"
  
  echo -e "\\n\${BLUE}[TLS Protocol & Cipher]\${NC}"
  check_install nmap nmap || return
  nmap --script ssl-enum-ciphers -p "\$port" "\$host" 2>/dev/null || \\
  openssl s_client -connect "\$host:\$port" -servername "\$host" 2>/dev/null | grep -E "(Protocol|Cipher)"
}

# ── MAIN LOOP ──────────────────────────────
while true; do
  menu
  [[ -z "\$choice" ]] && choice="9" # Jika user klik cancel
  
  if [[ "\$choice" == "9" ]]; then
     clear
     echo -e "\${RED}Keluar dari DevTools...\${NC}"
     exit 0
  fi
  
  clear
  # Jalankan fungsi
  case \$choice in
    1) analyze_apk ;;
    2) http_inspector ;;
    3) web_scraper ;;
    4) network_scanner ;;
    5) run_application ;;
    6) api_tester ;;
    7) traffic_monitor ;;
    8) ssl_inspector ;;
  esac
  
  echo ""
  read -p "Tekan ENTER untuk kembali ke menu utama..."
done
`;
