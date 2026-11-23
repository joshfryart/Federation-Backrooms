#!/usr/bin/env node
// Usage: node tools/bot-report.mjs <resultsDir> [--summary summary.json] [--out report.html]
// Reads <resultsDir>/<role>/<mission>.json (array of task records, or {tasks:[...]}), emits one self-contained HTML.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let dir = null, summaryPath = null, outPath = 'report.html';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--summary') summaryPath = args[++i];
  else if (args[i] === '--out') outPath = args[++i];
  else if (!dir) dir = args[i];
}
if (!dir) { console.error('usage: bot-report.mjs <resultsDir> [--summary summary.json] [--out report.html]'); process.exit(2); }
dir = path.resolve(dir); outPath = path.resolve(outPath);
if (!summaryPath && fs.existsSync(path.join(dir, 'summary.json'))) summaryPath = path.join(dir, 'summary.json');
const summary = summaryPath && fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : null;

const EMBED_MAX = 60 * 1024, EMBED_BUDGET = 2.2 * 1024 * 1024;
let embedded = 0;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function shot(p, roleDir, jsonDir) {
  if (!p) return null;
  for (const base of [jsonDir, roleDir, dir, path.dirname(dir)]) {
    const f = path.resolve(base, p);
    if (!fs.existsSync(f)) continue;
    const sz = fs.statSync(f).size, mime = MIME[path.extname(f).toLowerCase()];
    if (mime && sz < EMBED_MAX && embedded + sz * 1.34 < EMBED_BUDGET) {
      embedded += sz * 1.34;
      return 'data:' + mime + ';base64,' + fs.readFileSync(f).toString('base64');
    }
    return path.relative(path.dirname(outPath), f).split(path.sep).join('/');
  }
  return null;
}

const tasks = [];
for (const role of fs.readdirSync(dir).sort()) {
  const rd = path.join(dir, role);
  if (!fs.statSync(rd).isDirectory()) continue;
  for (const f of fs.readdirSync(rd).sort()) {
    if (!f.endsWith('.json')) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(rd, f), 'utf8')); } catch (e) { console.error('skip', role, f, e.message); continue; }
    const mission = f.replace(/\.json$/, '');
    const list = Array.isArray(j) ? j : (j.tasks || j.records || []);
    for (const t of list) {
      const o = { ...t, role, mission };
      o.shots = (t.shots || []).map(s => shot(s, rd, rd));
      for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k];
      tasks.push(o);
    }
  }
}
// department = module prefix / explicit dept, fall back to role
for (const t of tasks) t.dept = t.dept || t.department || (t.module ? String(t.module).split(/[\/.:]/)[0] : t.role);

const esc = s => JSON.stringify({ tasks, summary }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const html = TEMPLATE().replace('__DATA__', () => esc());
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB, ${tasks.length} tasks, ${(embedded / 1024).toFixed(0)} KB images)`);

function TEMPLATE() { return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Run Report</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--fg:#1c2027;--mute:#5d6673;--line:#dde1e7;--accent:#2f5fd0;
--pass:#17803d;--passbg:#dff5e6;--fail:#b42318;--failbg:#fde4e1;--warn:#9a6700;--warnbg:#fdf0c9;--skip:#5d6673;--skipbg:#e8ebf0}
@media (prefers-color-scheme:dark){:root{--bg:#12151a;--panel:#1b2027;--fg:#e6e9ee;--mute:#9aa4b2;--line:#2c333d;--accent:#7ea2ff;
--pass:#5fd28a;--passbg:#163524;--fail:#ff8a7d;--failbg:#40201d;--warn:#f0c04a;--warnbg:#3b3012;--skip:#9aa4b2;--skipbg:#262c35}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
body{padding:16px;max-width:1280px;margin:0 auto;overflow-x:hidden;background:var(--bg)}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}
.mute{color:var(--mute)}
section,.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.kpi{border:1px solid var(--line);border-radius:6px;padding:8px}.kpi b{display:block;font-size:22px}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap}
.b-pass{color:var(--pass);background:var(--passbg)}.b-fail,.b-error{color:var(--fail);background:var(--failbg)}
.b-timeout{color:var(--warn);background:var(--warnbg)}.b-skip{color:var(--skip);background:var(--skipbg)}
.tag{font-size:11px;padding:0 6px;border-radius:4px;border:1px solid var(--line);color:var(--mute);margin-left:4px}
.groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--mute);white-space:nowrap}th.s{cursor:pointer;user-select:none}th.s:hover{color:var(--fg)}
.bar{height:6px;background:var(--failbg);border-radius:3px;min-width:60px;overflow:hidden}.bar i{display:block;height:100%;background:var(--pass)}
.gt td:first-child{word-break:break-word}
.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
button,select,input{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 8px;min-height:32px}
button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.filters input{flex:1 1 160px;min-width:0}.filters select{flex:0 1 130px;min-width:0}
tr.row{cursor:pointer}tr.row:hover{background:var(--skipbg)}
.detail{background:var(--bg)}.detail dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0}.detail dt{color:var(--mute)}.detail dd{margin:0;word-break:break-word}
.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.thumbs img{max-width:160px;max-height:120px;border:1px solid var(--line);border-radius:4px;background:#000}
.thumbs a{font-size:12px}
ol.fixes{padding-left:20px;margin:0}ol.fixes li{margin-bottom:8px}code{font-size:12px;background:var(--skipbg);padding:0 4px;border-radius:3px;word-break:break-all}
.cl{margin-bottom:8px}.cl ul{margin:2px 0 0;padding-left:18px}
@media (max-width:640px){.hide-s{display:none}th,td{padding:5px 4px}h1{font-size:18px}}
</style></head><body>
<header><h1>Bot Run Report</h1><div class="mute" id="sub"></div></header>
<section id="head" hidden></section>
<div class="kpis" id="kpis"></div>
<section id="fixes" hidden></section>
<section id="clusters" hidden></section>
<div class="groups" id="groups"></div>
<section>
<div class="tabs" id="tabs"></div>
<div class="filters" id="filters"></div>
<div class="scroll"><table id="tbl"><thead></thead><tbody></tbody></table></div>
<div class="mute" id="cnt" style="margin-top:6px"></div>
</section>
<script id="data" type="application/json">__DATA__</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent),T=D.tasks,S=D.summary||{};
var $=function(i){return document.getElementById(i)};
function E(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function badge(s){return '<span class="badge b-'+E(s)+'">'+E(s)+'</span>'}
T.forEach(function(t,i){t._i=i;t.category=t.category||'';});
var by={};T.forEach(function(t){by[t.status]=(by[t.status]||0)+1});
var pass=by.pass||0,ran=T.length-(by.skip||0),fl=T.filter(function(t){return t.flaky}).length,sl=T.filter(function(t){return t.slow}).length;
$('sub').textContent=T.length+' tasks \\u00b7 '+new Set(T.map(function(t){return t.role})).size+' roles';
var k=[['Tasks',T.length],['Pass rate',ran?(100*pass/ran).toFixed(1)+'%':'-'],['Pass',pass],['Fail',by.fail||0],['Error',by.error||0],['Timeout',by.timeout||0],['Skip',by.skip||0],['Flaky',fl],['Slow',sl]];
$('kpis').innerHTML=k.map(function(x){return '<div class="kpi"><span class="mute">'+x[0]+'</span><b>'+x[1]+'</b></div>'}).join('');
if(S.headline){$('head').hidden=false;$('head').innerHTML='<h2>Summary</h2><div>'+E(S.headline)+'</div>'+(S.notes?'<p class="mute">'+E(typeof S.notes==='string'?S.notes:S.notes.join(' '))+'</p>':'')}
if(S.topFixes&&S.topFixes.length){$('fixes').hidden=false;$('fixes').innerHTML='<h2>Top fixes</h2><ol class="fixes">'+S.topFixes.map(function(f){return '<li><b>'+E(f.title)+'</b>'+(f.suspectFile?' <code>'+E(f.suspectFile)+'</code>':'')+'<div class="mute">'+E(f.detail)+'</div></li>'}).join('')+'</ol>'}
if(S.clusters&&S.clusters.length){$('clusters').hidden=false;$('clusters').innerHTML='<h2>Failure clusters</h2>'+S.clusters.map(function(c){var it=c.items||[];return '<div class="cl"><b>'+E(c.title)+'</b>'+(c.category?'<span class="tag">'+E(c.category)+'</span>':'')+' <span class="mute">('+it.length+')</span>'+(c.fix?'<div class="mute">Fix: '+E(c.fix)+'</div>':'')+'<ul>'+it.slice(0,8).map(function(x){return '<li>'+E(typeof x==='string'?x:JSON.stringify(x))+'</li>'}).join('')+(it.length>8?'<li class="mute">+'+(it.length-8)+' more</li>':'')+'</ul></div>'}).join('')}
function group(title,key){var g={};T.forEach(function(t){var v=t[key]||'-';(g[v]=g[v]||{n:0,p:0,s:0})[t.status==='skip'?'s':'n']++;if(t.status==='pass')g[v].p++});
 var rows=Object.keys(g).sort().map(function(v){var x=g[v],pc=x.n?100*x.p/x.n:0;return '<tr><td>'+E(v)+'</td><td>'+x.p+'/'+x.n+(x.s?' <span class="mute">+'+x.s+' skip</span>':'')+'</td><td style="width:70px"><div class="bar"><i style="width:'+pc+'%"></i></div></td><td>'+pc.toFixed(0)+'%</td></tr>'}).join('');
 return '<div class="card"><h2>By '+title+'</h2><div class="scroll"><table class="gt">'+rows+'</table></div></div>'}
$('groups').innerHTML=group('role','role')+group('department','dept')+group('host','host')+group('mission','mission');
var tab='all',sortK='status',sortD=1,open={};
var tabs=[['all','All'],['fail','Failures'],['flaky','Flaky'],['slow','Slow']];
function uniq(f){return Array.from(new Set(T.map(f))).filter(Boolean).sort()}
var F={q:'',role:'',mission:'',status:'',category:''};
function sel(key,label,vals){return '<select data-k="'+key+'" aria-label="'+label+'"><option value="">'+label+': all</option>'+vals.map(function(v){return '<option>'+E(v)+'</option>'}).join('')+'</select>'}
$('filters').innerHTML='<input data-k="q" type="search" placeholder="Search task, room, notes\\u2026" aria-label="Search">'+sel('role','Role',uniq(function(t){return t.role}))+sel('mission','Mission',uniq(function(t){return t.mission}))+sel('status','Status',uniq(function(t){return t.status}))+sel('category','Category',uniq(function(t){return t.category}));
$('filters').oninput=function(e){F[e.target.dataset.k]=e.target.value;render()};
function drawTabs(){$('tabs').innerHTML=tabs.map(function(t){return '<button data-t="'+t[0]+'" class="'+(tab===t[0]?'on':'')+'">'+t[1]+' ('+cnt(t[0])+')</button>'}).join('')}
function inTab(t,n){return n==='all'||(n==='fail'&&(t.status==='fail'||t.status==='error'||t.status==='timeout'))||(n==='flaky'&&t.flaky)||(n==='slow'&&t.slow)}
function cnt(n){return T.filter(function(t){return inTab(t,n)}).length}
$('tabs').onclick=function(e){if(e.target.dataset.t){tab=e.target.dataset.t;render()}};
var cols=[['status','Status'],['role','Role'],['mission','Mission'],['label','Task'],['category','Category','hide-s'],['quality','Quality','hide-s'],['gameSec','Time']];
function fmt(t){var s=t.gameSec!=null?t.gameSec:null;return s==null?'-':(s>=60?(s/60).toFixed(1)+'m':s.toFixed(0)+'s')+(t.timeMul&&t.timeMul!==1?' \\u00d7'+t.timeMul:'')}
$('tbl').tHead.innerHTML='<tr>'+cols.map(function(c){return '<th class="s '+(c[2]||'')+'" data-s="'+c[0]+'">'+c[1]+'</th>'}).join('')+'</tr>';
$('tbl').tHead.onclick=function(e){var s=e.target.dataset.s;if(!s)return;if(sortK===s)sortD=-sortD;else{sortK=s;sortD=1}render()};
var ord={fail:0,error:1,timeout:2,pass:3,skip:4};
function val(t,k){return k==='status'?(ord[t.status]!=null?ord[t.status]:9):(t[k]==null?'':t[k])}
function detail(t){var r=[['id',t.id],['type',t.jtype],['room',t.room],['host',t.host],['module',t.module],['faults',t.faults],['wall',t.wallMs!=null?(t.wallMs/1000).toFixed(1)+'s':''],['started',t.started],['routed',t.routed],['layerClosed',t.layerClosed],['dutyState',t.dutyState],['notes',t.notes],['replay',t.replay]].filter(function(x){return x[1]!==''&&x[1]!=null&&x[1]!==undefined});
 var th=(t.shots||[]).map(function(s,i){if(!s)return '';var n=i?'end':'start';return s.indexOf('data:')===0?'<a href="'+s+'" target="_blank"><img loading="lazy" src="'+s+'" alt="'+n+'"></a>':'<a href="'+E(s)+'" target="_blank">'+n+' screenshot \\u2197</a>'}).join('');
 return '<dl>'+r.map(function(x){return '<dt>'+x[0]+'</dt><dd>'+E(x[1])+'</dd>'}).join('')+'</dl>'+(th?'<div class="thumbs">'+th+'</div>':'')}
function render(){drawTabs();var q=F.q.toLowerCase();
 var L=T.filter(function(t){return inTab(t,tab)&&(!F.role||t.role===F.role)&&(!F.mission||t.mission===F.mission)&&(!F.status||t.status===F.status)&&(!F.category||t.category===F.category)&&(!q||(t.label+' '+t.id+' '+t.room+' '+t.notes+' '+t.module).toLowerCase().indexOf(q)>=0)});
 L.sort(function(a,b){var x=val(a,sortK),y=val(b,sortK);return (x<y?-1:x>y?1:a._i-b._i)*sortD});
 var shown=L.slice(0,500);
 $('tbl').tBodies[0].innerHTML=shown.map(function(t){var o=open[t._i];return '<tr class="row" data-i="'+t._i+'"><td>'+badge(t.status)+(t.flaky?'<span class="tag">flaky</span>':'')+(t.slow?'<span class="tag">slow</span>':'')+'</td><td>'+E(t.role)+'</td><td>'+E(t.mission)+'</td><td>'+E(t.label||t.id)+'</td><td class="hide-s">'+E(t.category)+'</td><td class="hide-s">'+E(t.quality)+'</td><td>'+fmt(t)+'</td></tr>'+(o?'<tr class="detail"><td colspan="7">'+detail(t)+'</td></tr>':'')}).join('');
 $('cnt').textContent=L.length+' of '+T.length+' tasks'+(L.length>shown.length?' (showing first '+shown.length+', filter to narrow)':'')+' \\u00b7 click a row for details'}
$('tbl').tBodies[0].onclick=function(e){var tr=e.target.closest('tr.row');if(!tr)return;if(e.target.closest('a'))return;var i=tr.dataset.i;open[i]=!open[i];render()};
render();
})();
</script></body></html>`; }
