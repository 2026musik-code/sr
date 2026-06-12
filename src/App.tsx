import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import { 
  Terminal, Server, Globe, ShieldAlert, Cpu, 
  Wifi, Play, CheckCircle2, XCircle, Code, Copy, 
  Activity, Settings, Info, AlertTriangle,
  Folder, HardDrive, Smartphone, List, Bookmark, Trash2, FileText,
  Battery, Clipboard as ClipboardIcon, Bell, Volume2, MessageSquare, Zap
} from 'lucide-react';

class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-slate-950 text-white min-h-screen flex flex-col items-center justify-center">
          <AlertTriangle className="h-16 w-16 text-rose-500 mb-4" />
          <h1 className="text-xl font-bold mb-2">Terjadi Kesalahan (App Crashed)</h1>
          <p className="text-slate-400 mb-4 text-center max-w-md">Silakan refresh halaman atau periksa console browser.</p>
          <pre className="text-xs bg-slate-900 p-4 rounded text-rose-400 overflow-auto max-w-full">
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded font-medium text-sm transition text-white">Refresh Halaman</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const fallbackCopyTextToClipboard = (text: string) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Prevent scrolling to bottom of page in MS Edge.
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }
  document.body.removeChild(textArea);
};

const copyToClipboard = async (text: string) => {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Async: Could not copy text: ', err);
    fallbackCopyTextToClipboard(text);
  }
};

const TERMUX_AGENT_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash
clear
echo -e "\\e[32m[+] Memulai Setup Termux Agent...\\e[0m"
pkg update -y > /dev/null 2>&1
pkg install -y python cloudflared > /dev/null 2>&1
pip install flask flask-cors requests > /dev/null 2>&1

cat << 'EOF' > termux_api.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess

app = Flask(__name__)
CORS(app)

@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({"status": "ok"})

@app.route('/api/execute', methods=['POST'])
def execute():
    try:
        cmd = request.json.get('command', '')
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        return jsonify({"output": res.stdout, "error": res.stderr})
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
EOF

killall python > /dev/null 2>&1
python termux_api.py &
sleep 3

echo -e "\\e[34m===================================================\\e[0m"
echo -e "\\e[32m[!] TUNGGU LOG CLOUDFLARE MUNCUL DI BAWAH...\\e[0m"
echo -e "\\e[33m[!] CARI LINK HTTPS BERAWALAN https:// ... DAN BEREKSTENSI .trycloudflare.com\\e[0m"
echo -e "\\e[33m[!] COPY LINK TERSEBUT DAN PASTE KE WEB UI\\e[0m"
echo -e "\\e[34m===================================================\\e[0m"
cloudflared tunnel --url http://127.0.0.1:5000
`;

export default function App() {
  const [activeTab, setActiveTab] = useState('setup');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('termux_api_url') || '');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string>('');

  // Form states
  const [nmapTarget, setNmapTarget] = useState('127.0.0.1');
  const [apkPath, setApkPath] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');

  // 5 New Features States
  const [filePath, setFilePath] = useState('/sdcard');
  const [processId, setProcessId] = useState('');
  const [customCmd, setCustomCmd] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [snippets, setSnippets] = useState<{title: string, cmd: string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('termux_snippets') || '[]'); } catch { return []; }
  });
  
  const [fileList, setFileList] = useState<{name: string, isDir: boolean}[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [currentPathDisplay, setCurrentPathDisplay] = useState('/sdcard');

  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceData, setDeviceData] = useState<{
    battery: any, wifi: any, clipboard: string | null
  }>({ battery: null, wifi: null, clipboard: null });
  const [toastMsg, setToastMsg] = useState('Halo dari TermuxWeb!');

  const [sysLoading, setSysLoading] = useState(false);
  const [sysData, setSysData] = useState<{
    storage: { total: string, used: string, free: string, percent: number } | null,
    ram: { total: number, used: number, percent: number } | null,
    uptime: string | null,
    top: { pid: string, cpu: string, mem: string, cmd: string }[] | null
  }>({ storage: null, ram: null, uptime: null, top: null });

  const loadSystemInfo = async () => {
    if (!isConnected || !apiUrl) return;
    setSysLoading(true);
    try {
      const url = new URL(apiUrl);
      const cmd = `
echo "_STORAGE_"
df -h | grep -m 1 -e "/data$" -e "/storage/emulated/0" | awk '{print $2"|"$3"|"$4"|"$5}'
echo "_RAM_"
free -m 2>/dev/null | awk '/^Mem:/ {print $2"|"$3}'
echo "_UPTIME_"
uptime -p 2>/dev/null || uptime
echo "_TOP_"
ps aux 2>/dev/null | awk 'NR>1 {print $2"|"$3"|"$4"|"$11}' | sort -t'|' -k2 -nr | head -n 8
      `;
      const res = await fetch(`${url.origin}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!data.error) {
         const out = data.output;
         const sections = out.split(/_(STORAGE|RAM|UPTIME|TOP)_/).map((s: string) => s.trim());
         const newSysData = {...sysData};
         
         const storageData = sections[sections.indexOf('STORAGE') + 1];
         if (storageData) {
            const p = storageData.split('|');
            if (p.length >= 4) {
               newSysData.storage = {
                  total: p[0], used: p[1], free: p[2], percent: parseInt(p[3].replace('%','')) || 0
               };
            }
         }
         
         const ramData = sections[sections.indexOf('RAM') + 1];
         if (ramData) {
            const p = ramData.split('|');
            if (p.length >= 2) {
               const total = parseInt(p[0]);
               const used = parseInt(p[1]);
               newSysData.ram = { total, used, percent: Math.round((used/total)*100) || 0 };
            }
         }
         
         const uptimeData = sections[sections.indexOf('UPTIME') + 1];
         if (uptimeData) {
             newSysData.uptime = uptimeData;
         }
         
         const topData = sections[sections.indexOf('TOP') + 1];
         if (topData) {
             const lines = topData.split('\n').filter(Boolean);
             newSysData.top = lines.map((l: string) => {
                 const p = l.split('|');
                 return { pid: p[0], cpu: p[1], mem: p[2], cmd: p[3] };
             });
         }
         
         setSysData(newSysData);
      }
    } catch (e) {
      console.error("Sys Info Error:", e);
    }
    setSysLoading(false);
  };

  const loadDeviceInfo = async () => {
    if (!isConnected || !apiUrl) return;
    setDeviceLoading(true);
    try {
      const url = new URL(apiUrl);
      const cmd = `
echo "_BATTERY_"
timeout 5 termux-battery-status 2>&1
echo "_WIFI_"
timeout 5 termux-wifi-connectioninfo 2>&1
echo "_CLIPBOARD_"
timeout 3 termux-clipboard-get 2>&1
      `;
      const res = await fetch(`${url.origin}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!data.error) {
         const out = data.output;
         const sections = out.split(/_(BATTERY|WIFI|CLIPBOARD)_/).map((s: string) => s.trim());
         const newDeviceData = {...deviceData};
         
         const parseJsonSafe = (str: string) => {
           if(!str) return null;
           const match = str.match(/\{[\s\S]*\}/);
           if (match) {
             try { return JSON.parse(match[0]); } catch(e) { return { _rawError: str }; }
           }
           return { _rawError: str };
         };

         const batSection = sections[sections.indexOf('BATTERY') + 1];
         if (batSection) {
           const parsed = parseJsonSafe(batSection);
           newDeviceData.battery = parsed || { _rawError: "Kosong" };
         }
         
         const wifiSection = sections[sections.indexOf('WIFI') + 1];
         if (wifiSection) {
           const parsed = parseJsonSafe(wifiSection);
           newDeviceData.wifi = parsed || { _rawError: "Kosong" };
         }
         
         const clipSection = sections[sections.indexOf('CLIPBOARD') + 1];
         if (clipSection !== undefined) {
           const cleaned = clipSection.trim();
           newDeviceData.clipboard = cleaned.length > 0 ? cleaned : null;
           if (cleaned.includes("command not found") || cleaned.includes("timeout")) {
               newDeviceData.clipboard = "< Output Gagal (Pastikan termux-api terinstall) >\\n" + cleaned;
           }
         }
         
         setDeviceData(newDeviceData);
      }
    } catch (e) {
      console.error("Device Info Error:", e);
    }
    setDeviceLoading(false);
  };

  useEffect(() => {
    localStorage.setItem('termux_snippets', JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    if (activeTab === 'system' && isConnected && !sysData.storage) {
      loadSystemInfo();
    }
    if (activeTab === 'device' && isConnected && !deviceData.battery) {
      loadDeviceInfo();
    }
  }, [activeTab, isConnected]);

  const [copied, setCopied] = useState(false);
  const [b64OneLiner, setB64OneLiner] = useState('');

  useEffect(() => {
    try {
      const b64 = btoa(TERMUX_AGENT_SCRIPT);
      setB64OneLiner(`echo "${b64}" | base64 -d > agent.sh && bash agent.sh`);
    } catch(e) {
      console.error(e);
    }
    
    // Auto restore connection if URL exists in localStorage
    const savedUrl = localStorage.getItem('termux_api_url');
    if (savedUrl) {
      verifyConnection(savedUrl);
    }
  }, []);

  const verifyConnection = async (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      const res = await fetch(`${url.origin}/api/ping`);
      if (res.ok) setIsConnected(true);
      else setIsConnected(false);
    } catch (e) {
      setIsConnected(false);
    }
  };

  const checkConnection = async () => {
    if (!apiUrl.startsWith('http')) {
      alert("Masukkan URL yang valid (harus diawali https://)");
      return;
    }
    setLoading(true);
    try {
      const url = new URL(apiUrl);
      const res = await fetch(`${url.origin}/api/ping`);
      if (res.ok) {
        setIsConnected(true);
        localStorage.setItem('termux_api_url', apiUrl);
      } else {
        setIsConnected(false);
      }
    } catch (e) {
      setIsConnected(false);
    }
    setLoading(false);
  };

  const executeCommand = async (cmd: string, title: string) => {
    if (!isConnected || !apiUrl) {
      alert("Hubungkan ke Termux Agent terlebih dahulu di menu Setup!");
      return;
    }
    
    setTerminalOutput(`> Executing: ${title}\n> Command: ${cmd}\n\nLoading...`);
    setActiveTab('terminal');

    try {
      const url = new URL(apiUrl);
      const res = await fetch(`${url.origin}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      
      const data = await res.json();
      const errorStr = data.error ? "[ERROR]\n" + data.error : "";
      setTerminalOutput(`> Executing: ${title}\n> Command: ${cmd}\n\n${data.output || ''}\n${errorStr}`);
    } catch (e: any) {
      setTerminalOutput(`> Failed to send command to Termux.\n> Error: ${e.message}`);
    }
  };

  const executeSilentCommand = async (cmd: string) => {
    if (!isConnected || !apiUrl) return;
    try {
      const url = new URL(apiUrl);
      await fetch(`${url.origin}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
    } catch (e) {
      console.error("Silent Exec Error:", e);
    }
  };

  const loadDirectory = async (targetPath: string) => {
    if (!isConnected || !apiUrl) return;
    setFileLoading(true);
    setCurrentPathDisplay(targetPath);
    setFilePath(targetPath);

    try {
      const url = new URL(apiUrl);
      const res = await fetch(`${url.origin}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `ls -1pa "${targetPath}"` })
      });
      const data = await res.json();
      if (!data.error) {
        const lines = data.output.split('\n').filter((l:string) => l.trim().length > 0 && l !== './' && l !== '../');
        const parsedList = lines.map((line: string) => {
          const isDir = line.endsWith('/');
          const name = isDir ? line.slice(0, -1) : line;
          return { name, isDir };
        });
        
        parsedList.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setFileList(parsedList);
      } else {
         setTerminalOutput(`> Error opening ${targetPath}\n${data.error}`);
         setActiveTab('terminal');
      }
    } catch (e: any) {
      console.error("Load directory fail", e);
    }
    setFileLoading(false);
  };

  const copyScript = async () => {
    await copyToClipboard(b64OneLiner);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Terminal className="text-emerald-400 h-6 w-6" />
          <h1 className="font-bold text-white tracking-widest text-base">TERMUXWEB</h1>
        </div>
        
        <nav className="p-4 flex-1 space-y-1 overflow-y-auto">
          <MenuBtn icon={<Settings />} id="setup" label="Setup & Koneksi" active={activeTab} set={setActiveTab} />
          
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">5 Fitur Baru</p>
          </div>
          <MenuBtn icon={<Folder />} id="files" label="File Manager" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<HardDrive />} id="system" label="System Monitor" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<Smartphone />} id="device" label="Termux API Control" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<List />} id="processes" label="Process Manager" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<Bookmark />} id="snippets" label="Custom Snippets" active={activeTab} set={setActiveTab} />

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lanjutan</p>
          </div>
          <MenuBtn icon={<Wifi />} id="network" label="Network Scanner" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<Globe />} id="scraper" label="Web Scraper" active={activeTab} set={setActiveTab} />
          <MenuBtn icon={<Cpu />} id="apk" label="APK Analyzer" active={activeTab} set={setActiveTab} />
          
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Output</p>
          </div>
          <MenuBtn icon={<Activity />} id="terminal" label="Terminal Output" active={activeTab} set={setActiveTab} />
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 text-sm">
            {isConnected === true && <><CheckCircle2 className="h-4 w-4 text-emerald-500"/> <span className="text-emerald-500 font-medium">Agent Connected</span></>}
            {isConnected === false && <><XCircle className="h-4 w-4 text-rose-500"/> <span className="text-rose-500 font-medium">Agent Offline</span></>}
            {isConnected === null && <><div className="h-2 w-2 rounded-full bg-slate-600 m-1"/> <span className="text-slate-500">Not Checked</span></>}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden bg-slate-900 border-b border-slate-800 flex flex-col shrink-0">
          <div className="p-2.5 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2 px-1">
              <Terminal className="text-emerald-400 h-4 w-4" />
              <span className="font-bold text-white text-[13px] tracking-wide">TERMUXWEB</span>
            </div>
          </div>
          <div className="flex overflow-x-auto whitespace-nowrap p-2 gap-2 [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setActiveTab('setup')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${activeTab === 'setup' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>Setup</button>
            <button onClick={() => setActiveTab('files')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'files' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Folder className="w-3 h-3"/> Files</button>
            <button onClick={() => setActiveTab('system')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'system' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><HardDrive className="w-3 h-3"/> System</button>
            <button onClick={() => setActiveTab('device')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'device' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Smartphone className="w-3 h-3"/> Device</button>
            <button onClick={() => setActiveTab('processes')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'processes' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><List className="w-3 h-3"/> Processes</button>
            <button onClick={() => setActiveTab('snippets')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'snippets' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Bookmark className="w-3 h-3"/> Snippets</button>
            <button onClick={() => setActiveTab('network')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'network' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Wifi className="w-3 h-3"/> Scanner</button>
            <button onClick={() => setActiveTab('scraper')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'scraper' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Globe className="w-3 h-3"/> Scraper</button>
            <button onClick={() => setActiveTab('apk')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'apk' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Cpu className="w-3 h-3"/> APK</button>
            <button onClick={() => setActiveTab('terminal')} className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors gap-1.5 flex items-center ${activeTab === 'terminal' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Activity className="w-3 h-3"/> Terminal</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* SETUP TAB */}
            {activeTab === 'setup' && (
              <div className="space-y-6 fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                    <Terminal className="text-emerald-400 w-6 h-6" /> Setup & Koneksi
                  </h2>
                  <p className="text-slate-400 text-sm">Jalankan script instalasi otomatis di ponsel/Termux Anda. Sistem akan membuka Cloudflare tunnel sehingga UI ini dapat terhubung dengan mulus.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-white flex items-center gap-2"><Terminal className="w-5 h-5 text-emerald-400"/> 1. Copy-Paste Script Termux</h3>
                    <div className="text-sm text-slate-400">
                      <p>Copy script panjang di bawah ini (sudah dikodekan ke Base64 agar tidak perlu memakai jaringan/curl jika error), lalu paste dan Enter di Termux:</p>
                    </div>

                    
                    <div className="bg-black/50 rounded-xl border border-slate-800 overflow-hidden relative">
                      <button onClick={copyScript} className="absolute top-2 right-2 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-2 text-white shadow">
                        {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                        <span>{copied ? 'Copied' : 'Copy Script'}</span>
                      </button>
                      <pre className="p-4 pt-12 text-[10px] sm:text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                        {b64OneLiner || 'Loading...'}
                      </pre>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-white flex items-center gap-2"><Globe className="w-5 h-5 text-blue-400"/> 2. Masukkan URL Cloudflare</h3>
                    <div className="text-sm text-slate-400">
                      <p>Setelah script di samping berjalan, perhatikan Log Termux. Anda akan menemukan link acak dengan format <code className="text-emerald-400 font-mono">https://xxxxxx.trycloudflare.com</code>.</p>
                      <p className="mt-2 text-xs text-amber-500">Mungkin Anda perlu menunggu 5-10 detik agar link Cloudflare tsb muncul.</p>
                    </div>
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value.trim())}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-slate-200"
                        placeholder="https://xxxxx.trycloudflare.com"
                      />
                      <button 
                        onClick={checkConnection}
                        disabled={loading || !apiUrl}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? <Activity className="w-4 h-4 animate-spin"/> : 'Connect to Termux'}
                      </button>
                    </div>

                    {isConnected === true && (
                      <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="h-5 w-5 shrink-0"/> <span>Berhasil Terhubung ke Termux!</span>
                      </div>
                    )}
                    {isConnected === false && (
                      <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg flex items-start gap-2 text-sm font-medium">
                        <XCircle className="h-5 w-5 shrink-0 mt-0.5"/> <span>Gagal. Pastikan URL Cloudflare tertulis benar tanpa spasi, dan Termux tidak error.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* FILE MANAGER TAB */}
            {activeTab === 'files' && (
              <div className="space-y-6 fade-in h-[calc(100vh-140px)] flex flex-col">
                <Header title="File Manager" desc="Jelajahi file Termux (Pastikan sudah izinkan akses storage: termux-setup-storage)" icon={<Folder className="text-yellow-400"/>} />
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex-1 flex flex-col min-h-0">
                  <div className="p-3 border-b border-slate-800 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2">
                       <button onClick={() => loadDirectory('/sdcard')} className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded text-slate-300 flex-1 sm:flex-none">/sdcard</button>
                       <button onClick={() => loadDirectory('/data/data/com.termux/files/home')} className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded text-slate-300 flex-1 sm:flex-none">Home (~)</button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadDirectory(filePath)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => loadDirectory(filePath)} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer">
                          Load
                        </button>
                        <button 
                          onClick={() => {
                             let parent = currentPathDisplay.split('/').filter(Boolean).slice(0, -1).join('/');
                             parent = parent ? `/${parent}` : '/';
                             loadDirectory(parent);
                          }} 
                          className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm transition cursor-pointer">
                          Up
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2">
                    {fileLoading ? (
                      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                        <Activity className="w-5 h-5 animate-spin mr-2"/> Memuat direktori...
                      </div>
                    ) : (
                      fileList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                           <div className="text-slate-500 text-sm mb-2">Folder kosong, akses ditolak, atau path tidak valid.</div>
                           {(currentPathDisplay.includes('sdcard') || currentPathDisplay === '/') && (
                             <button onClick={() => executeCommand('termux-setup-storage', 'Setup Storage')} className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-yellow-400 px-4 py-2 rounded">
                               Jalankan termux-setup-storage (Lalu klik Izinkan di HP)
                             </button>
                           )}
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {fileList.map((f, i) => (
                            <li key={i} className="group flex items-center justify-between p-2.5 hover:bg-slate-800/50 rounded-lg cursor-pointer transition"
                                onClick={() => {
                                   if(f.isDir) {
                                     const basePath = currentPathDisplay === '/' ? '' : currentPathDisplay;
                                     const newPath = `${basePath}/${f.name}`.replace(/\/\//g, '/');
                                     loadDirectory(newPath);
                                   }
                                }}>
                              <div className="flex items-center gap-3 overflow-hidden">
                                {f.isDir ? <Folder fill="currentColor" className="w-5 h-5 text-yellow-500 shrink-0"/> : <FileText className="w-5 h-5 text-slate-400 shrink-0"/>}
                                <span className={`text-sm truncate ${f.isDir ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>{f.name}</span>
                              </div>
                              <div className="flex gap-2">
                                 {!f.isDir && <button onClick={(e) => { e.stopPropagation(); executeCommand(`cat "${currentPathDisplay}/${f.name}"`, 'Read File'); }} className="pr-3 text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition">Baca</button>}
                                 <button onClick={(e) => { e.stopPropagation(); executeCommand(`rm -rf "${currentPathDisplay}/${f.name}"`, 'Delete'); }} className="pr-3 text-xs text-rose-500 opacity-0 group-hover:opacity-100 transition">Hapus</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SYSTEM MONITOR TAB */}
            {activeTab === 'system' && (
              <div className="space-y-6 fade-in">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-xl">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><HardDrive className="text-cyan-400 w-5 h-5"/> System Monitor</h2>
                    <p className="text-sm text-slate-400 mt-1">Statistik Perangkat Real-time</p>
                  </div>
                  <button onClick={loadSystemInfo} disabled={sysLoading} className="bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm">
                    <Activity className={`w-4 h-4 ${sysLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Data</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Storage Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                     <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><HardDrive className="w-4 h-4 text-cyan-400" /> Internal Storage (/data)</h3>
                     {sysData.storage ? (
                       <div className="space-y-3">
                         <div className="flex justify-between text-xs font-medium text-slate-300">
                           <span>Terpakai: {sysData.storage.used}</span>
                           <span>Total: {sysData.storage.total}</span>
                         </div>
                         <div className="w-full bg-slate-950 rounded-full h-3.5 overflow-hidden border border-slate-800">
                           <div className="bg-cyan-500 h-full rounded-full transition-all duration-500" style={{ width: `${sysData.storage.percent}%` }}></div>
                         </div>
                         <div className="text-xs text-right text-slate-500">Sisa {sysData.storage.free} ({100 - sysData.storage.percent}% free)</div>
                       </div>
                     ) : <div className="text-sm text-slate-500 py-4 text-center">Memuat data storage...</div>}
                  </div>
                  
                  {/* RAM Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                     <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-400" /> Memory (RAM)</h3>
                     {sysData.ram ? (
                       <div className="space-y-3">
                         <div className="flex justify-between text-xs font-medium text-slate-300">
                           <span>Terpakai: {(sysData.ram.used / 1024).toFixed(1)} GB</span>
                           <span>Total: {(sysData.ram.total / 1024).toFixed(1)} GB</span>
                         </div>
                         <div className="w-full bg-slate-950 rounded-full h-3.5 overflow-hidden border border-slate-800">
                           <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${sysData.ram.percent}%` }}></div>
                         </div>
                         <div className="text-xs text-right text-slate-500">{sysData.ram.percent}% Used</div>
                       </div>
                     ) : <div className="text-sm text-slate-500 py-4 text-center">Memuat data RAM...</div>}
                  </div>
                </div>

                {/* Uptime & Top */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-900/50">
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><List className="w-4 h-4 text-orange-400" /> Top Processes</h3>
                    <div className="text-xs bg-slate-950 px-3 py-1.5 rounded-md text-slate-300 border border-slate-800">
                      Uptime: <span className="text-emerald-400 font-medium">{sysData.uptime || '...'}</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[400px]">
                      <thead>
                        <tr className="bg-slate-950/50 text-slate-500 text-xs border-b border-slate-800">
                          <th className="font-medium p-3.5 whitespace-nowrap">PID</th>
                          <th className="font-medium p-3.5 w-full">PROCESS COMMAND</th>
                          <th className="font-medium p-3.5 text-right whitespace-nowrap">CPU %</th>
                          <th className="font-medium p-3.5 text-right whitespace-nowrap">MEM %</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {sysData.top && sysData.top.length > 0 ? sysData.top.map((p, i) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/80 transition-colors">
                            <td className="p-3.5 text-slate-500 font-mono text-xs">{p.pid}</td>
                            <td className="p-3.5 text-slate-300">
                               <div className="max-w-[200px] sm:max-w-xs md:max-w-md lg:max-w-lg truncate">{p.cmd}</div>
                            </td>
                            <td className="p-3.5 text-orange-400 font-medium text-right font-mono text-xs">{p.cpu}%</td>
                            <td className="p-3.5 text-emerald-400 font-medium text-right font-mono text-xs">{p.mem}%</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">Memuat daftar proses aktif...</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TERMUX API TAB */}
            {activeTab === 'device' && (
              <div className="space-y-6 fade-in">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-xl">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><Smartphone className="text-pink-400 w-5 h-5"/> Termux API Control</h2>
                    <p className="text-sm text-slate-400 mt-1">Status baterai, clipboard, dan kontrol hardware.</p>
                  </div>
                  <button onClick={loadDeviceInfo} disabled={deviceLoading} className="bg-pink-600/20 hover:bg-pink-600 text-pink-400 hover:text-white px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm">
                    <Activity className={`w-4 h-4 ${deviceLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Data</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Baterai Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Battery className="w-4 h-4 text-emerald-400" /> Baterai HP</h3>
                    {deviceData.battery ? (
                      deviceData.battery._rawError ? (
                        <div className="text-xs text-rose-400 p-3 bg-slate-950 rounded-lg border border-slate-800 whitespace-pre-wrap flex-1">
                           <span className="font-semibold text-rose-300">Gagal Mengambil Data:</span><br/>
                           {deviceData.battery._rawError.substring(0, 150)}{deviceData.battery._rawError.length > 150 ? '...' : ''}
                           <div className="mt-3 text-slate-400 font-sans">
                             Pastikan aplikasi <b>Termux:API</b> terinstall, dan jalankan: <br/>
                             <code className="text-emerald-400 select-all block mt-1">pkg install termux-api</code>
                           </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                           <div className="flex items-end gap-3">
                             <span className="text-3xl font-bold text-white">{deviceData.battery.percentage}%</span>
                             <span className="text-sm text-slate-400 pb-1 uppercase">{deviceData.battery.status}</span>
                           </div>
                           <div className="flex justify-between text-xs text-slate-400">
                             <span>Suhu: {deviceData.battery.temperature}°C</span>
                             <span>Health: {deviceData.battery.health}</span>
                             <span>Power: {deviceData.battery.plugged}</span>
                           </div>
                           <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                             <div className={`h-full rounded-full transition-all duration-500 ${deviceData.battery.percentage > 20 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${deviceData.battery.percentage}%` }}></div>
                           </div>
                        </div>
                      )
                    ) : <div className="text-sm text-slate-500 py-2">Tekan Refresh Data untuk memuat.</div>}
                  </div>

                  {/* Clipboard Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col min-h-0">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><ClipboardIcon className="w-4 h-4 text-amber-400" /> Clipboard Saat Ini</h3>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 flex-1 overflow-y-auto whitespace-pre-wrap min-h-[100px]">
                      {deviceData.clipboard !== null ? (deviceData.clipboard || '< Clipboard Kosong >') : 'Tekan Refresh Data...'}
                    </div>
                  </div>
                </div>

                {/* API Actions */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-pink-400" /> Quick Device Actions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="flex gap-2">
                        <input type="text" value={toastMsg} onChange={(e) => setToastMsg(e.target.value)} placeholder="Teks notif..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none"/>
                        <button onClick={() => executeSilentCommand(`termux-toast "${toastMsg}"`)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-1.5"><MessageSquare className="w-4 h-4"/> Toast</button>
                     </div>
                     <div className="flex gap-2">
                        <button onClick={() => executeSilentCommand(`termux-vibrate -d 500`)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2"><Bell className="w-4 h-4"/> Getar</button>
                        <button onClick={() => executeSilentCommand(`termux-torch on`)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2"><Zap className="w-4 h-4"/> Senter ON</button>
                        <button onClick={() => executeSilentCommand(`termux-torch off`)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm transition text-center">OFF</button>
                     </div>
                     <div className="flex gap-2 sm:col-span-2">
                        <input type="text" id="ttsInput" placeholder="Teks untuk diucapkan HP..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none"/>
                        <button onClick={() => {
                          const val = (document.getElementById('ttsInput') as HTMLInputElement).value;
                          if(val) executeSilentCommand(`termux-tts-speak "${val}"`);
                        }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2"><Volume2 className="w-4 h-4"/> Ucapkan Suara</button>
                     </div>
                  </div>
                </div>
              </div>
            )}

            {/* PROCESS MANAGER TAB */}
            {activeTab === 'processes' && (
              <div className="space-y-6 fade-in">
                <Header title="Process Manager" desc="Manajemen proses background" icon={<List className="text-orange-400"/>} />
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="grid grid-cols-1 gap-3">
                    <ActionBtn onClick={() => executeCommand(`ps aux`, 'List All Processes')} label="1. Tampilkan Semua Proses (ps aux)" />
                  </div>
                  <div className="mt-6 border-t border-slate-800 pt-5">
                    <label className="block text-sm text-slate-400 mb-1.5">Matikan Proses (Kill PID)</label>
                    <div className="flex gap-2">
                       <input 
                        type="text" value={processId} onChange={(e) => setProcessId(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="Masukkan PID (contoh: 15432)"
                      />
                      <button onClick={() => executeCommand(`kill -9 ${processId}`, `Kill ${processId}`)} className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg font-medium transition">Kill</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CUSTOM SNIPPETS TAB */}
            {activeTab === 'snippets' && (
              <div className="space-y-6 fade-in">
                <Header title="Custom Snippets" desc="Simpan perintah bash yang sering digunakan" icon={<Bookmark className="text-violet-400"/>} />
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="space-y-3 border-b border-slate-800 pb-5">
                     <input 
                        type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none"
                        placeholder="Nama/Judul Snippet (contoh: Auto Update)"
                      />
                      <input 
                        type="text" value={customCmd} onChange={(e) => setCustomCmd(e.target.value)}
                        className="w-full font-mono bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-emerald-400 focus:outline-none"
                        placeholder="Perintah Bash (contoh: apt update && apt upgrade -y)"
                      />
                      <button 
                         onClick={() => {
                           if(customTitle && customCmd) {
                             setSnippets([...snippets, {title: customTitle, cmd: customCmd}]);
                             setCustomTitle(''); setCustomCmd('');
                           }
                         }}
                         className="w-full bg-violet-600 hover:bg-violet-500 text-white px-4 py-2.5 rounded-lg font-medium transition"
                      >Simpan Snippet Baru</button>
                  </div>
                  
                  <div className="space-y-3">
                    {snippets.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Belum ada snippet tersimpan.</p>}
                    {snippets.map((snip, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                         <div className="flex-1 overflow-hidden">
                           <h4 className="font-medium text-slate-200 text-sm truncate">{snip.title}</h4>
                           <p className="font-mono text-emerald-500/70 text-xs truncate mt-1">{snip.cmd}</p>
                         </div>
                         <div className="flex items-center gap-2">
                           <button onClick={() => executeCommand(snip.cmd, snip.title)} className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-3 py-1.5 rounded transition text-sm flex items-center gap-2"><Play className="w-3 h-3"/> Run</button>
                           <button onClick={() => setSnippets(snippets.filter((_, i) => i !== idx))} className="bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white px-3 py-1.5 rounded transition"><Trash2 className="w-4 h-4"/></button>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* NETWORK SCANNER TAB */}
            {activeTab === 'network' && (
              <div className="space-y-6 fade-in">
                <Header title="Network Scanner" desc="Jalankan NMAP dari Termux" icon={<Wifi className="text-blue-400"/>} />
                
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Target IP / Domain</label>
                    <input 
                      type="text" value={nmapTarget} onChange={(e) => setNmapTarget(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="contoh: 192.168.1.0/24 atau google.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <ActionBtn onClick={() => executeCommand(`nmap -sn ${nmapTarget}`, 'Quick Ping Scan')} label="1. Quick Ping Scan" />
                    <ActionBtn onClick={() => executeCommand(`nmap -p 1-1000 ${nmapTarget}`, 'Top 1000 Ports Scan')} label="2. Port Scan" />
                    <ActionBtn onClick={() => executeCommand(`nmap -sV --version-intensity 5 ${nmapTarget}`, 'Service Detection')} label="3. Service Detect" />
                  </div>
                </div>
              </div>
            )}

            {/* WEB SCRAPER TAB */}
            {activeTab === 'scraper' && (
              <div className="space-y-6 fade-in">
                <Header title="Web Scraper CLI" desc="Ambil metadata dan HTML info via API Termux" icon={<Globe className="text-purple-400"/>} />
                
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Target URL</label>
                    <input 
                      type="text" value={scrapeUrl} onChange={(e) => setScrapeUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ActionBtn 
                      onClick={() => executeCommand(`python3 -c "import requests, bs4; soup=bs4.BeautifulSoup(requests.get('${scrapeUrl}').text, 'html.parser'); print('Title:', soup.title.string); print('Description:', soup.find('meta', attrs={'name': 'description'})['content'] if soup.find('meta', attrs={'name': 'description'}) else 'None'); print('\\nH1:', [h.text for h in soup.find_all('h1')])"`, 'Basic HTML Info')} 
                      label="1. Extract Basic Info" 
                    />
                    <ActionBtn 
                      onClick={() => executeCommand(`python3 -c "import requests, bs4; soup=bs4.BeautifulSoup(requests.get('${scrapeUrl}').text, 'html.parser'); [print(a.text.strip(), '->', a.get('href')) for a in soup.find_all('a', href=True)][:30]"`, 'Extract Links')} 
                      label="2. Extract Links (Top 30)" 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* APK ANALYZER TAB */}
            {activeTab === 'apk' && (
              <div className="space-y-6 fade-in">
                <Header title="APK Analyzer" desc="Baca file manifest dan permission dari Termux" icon={<Cpu className="text-amber-400"/>} />
                
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Path File APK / Package Name</label>
                    <input 
                      type="text" value={apkPath} onChange={(e) => setApkPath(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="/sdcard/Download/app.apk atau com.termux"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ActionBtn onClick={() => executeCommand(`dumpsys package ${apkPath} | grep -i permission`, 'Cek Permission')} label="1. Cek Permission (Dumpsys)" />
                    <ActionBtn onClick={() => executeCommand(`aapt dump badging "${apkPath}"`, 'AAPT Dump APK Info')} label="2. Dump AAPT Informasi APK" />
                  </div>
                </div>
              </div>
            )}

            {/* TERMINAL UI */}
            {activeTab === 'terminal' && (
              <div className="space-y-4 h-full flex flex-col fade-in">
                <div className="flex items-center justify-between">
                   <Header title="Terminal Output" desc="Hasil eksekusi command line" icon={<Terminal className="text-emerald-400"/>} />
                   <button onClick={() => setTerminalOutput('')} className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-900 rounded border border-slate-800 transition-colors">Clear</button>
                </div>
                
                <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 min-h-[400px] overflow-hidden p-1 shadow-inner relative">
                    <div className="absolute top-0 left-0 w-full bg-slate-900 border-b border-slate-800 h-8 flex items-center px-4 gap-2 z-10">
                      <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="text-xs text-slate-500 mx-auto font-mono">bash@termux-agent</span>
                    </div>

                    <div className="h-full pt-10 px-4 pb-4 overflow-y-auto">
                      {terminalOutput ? (
                        <pre className="font-mono text-sm leading-relaxed text-emerald-400 whitespace-pre-wrap">
                          {terminalOutput}
                        </pre>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50 space-y-3">
                          <Activity className="h-12 w-12" />
                          <p className="font-mono text-sm">Belum ada output (C2 Idle)</p>
                        </div>
                      )}
                    </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}

function MenuBtn({ icon, label, id, active, set }: any) {
  const isActive = active === id;
  return (
    <button 
      onClick={() => set(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200
      ${isActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
    >
      <div className={`${isActive ? 'text-emerald-400' : ''}`}>{React.cloneElement(icon, { className: "h-5 w-5" })}</div>
      {label}
    </button>
  );
}

function Header({ title, desc, icon }: any) {
  return (
    <div>
      <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-1">
        {icon}
        {title}
      </h2>
      <p className="text-slate-400">{desc}</p>
    </div>
  );
}

function ActionBtn({ label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 px-4 py-3 rounded-lg text-sm text-left transition-all duration-200 flex items-center justify-between group"
    >
      <span className="font-medium">{label}</span>
      <Play className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
    </button>
  );
}
