"""Copies approved HTML components and scopes its CSS; no reference mock JS is shipped."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[4]
reference=(root/'ops/maintrack/team-ledger/test/approved-reference.fixture.html').read_text()
def scoped(css):
    out=''
    while css.strip():
        start=css.find('{')
        if start<0: break
        selector=re.sub(r'/\*.*?\*/','',css[:start],flags=re.S).strip();depth=1;end=start+1
        while depth:
            if css[end]=='{':depth+=1
            if css[end]=='}':depth-=1
            end+=1
        body=css[start+1:end-1];css=css[end:]
        if selector.startswith('@'):out+=selector+'{'+scoped(body)+'}\n'
        else:
            selector=re.sub(r'/\*.*?\*/','',selector,flags=re.S).strip()
            if selector:
                selectors=[]
                for s in selector.split(','):
                    s=s.strip()
                    selectors.append('#admin .team-ledger' if s==':root' else '#admin .team-ledger '+s)
                out+=','.join(selectors)+'{'+body+'}\n'
    return out
css=scoped(reference.split('<style>')[1].split('</style>')[0])
css+='''\n#admin .team-ledger{--dark:#0c2334;--nav:#143448;--turq:#078f93;--border:#e3eaef;--mute:#728696;--gold:#f4c45a;--shadow:0 13px 40px #102d4211;font-family:'Cairo','Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;color:#193345;line-height:1.65;min-width:0}
#admin .team-ledger [hidden]{display:none!important}#admin .team-ledger table{width:100%}#admin .team-ledger button:disabled{cursor:default;opacity:.55}#admin .team-ledger button{min-height:40px}#admin .team-ledger .ledger-status{min-height:28px;margin:10px 0;color:#536f80}#admin .team-ledger .ledger-error{color:#9b3026}#admin .team-ledger .ledger-paging{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px}#admin .team-ledger .ledger-paging button{border:1px solid #b8d8da;border-radius:9px;background:white;color:#087e82;padding:7px 16px}#admin .team-ledger .scope-note{font-size:12px;color:#586e7e;margin-bottom:15px}#admin .team-ledger .field input{min-width:0}#admin .team-ledger .clear-search{border:0;background:transparent;color:#087e82;padding:0 9px}#admin .team-ledger tbody button:focus-visible{outline:3px solid #078f93;outline-offset:2px}#admin .team-ledger .history-table td{overflow-wrap:anywhere}#admin .team-ledger .tl-name-button{border:0;background:transparent;padding:0;text-align:right;color:#193345;font:inherit;font-weight:800}#admin .team-ledger button:hover:not(:disabled){filter:brightness(.95)}
@media(max-width:650px){#admin .team-ledger .history-table table,#admin .team-ledger .history-table tbody{display:block;min-width:0}#admin .team-ledger .history-table thead{display:none}#admin .team-ledger .history-table tr{display:block;padding:10px;border-bottom:1px solid #e3eaef}#admin .team-ledger .history-table td{display:flex;justify-content:space-between;gap:12px;padding:7px;white-space:normal}#admin .team-ledger .history-table td::before{content:attr(data-label);font-weight:700;color:#728696;flex-shrink:0}#admin .team-ledger .history-table .no-results{display:block}}
'''
(root/'web/maintrack/public/team-ledger.css').write_text('/* Adapted from the Owner-approved reference; scoped to Administration only. */\n'+css)
p=root/'web/maintrack/public/index.html';s=p.read_text();a=s.index('<section id="admin"');b=s.index('</section>',a);admin=s[a:b]
if 'adminAccountsPanel' in admin:raise SystemExit(0)
header_end=admin.index('\n  <div class="section-card">')
accounts=admin[header_end:]
tabs=re.search(r'<div class="admin-main-tabs".*?</div>',reference,re.S).group();tabs=re.sub(r'<span class="new-dot">.*?</span>','',tabs).replace(' is-proposed','').replace('aria-selected="true"','aria-selected="true" aria-controls="adminAccountsPanel"').replace('aria-selected="false"','aria-selected="false" aria-controls="adminBalancesPanel" tabindex="-1"')
components='\n'.join(re.search(r'<section id="'+name+r'".*?</section>',reference,re.S).group() for name in ['teamView','detailView'])
ids=re.findall(r'\bid="([^"]+)"',components)
for old in sorted(ids,key=len,reverse=True):components=re.sub(r'((?:id|for|aria-labelledby)="|(?:id|for|aria-labelledby)=\')'+re.escape(old)+r'(?=["\'])',lambda m:m.group(1)+'tl'+old[0].upper()+old[1:],components)
components=components.replace('>12<','>—<').replace('>3<','>—<').replace('عرض 12 موظفًا — بيانات توضيحية','').replace('فني 01','').replace('فني صيانة كهربائية · MT-001','').replace('<option value="2026">2026</option><option value="2025">2025</option>','')
components=re.sub(r'<p class="mobile-help">.*?</p>','',components)
components=components.replace('id="tlSearch"','id="tlSearch" aria-label="بحث عن موظف"').replace('</label><label class="label-year"','<button type="button" id="tlClearSearch" class="clear-search" aria-label="مسح البحث" hidden>×</button></label><label class="label-year"',1)
components=components.replace('<div class="table-wrap"><table aria-label="جدول أرصدة الفريق">','<p class="scope-note">الأرصدة الحالية مطابقة لصفحة «حسابي». السنة المختارة لتصفية السجلات؛ ليست رصيدًا تاريخيًا.</p><div class="table-wrap"><table aria-label="جدول أرصدة الفريق">')
components=components.replace('</div>\n   </section>', '</div>\n   </section>')
controls='<div class="ledger-paging"><button type="button" id="tlPrev">السابق</button><button type="button" id="tlRefresh">تحديث</button><button type="button" id="tlNext">التالي</button></div>'
components=components.replace('   </section>\n<section id="tlDetailView"',controls+'   </section>\n<section id="tlDetailView"')
# Place list pagination directly after the table caption, independently of whitespace.
if 'id="tlPrev"' not in components:components=components.replace('   </section>',controls+'   </section>',1)
status='<p id="tlStatus" class="ledger-status" role="status" aria-live="polite"></p><button type="button" id="tlRetry" hidden>إعادة المحاولة</button>'
s=s[:a]+admin[:header_end]+'<div class="team-ledger">'+tabs+'</div><div id="adminAccountsPanel" role="tabpanel" aria-labelledby="adminAccountsTab">'+accounts+'</div><div id="adminBalancesPanel" class="team-ledger" role="tabpanel" aria-labelledby="adminBalancesTab" hidden>'+status+components+'</div>'+s[b:]
s=s.replace('</head>','<link rel="stylesheet" href="team-ledger.css">\n</head>').replace('</body>','<script src="team-ledger.js"></script>\n</body>');p.write_text(s)
