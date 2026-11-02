import json, math
from shapely.geometry import shape, box, Point, mapping, Polygon, MultiPolygon
from shapely.ops import transform
from shapely import make_valid
LON0,LAT0=68.0,33.0
R=6371.0
l0=math.radians(LON0); p0=math.radians(LAT0)
def laea(lon,lat):
    l=math.radians(lon)-l0; p=math.radians(lat)
    k=math.sqrt(2/(1+math.sin(p0)*math.sin(p)+math.cos(p0)*math.cos(p)*math.cos(l)))
    x=R*k*math.cos(p)*math.sin(l); y=R*k*(math.cos(p0)*math.sin(p)-math.sin(p0)*math.cos(p)*math.cos(l))
    return x,-y
def proj(g):
    return transform(lambda xs,ys,zs=None: tuple(zip(*[laea(a,b) for a,b in zip(xs,ys)])) if False else _t(xs,ys), g)
def _t(xs,ys):
    out=[laea(a,b) for a,b in zip(xs,ys)]
    return [o[0] for o in out],[o[1] for o in out]
REGION={'TUR':'튀르키예','SYR':'시리아','LBN':'레바논','ISR':'이스라엘','PSX':'팔레스타인','JOR':'요르단','IRQ':'이라크','IRN':'이란','SAU':'사우디아라비아','KWT':'쿠웨이트','BHR':'바레인','QAT':'카타르','ARE':'아랍에미리트','OMN':'오만','YEM':'예멘','CYP':'키프로스','CYN':'키프로스',
 'GEO':'조지아','ARM':'아르메니아','AZE':'아제르바이잔','KAZ':'카자흐스탄','UZB':'우즈베키스탄','TKM':'투르크메니스탄','KGZ':'키르기스스탄','TJK':'타지키스탄',
 'AFG':'아프가니스탄','PAK':'파키스탄','IND':'인도','NPL':'네팔','BTN':'부탄','BGD':'방글라데시','LKA':'스리랑카','MDV':'몰디브'}
GROUP={**{k:'서남아시아' for k in ['TUR','SYR','LBN','ISR','PSX','JOR','IRQ','IRN','SAU','KWT','BHR','QAT','ARE','OMN','YEM','CYP','CYN']},
 **{k:'코카서스' for k in ['GEO','ARM','AZE']},**{k:'중앙아시아' for k in ['KAZ','UZB','TKM','KGZ','TJK']},
 **{k:'남부아시아' for k in ['AFG','PAK','IND','NPL','BTN','BGD','LKA','MDV']},'XJ':'중국(신장)','XZ':'중국(티베트)'}
CTX_NAMES={'RUS':'러시아','CHN':'중국','MNG':'몽골','EGY':'이집트','SDN':'수단','ERI':'에리트레아','ETH':'에티오피아','DJI':'지부티','SOM':'소말리아','MMR':'미얀마','UKR':'우크라이나','GRC':'그리스','BGR':'불가리아'}
# view bbox in projected km
corners=[laea(lo,la) for lo,la in [(26,46),(100,46),(26,4),(100,4),(63,56),(63,0),(28,30),(98,28)]]
xs=[c[0] for c in corners]; ys=[c[1] for c in corners]
VB=box(min(xs)-150,min(ys)-150,max(xs)+150,max(ys)+150)
print('view',[round(v) for v in VB.bounds])
w=json.load(open('data/ne_50m_admin_0_countries.geojson'))
feats=[]
def addf(code,name,g,region,tol):
    g=make_valid(g); g=proj(g).intersection(VB)
    if g.is_empty: return None
    g=g.simplify(tol,preserve_topology=True)
    polys=[p for p in (g.geoms if hasattr(g,'geoms') else [g]) if p.geom_type=='Polygon' and p.area>(20 if region else 300)]
    if not polys and code=='MDV':
        polys=[p for p in (g.geoms if hasattr(g,'geoms') else [g]) if p.geom_type=='Polygon']
    if not polys: return None
    return {'code':code,'name':name,'region':region,'group':GROUP.get(code),'polys':polys}
china=None
for f in w['features']:
    p=f['properties']; a3=p['ADM0_A3']
    g=shape(f['geometry'])
    if a3 in REGION:
        r=addf(a3,REGION[a3],g,True,2.5)
    else:
        if a3=='CHN': china=g
        r=addf(a3,CTX_NAMES.get(a3,p.get('NAME_KO') or p['NAME']),g,False,5)
    if r: feats.append(r)
a1=json.load(open('data/ne_10m_admin_1_states_provinces.geojson'))
for f in a1['features']:
    p=f['properties']
    if p.get('adm0_a3')=='CHN' and p.get('name') in ('Xinjiang','Xizang'):
        code='XJ' if p['name']=='Xinjiang' else 'XZ'
        r=addf(code,'신장' if code=='XJ' else '티베트(시짱)',shape(f['geometry']),True,2.5)
        feats.append(r); print('added',code)
# anchors
out={'view':[round(v) for v in VB.bounds],'countries':[],'context':[]}
def path(polys):
    d=[]
    for pg in polys:
        for ring in [pg.exterior]+list(pg.interiors):
            c=list(ring.coords)[:-1]
            d.append('M'+'L'.join(f'{x:.0f} {y:.0f}' for x,y in c)+'Z')
    return ''.join(d)
merged={}
for r in feats:
    if r['region']:
        k='CYP' if r['code']=='CYN' else r['code']
        merged.setdefault(k,{'code':k,'name':r['name'],'group':r['group'],'polys':[]})['polys']+=r['polys']
    else:
        out['context'].append({'code':r['code'],'d':path(r['polys'])})
for k,m in merged.items():
    big=max(m['polys'],key=lambda p:p.area)
    a=big.representative_point()
    # better anchor: centroid if inside
    c=big.centroid
    if big.buffer(-30).contains(c): a=c
    out['countries'].append({'code':k,'name':m['name'],'group':m['group'],'d':path(m['polys']),'ax':round(a.x),'ay':round(a.y)})
SPOTS=[('kashmir','카슈미르',75.6,34.2),('hormuz','호르무즈 해협',56.4,26.55),('babelmandeb','바브엘만데브 해협',43.4,12.7),('fergana','페르가나 분지',71.6,40.6),('caspian','카스피해',50.8,41.8),('aral','아랄해',59.8,45.2),('indus','인더스강 유역',70.3,28.6),('tigris','티그리스·유프라테스강',41.0,36.6),('amudarya','아무다리야강',65.8,37.6),('ganges','갠지스·브라마푸트라강',89.6,24.3)]
out['spots']=[{'id':i,'name':n,'x':round(laea(lo,la)[0]),'y':round(laea(lo,la)[1])} for i,n,lo,la in SPOTS]
json.dump(out,open('geo.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print('bytes',os.path.getsize('geo.json'),'region',len(out['countries']),'ctx',len(out['context']))
print(sorted(c['code'] for c in out['countries']))
