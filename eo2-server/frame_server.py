#!/usr/bin/env python3
"""
EO2 MediaViewer server — the hub of the pull model. Stdlib only.

Serves:
  GET  /                 unified PWA (upload + gallery + settings)
  POST /upload?name=&album=   raw file body -> drop folder [-> album subfolder]
  GET  /admin            redirect to /#settings (backward compat)
  POST /api/settings     JSON -> served/settings.json (+ manifest regen)
  GET  /api/regen        rebuild manifest.json from library (+playlist filter)
  GET  /api/ping         liveness ("pong")
  GET  /api/status       frame check-in; records last-seen
  GET  /api/state        JSON for admin page (frame last-seen, counts, albums)
  GET  /api/albums       JSON list of album names
  GET  /api/uploaded     trigger processing pipeline
  GET  /app.webmanifest  PWA manifest for Add to Home Screen
  GET  /icon.svg         app icon
  GET  /manifest.json | /settings.json | /index.html | /media/<path>   library

Run via LaunchAgent com.mediaviewer.server on port 8845.
"""
import json, os, re, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE       = os.path.expanduser("~/eo2hub")
SERVED     = os.path.join(BASE, "served")
MEDIA      = os.path.join(SERVED, "media")
DROP       = os.path.join(BASE, "incoming")
DUR_DB     = os.path.join(BASE, "durations.db")
SETTINGS   = os.path.join(SERVED, "settings.json")
MANIFEST   = os.path.join(SERVED, "manifest.json")
PAGE       = os.path.join(SERVED, "index.html")
STATE_FILE = "/tmp/eo2_frame_state.json"
LOG        = "/tmp/eo2_server.log"
PORT       = 8845

DEFAULT_SETTINGS = {
    "photo_ms": 8000, "fade_ms": 1000, "orientation": "portrait",
    "playlist": "All",
    "sleep": {"enabled": False, "off": "23:00", "on": "07:00"},
}

VIDEO_EXT = {".mp4", ".m4v", ".webm"}
MEDIA_EXT = {".jpg", ".jpeg", ".png"} | VIDEO_EXT

_update_lock = threading.Lock()
_update_running = [False]
_state_lock = threading.Lock()

def log(msg):
    try:
        with open(LOG, "a") as f:
            f.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    except OSError:
        pass

def ensure_dirs():
    for d in (SERVED, MEDIA, DROP):
        os.makedirs(d, exist_ok=True)
    if not os.path.exists(SETTINGS):
        write_json(SETTINGS, DEFAULT_SETTINGS)

def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, path)

def read_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default

def read_durations():
    d = {}
    try:
        with open(DUR_DB) as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) == 2:
                    try: d[parts[0]] = float(parts[1])
                    except ValueError: pass
    except OSError:
        pass
    return d

def albums():
    out = []
    try:
        for name in sorted(os.listdir(MEDIA)):
            if os.path.isdir(os.path.join(MEDIA, name)) and not name.startswith("."):
                out.append(name)
    except OSError:
        pass
    return out

def regen_manifest():
    settings = read_json(SETTINGS, DEFAULT_SETTINGS)
    playlist = settings.get("playlist", "All")
    durs = read_durations()
    entries = []
    for root, dirs, files in os.walk(MEDIA):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in sorted(files):
            if fn.startswith("."): continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in MEDIA_EXT: continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, MEDIA).replace(os.sep, "/")
            album = rel.split("/")[0] if "/" in rel else ""
            if playlist != "All" and album != playlist: continue
            e = {"f": rel, "s": os.path.getsize(full)}
            if ext in VIDEO_EXT:
                if fn in durs: e["d"] = durs[fn]
            entries.append(e)
    write_json(MANIFEST, entries)
    log("manifest regenerated: %d entries (playlist=%s)" % (len(entries), playlist))
    return entries

def trigger_pipeline():
    try:
        with open(os.path.join(DROP, ".trigger"), "w") as f:
            f.write(str(time.time()))
        os.remove(os.path.join(DROP, ".trigger"))
    except OSError:
        pass
    log("upload batch complete; watcher will process")

def record_frame_seen(addr, changed):
    with _state_lock:
        st = read_json(STATE_FILE, {})
        st["frame_ip"] = addr
        st["last_seen"] = time.time()
        if changed:
            st["last_change"] = time.time()
        write_json(STATE_FILE, st)

def safe_name(name):
    name = os.path.basename(name or "upload")
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip() or "upload"
    return name

# ---------------------------------------------------------------------------
# PWA manifest & icon
# ---------------------------------------------------------------------------
PWA_MANIFEST = json.dumps({
    "name": "EO2 Frame",
    "short_name": "Frame",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#111111",
    "theme_color": "#111111",
    "icons": [
        {"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml"}
    ]
})

ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#1c1c1e"/>
<rect x="64" y="96" width="384" height="320" rx="24" fill="none" stroke="#2f7cf6" stroke-width="24"/>
<rect x="112" y="144" width="288" height="224" rx="8" fill="#2c2c2e"/>
<circle cx="210" cy="230" r="32" fill="#2f7cf6" opacity=".6"/>
<path d="M160 340 l80-70 50 40 80-90 60 60 v48 H160z" fill="#2f7cf6" opacity=".4"/>
</svg>"""

# ---------------------------------------------------------------------------
# Unified PWA HTML
# ---------------------------------------------------------------------------
APP_HTML = r"""<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#111">
<link rel="manifest" href="/app.webmanifest">
<link rel="apple-touch-icon" href="/icon.svg">
<title>EO2 Frame</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#111;--surface:#1c1c1e;--input:#2c2c2e;--border:#444;
  --accent:#2f7cf6;--green:#4cd964;--orange:#ff9f0a;--red:#ff3b30;
  --text:#eee;--sub:#999;--radius:14px;
  --safe-b:env(safe-area-inset-bottom,0px);
}
html,body{height:100%;background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro",system-ui,sans-serif;
  -webkit-tap-highlight-color:transparent;overscroll-behavior:none}
body{display:flex;flex-direction:column}

/* --- Tab content --- */
.tab-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:20px 16px calc(72px + var(--safe-b));display:none}
.tab-content.active{display:block}

/* --- Tab bar --- */
#tabbar{position:fixed;bottom:0;left:0;right:0;
  background:rgba(28,28,30,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-top:1px solid rgba(255,255,255,.08);
  display:flex;justify-content:space-around;
  padding:8px 0 calc(8px + var(--safe-b));z-index:100}
.tab-btn{background:none;border:none;color:var(--sub);font-size:.65em;
  display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:4px 16px;cursor:pointer;transition:color .15s}
.tab-btn.active{color:var(--accent)}
.tab-btn svg{width:26px;height:26px;fill:currentColor}

/* --- Common elements --- */
h1{font-size:1.5em;font-weight:700;margin-bottom:4px}
.subtitle{color:var(--sub);font-size:.9em;margin-bottom:20px}
.card{background:var(--surface);border-radius:var(--radius);padding:16px;margin-bottom:14px}
label{display:block;color:var(--sub);font-size:.85em;margin:12px 0 5px}
select,input[type=number],input[type=time]{width:100%;padding:11px;border-radius:10px;
  background:var(--input);color:var(--text);border:1px solid var(--border);
  font-size:1em;-webkit-appearance:none;appearance:none}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23999' fill='none' stroke-width='2'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
.row{display:flex;gap:12px}.row>div{flex:1}
.btn{display:block;width:100%;padding:16px;border:none;border-radius:var(--radius);
  font-size:1.1em;font-weight:600;text-align:center;cursor:pointer;
  transition:transform .1s,opacity .15s}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--accent);color:#fff}
.btn-success{background:var(--green);color:#fff}
.btn-disabled{opacity:.4;pointer-events:none}

/* --- Upload tab --- */
#file-input{display:none}
.pick-zone{border:2px dashed var(--border);border-radius:var(--radius);
  padding:40px 20px;text-align:center;cursor:pointer;transition:border-color .2s}
.pick-zone:active{border-color:var(--accent)}
.pick-icon{font-size:3em;margin-bottom:8px}
.pick-label{color:var(--sub);font-size:.95em}
.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.preview-item{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;
  background:var(--input)}
.preview-item img{width:100%;height:100%;object-fit:cover}
.preview-item .remove{position:absolute;top:4px;right:4px;width:22px;height:22px;
  background:rgba(0,0,0,.7);border-radius:50%;border:none;color:#fff;font-size:14px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1}
.preview-item .vid-badge{position:absolute;bottom:4px;left:4px;
  background:rgba(0,0,0,.7);border-radius:4px;padding:2px 6px;
  font-size:.7em;color:#fff}
.file-count{color:var(--sub);font-size:.85em;margin:8px 0 14px;text-align:center}
.upload-list .item{display:flex;align-items:center;padding:10px 0;
  border-bottom:1px solid rgba(255,255,255,.06)}
.upload-list .item:last-child{border-bottom:none}
.upload-list .name{flex:1;font-size:.9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px}
.upload-list .status{font-size:1.1em;width:24px;text-align:center}
.upload-list .ok{color:var(--green)}.upload-list .err{color:var(--red)}
.done-msg{text-align:center;padding:20px;font-size:1.2em;color:var(--green)}
.progress-bar{height:4px;background:var(--input);border-radius:2px;margin:14px 0;overflow:hidden}
.progress-bar .fill{height:100%;background:var(--accent);border-radius:2px;
  transition:width .3s;width:0}

/* --- Frame tab --- */
.status-card{display:flex;align-items:center;gap:12px}
.status-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.status-dot.on{background:var(--green)}.status-dot.off{background:var(--orange)}
.status-info{flex:1}
.status-label{font-size:.95em;font-weight:600}
.status-sub{font-size:.8em;color:var(--sub)}
.gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:14px}
.gallery-item{aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--input);
  cursor:pointer;position:relative}
.gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform .2s}
.gallery-item:active img{transform:scale(1.05)}
.gallery-item .vid-badge{position:absolute;bottom:4px;left:4px;
  background:rgba(0,0,0,.7);border-radius:4px;padding:2px 6px;font-size:.65em;color:#fff}
.gallery-empty{text-align:center;color:var(--sub);padding:40px 20px}

/* --- Lightbox --- */
#lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);
  z-index:200;align-items:center;justify-content:center;flex-direction:column}
#lightbox.show{display:flex}
#lightbox img,#lightbox video{max-width:92vw;max-height:80vh;border-radius:8px;object-fit:contain}
#lightbox .close{position:absolute;top:max(16px,env(safe-area-inset-top,16px));right:16px;
  background:rgba(255,255,255,.15);border:none;color:#fff;width:36px;height:36px;
  border-radius:50%;font-size:1.3em;cursor:pointer;display:flex;align-items:center;justify-content:center}
#lightbox .lb-name{color:var(--sub);font-size:.85em;margin-top:10px;max-width:80vw;
  text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* --- Settings tab --- */
#settings-saved{display:none;color:var(--green);text-align:center;
  margin-top:10px;font-size:.95em}

/* --- Misc --- */
.section-title{font-size:.8em;color:var(--sub);text-transform:uppercase;
  letter-spacing:.04em;margin:20px 0 8px;font-weight:600}
@media(min-width:500px){
  .tab-content{max-width:480px;margin:0 auto}
}
</style>
</head><body>

<!-- ===== UPLOAD TAB ===== -->
<div class="tab-content active" id="tab-upload">
  <h1>&#128444;&#65039; Frame</h1>
  <p class="subtitle">Add photos &amp; videos to the picture frame</p>

  <input type="file" id="file-input" accept="image/*,video/*" multiple>

  <div id="upload-pick">
    <div class="pick-zone" onclick="document.getElementById('file-input').click()">
      <div class="pick-icon">&#128247;</div>
      <div class="pick-label">Choose photos &amp; videos</div>
    </div>

    <label>Album</label>
    <select id="album"><option value="">Main collection</option></select>

    <div id="preview-area" style="display:none">
      <div class="preview-grid" id="preview-grid"></div>
      <div class="file-count" id="file-count"></div>
      <button class="btn btn-primary" id="send-btn" onclick="startUpload()">Send to frame</button>
    </div>
  </div>

  <div id="upload-progress" style="display:none">
    <div class="progress-bar"><div class="fill" id="progress-fill"></div></div>
    <div class="upload-list" id="upload-list"></div>
  </div>

  <div id="upload-done" style="display:none">
    <div class="done-msg">&#10003; Sent! They'll appear on the frame shortly.</div>
    <button class="btn btn-primary" onclick="resetUpload()" style="margin-top:14px">Send more</button>
  </div>
</div>

<!-- ===== FRAME TAB ===== -->
<div class="tab-content" id="tab-frame">
  <h1>Your Frame</h1>
  <p class="subtitle">What's currently on display</p>

  <div class="card">
    <div class="status-card">
      <div class="status-dot off" id="frame-dot"></div>
      <div class="status-info">
        <div class="status-label" id="frame-status">Checking...</div>
        <div class="status-sub" id="frame-sub"></div>
      </div>
    </div>
  </div>

  <div class="section-title" id="gallery-title">Media</div>
  <div id="gallery"></div>
</div>

<!-- ===== SETTINGS TAB ===== -->
<div class="tab-content" id="tab-settings">
  <h1>Settings</h1>
  <p class="subtitle">Control how the frame displays your media</p>

  <div class="card">
    <label>Playlist</label>
    <select id="s-playlist"></select>

    <div class="row">
      <div><label>Seconds per photo</label>
        <input id="s-photo" type="number" min="3" max="120" step="1"></div>
      <div><label>Fade (ms)</label>
        <input id="s-fade" type="number" min="0" max="4000" step="100"></div>
    </div>

    <label>Orientation</label>
    <select id="s-orient">
      <option value="portrait">Portrait</option>
      <option value="landscape">Landscape</option>
    </select>

    <label>Nightly sleep</label>
    <select id="s-sleep-en">
      <option value="0">Off &mdash; always on</option>
      <option value="1">On (schedule below)</option>
    </select>
    <div class="row">
      <div><label>Screen off at</label><input id="s-sleep-off" type="time"></div>
      <div><label>Back on at</label><input id="s-sleep-on" type="time"></div>
    </div>

    <button class="btn btn-primary" onclick="saveSettings()" style="margin-top:16px">Save settings</button>
    <div id="settings-saved">&#10003; Saved &mdash; frame updates within a minute</div>
  </div>
</div>

<!-- ===== LIGHTBOX ===== -->
<div id="lightbox">
  <button class="close" onclick="closeLightbox()">&times;</button>
  <div id="lb-content"></div>
  <div class="lb-name" id="lb-name"></div>
</div>

<!-- ===== TAB BAR ===== -->
<nav id="tabbar">
  <button class="tab-btn active" data-tab="upload" onclick="switchTab('upload')">
    <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L11 5.83V16h2V5.83l.41.58L12 4zM20 18H4v2h16v-2z"/><path d="M4 18h16v2H4z" opacity=".3"/><rect x="4" y="18" width="16" height="2" rx="1"/><path d="M12 4L7.76 8.24l1.41 1.41L11 7.83V16h2V7.83l1.83 1.82 1.41-1.41z"/></svg>
    Upload
  </button>
  <button class="tab-btn" data-tab="frame" onclick="switchTab('frame')">
    <svg viewBox="0 0 24 24"><path d="M22 4H2v16h20V4zm-2 14H4V6h16v12z"/><path d="M8.5 12.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>
    Frame
  </button>
  <button class="tab-btn" data-tab="settings" onclick="switchTab('settings')">
    <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z"/></svg>
    Settings
  </button>
</nav>

<script>
// --- Tab switching ---
function switchTab(name){
  document.querySelectorAll('.tab-content').forEach(function(el){el.classList.remove('active')});
  document.querySelectorAll('.tab-btn').forEach(function(el){el.classList.remove('active')});
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelector('[data-tab="'+name+'"]').classList.add('active');
  location.hash=name;
  if(name==='frame') loadGallery();
  if(name==='settings') loadSettings();
}
// Handle hash on load
var initTab=(location.hash||'').replace('#','')||'upload';
if(['upload','frame','settings'].indexOf(initTab)<0) initTab='upload';
if(initTab!=='upload') switchTab(initTab);

// --- Albums (shared) ---
var albumCache=[];
function loadAlbums(cb){
  fetch('/api/albums').then(function(r){return r.json()}).then(function(list){
    albumCache=list;
    if(cb) cb(list);
  }).catch(function(){if(cb) cb([])});
}
function populateAlbumSelect(id,selected){
  var el=document.getElementById(id);
  if(!el) return;
  var extra=el.id==='album'?'<option value="">Main collection</option>':'<option value="All">All</option>';
  el.innerHTML=extra+albumCache.map(function(a){return '<option value="'+a+'">'+a+'</option>'}).join('');
  if(selected) el.value=selected;
}

// --- Upload ---
var files=[];
var fileURLs=[];
document.getElementById('file-input').onchange=function(e){
  var newFiles=[].slice.call(e.target.files);
  if(!newFiles.length) return;
  files=files.concat(newFiles);
  renderPreviews();
};
function renderPreviews(){
  var grid=document.getElementById('preview-grid');
  grid.innerHTML='';
  fileURLs.forEach(function(u){URL.revokeObjectURL(u)});
  fileURLs=[];
  files.forEach(function(f,i){
    var url=URL.createObjectURL(f);
    fileURLs.push(url);
    var isVid=f.type.startsWith('video');
    var div=document.createElement('div');
    div.className='preview-item';
    div.innerHTML=(isVid
      ?'<video src="'+url+'" muted style="width:100%;height:100%;object-fit:cover"></video>'
      :'<img src="'+url+'" alt="">')
      +'<button class="remove" onclick="removeFile('+i+')">&times;</button>'
      +(isVid?'<span class="vid-badge">VIDEO</span>':'');
    grid.appendChild(div);
  });
  document.getElementById('file-count').textContent=files.length+' item'+(files.length===1?'':'s')+' selected';
  document.getElementById('preview-area').style.display=files.length?'block':'none';
}
function removeFile(i){
  files.splice(i,1);
  renderPreviews();
}
function esc(s){return s.replace(/[^a-z0-9]/gi,'_')}
function startUpload(){
  if(!files.length) return;
  document.getElementById('upload-pick').style.display='none';
  document.getElementById('upload-progress').style.display='block';
  var list=document.getElementById('upload-list');
  list.innerHTML='';
  files.forEach(function(f){
    var div=document.createElement('div');
    div.className='item';
    div.innerHTML='<span class="name">'+f.name+'</span><span class="status" id="us_'+esc(f.name)+'">&#8943;</span>';
    list.appendChild(div);
  });
  var album=document.getElementById('album').value;
  var idx=0,ok=0,fail=0;
  function next(){
    if(idx>=files.length){
      document.getElementById('upload-progress').style.display='none';
      document.getElementById('upload-done').style.display='block';
      fetch('/api/uploaded').catch(function(){});
      return;
    }
    var f=files[idx++];
    var el=document.getElementById('us_'+esc(f.name));
    el.textContent='↑'; el.className='status';
    var pct=((idx-1)/files.length*100);
    document.getElementById('progress-fill').style.width=pct+'%';
    var xhr=new XMLHttpRequest();
    xhr.open('POST','/upload?name='+encodeURIComponent(f.name)+'&album='+encodeURIComponent(album));
    xhr.upload.onprogress=function(e){
      if(e.lengthComputable){
        var filePct=e.loaded/e.total*100;
        var totalPct=((idx-1+e.loaded/e.total)/files.length*100);
        document.getElementById('progress-fill').style.width=totalPct+'%';
      }
    };
    xhr.onload=function(){
      if(xhr.status===200){el.textContent='✓';el.className='status ok';ok++}
      else{el.textContent='✗';el.className='status err';fail++}
      next();
    };
    xhr.onerror=function(){el.textContent='✗';el.className='status err';fail++;next()};
    xhr.send(f);
  }
  next();
}
function resetUpload(){
  files=[];fileURLs=[];
  document.getElementById('file-input').value='';
  document.getElementById('upload-pick').style.display='block';
  document.getElementById('upload-progress').style.display='none';
  document.getElementById('upload-done').style.display='none';
  document.getElementById('preview-area').style.display='none';
  document.getElementById('preview-grid').innerHTML='';
  document.getElementById('progress-fill').style.width='0';
}

// --- Frame / Gallery ---
function loadGallery(){
  fetch('/api/state').then(function(r){return r.json()}).then(function(st){
    var dot=document.getElementById('frame-dot');
    var label=document.getElementById('frame-status');
    var sub=document.getElementById('frame-sub');
    var seen=st.frame_last_seen_s;
    if(seen!=null&&seen<180){
      dot.className='status-dot on'; label.textContent='Frame is online';
      sub.textContent='Last check-in '+Math.round(seen)+'s ago · '+st.manifest_count+' items';
    }else{
      dot.className='status-dot off'; label.textContent='Frame not seen recently';
      sub.textContent=seen!=null?'Last check-in '+Math.round(seen/60)+' min ago':'Never connected';
      sub.textContent+=st.manifest_count?' · '+st.manifest_count+' items':'';
    }
    document.getElementById('gallery-title').textContent='Media ('+st.manifest_count+')';
  }).catch(function(){});

  fetch('/manifest.json').then(function(r){return r.json()}).then(function(items){
    var gal=document.getElementById('gallery');
    if(!items.length){
      gal.innerHTML='<div class="gallery-empty">No media on the frame yet.<br>Upload some photos!</div>';
      return;
    }
    var html='<div class="gallery-grid">';
    items.forEach(function(item){
      var path='/media/'+encodeURI(item.f);
      var ext=item.f.split('.').pop().toLowerCase();
      var isVid=['mp4','m4v','webm'].indexOf(ext)>=0;
      html+='<div class="gallery-item" onclick="openLightbox(\''+path.replace(/'/g,"\\'")+'\','+isVid+',\''+item.f.replace(/'/g,"\\'")+'\')">';
      if(isVid){
        html+='<video src="'+path+'" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>';
        html+='<span class="vid-badge">'+(item.d?Math.round(item.d)+'s':'VID')+'</span>';
      }else{
        html+='<img src="'+path+'" loading="lazy" alt="">';
      }
      html+='</div>';
    });
    html+='</div>';
    gal.innerHTML=html;
  }).catch(function(){});
}

// --- Lightbox ---
function openLightbox(src,isVideo,name){
  var lb=document.getElementById('lightbox');
  var content=document.getElementById('lb-content');
  document.getElementById('lb-name').textContent=name;
  if(isVideo){
    content.innerHTML='<video src="'+src+'" controls autoplay playsinline style="max-width:92vw;max-height:80vh;border-radius:8px"></video>';
  }else{
    content.innerHTML='<img src="'+src+'" style="max-width:92vw;max-height:80vh;border-radius:8px;object-fit:contain" alt="">';
  }
  lb.classList.add('show');
}
function closeLightbox(){
  var lb=document.getElementById('lightbox');
  lb.classList.remove('show');
  document.getElementById('lb-content').innerHTML='';
}
document.getElementById('lightbox').onclick=function(e){
  if(e.target===this) closeLightbox();
};

// --- Settings ---
function loadSettings(){
  fetch('/api/state').then(function(r){return r.json()}).then(function(st){
    var s=st.settings;
    albumCache=st.albums||[];
    populateAlbumSelect('s-playlist',s.playlist||'All');
    document.getElementById('s-photo').value=(s.photo_ms||8000)/1000;
    document.getElementById('s-fade').value=s.fade_ms||1000;
    document.getElementById('s-orient').value=s.orientation||'portrait';
    document.getElementById('s-sleep-en').value=(s.sleep&&s.sleep.enabled)?'1':'0';
    document.getElementById('s-sleep-off').value=(s.sleep&&s.sleep.off)||'23:00';
    document.getElementById('s-sleep-on').value=(s.sleep&&s.sleep.on)||'07:00';
  }).catch(function(){});
}
function saveSettings(){
  var body={
    playlist:document.getElementById('s-playlist').value,
    photo_ms:Math.round(parseFloat(document.getElementById('s-photo').value||8)*1000),
    fade_ms:parseInt(document.getElementById('s-fade').value||1000),
    orientation:document.getElementById('s-orient').value,
    sleep:{enabled:document.getElementById('s-sleep-en').value==='1',
      off:document.getElementById('s-sleep-off').value||'23:00',
      on:document.getElementById('s-sleep-on').value||'07:00'}};
  fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)}).then(function(r){
      if(r.ok){
        var el=document.getElementById('settings-saved');
        el.style.display='block';
        setTimeout(function(){el.style.display='none'},3500);
      }
    }).catch(function(){});
}

// --- Init ---
loadAlbums(function(list){populateAlbumSelect('album','')});
</script>
</body></html>"""

# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, ctype="text/html; charset=utf-8"):
        if isinstance(body, str): body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass

    def _send_file(self, path, ctype):
        try:
            size = os.path.getsize(path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk: break
                    self.wfile.write(chunk)
        except (OSError, BrokenPipeError, ConnectionResetError):
            try: self._send(404, "not found", "text/plain")
            except Exception: pass

    def _redirect(self, url):
        self.send_response(302)
        self.send_header("Location", url)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        q = urllib.parse.parse_qs(parsed.query)

        if path == "/":
            opts = "".join('<option value="%s">%s</option>' % (a, a) for a in albums())
            self._send(200, APP_HTML)
        elif path == "/admin":
            self._redirect("/#settings")
        elif path == "/app.webmanifest":
            self._send(200, PWA_MANIFEST, "application/manifest+json")
        elif path == "/icon.svg":
            self._send(200, ICON_SVG, "image/svg+xml")
        elif path == "/api/ping":
            self._send(200, "pong", "text/plain")
        elif path == "/api/status":
            record_frame_seen(self.client_address[0], q.get("changed", ["0"])[0] == "1")
            self._send(200, '{"ok":1}', "application/json")
        elif path == "/api/state":
            st = read_json(STATE_FILE, {})
            man = read_json(MANIFEST, [])
            last = st.get("last_seen")
            out = {
                "settings": read_json(SETTINGS, DEFAULT_SETTINGS),
                "albums": albums(),
                "manifest_count": len(man),
                "frame_ip": st.get("frame_ip"),
                "frame_last_seen_s": (time.time() - last) if last else None,
                "pipeline_running": _update_running[0],
            }
            self._send(200, json.dumps(out), "application/json")
        elif path == "/api/albums":
            self._send(200, json.dumps(albums()), "application/json")
        elif path == "/api/regen":
            entries = regen_manifest()
            self._send(200, json.dumps({"ok": 1, "count": len(entries)}), "application/json")
        elif path == "/api/uploaded":
            trigger_pipeline()
            self._send(200, '{"ok":1}', "application/json")
        elif path == "/manifest.json":
            if not os.path.exists(MANIFEST): regen_manifest()
            self._send_file(MANIFEST, "application/json")
        elif path == "/settings.json":
            ensure_dirs()
            self._send_file(SETTINGS, "application/json")
        elif path == "/index.html":
            self._send_file(PAGE, "text/html; charset=utf-8")
        elif path.startswith("/media/"):
            rel = urllib.parse.unquote(path[len("/media/"):])
            full = os.path.normpath(os.path.join(MEDIA, rel))
            if not full.startswith(MEDIA):
                self._send(403, "no", "text/plain"); return
            ext = os.path.splitext(full)[1].lower()
            ctype = "video/mp4" if ext in VIDEO_EXT else "image/jpeg"
            self._send_file(full, ctype)
        else:
            self._send(404, "not found", "text/plain")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/upload":
            name = safe_name(q.get("name", [""])[0])
            album = re.sub(r"[^A-Za-z0-9 _-]", "", q.get("album", [""])[0])[:40]
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > 4 * 1024 * 1024 * 1024:
                self._send(400, "bad length", "text/plain"); return
            dest_dir = os.path.join(DROP, album) if album else DROP
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, name)
            base, ext = os.path.splitext(dest)
            i = 1
            while os.path.exists(dest):
                dest = "%s_%d%s" % (base, i, ext); i += 1
            try:
                remaining = length
                with open(dest + ".part", "wb") as f:
                    while remaining > 0:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk: break
                        f.write(chunk); remaining -= len(chunk)
                if remaining != 0:
                    os.remove(dest + ".part")
                    self._send(400, "truncated", "text/plain"); return
                os.replace(dest + ".part", dest)
                log("upload: %s (%d bytes, album=%r)" % (os.path.basename(dest), length, album))
                self._send(200, '{"ok":1}', "application/json")
            except OSError as e:
                log("upload failed: %s" % e)
                self._send(500, "write failed", "text/plain")
        elif parsed.path == "/api/settings":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length).decode())
                cur = read_json(SETTINGS, DEFAULT_SETTINGS)
                cur.update({k: body[k] for k in
                            ("playlist", "photo_ms", "fade_ms", "orientation", "sleep") if k in body})
                write_json(SETTINGS, cur)
                regen_manifest()
                log("settings saved: %s" % json.dumps(cur))
                self._send(200, '{"ok":1}', "application/json")
            except (ValueError, KeyError) as e:
                self._send(400, "bad json: %s" % e, "text/plain")
        else:
            self._send(404, "not found", "text/plain")

def main():
    ensure_dirs()
    regen_manifest()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log("server listening on :%d" % PORT)
    srv.serve_forever()

if __name__ == "__main__":
    main()
