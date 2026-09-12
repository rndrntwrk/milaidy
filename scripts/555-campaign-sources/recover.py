from pathlib import Path
import concurrent.futures, gzip, hashlib, json, struct, time
import requests

ROOT = Path('bundle'); ROOT.mkdir(exist_ok=True)
PIN='aa4f70574bff9e13a194969cd510c11927db23ec'
ELIZA='2a62a6d5f4064d408133fc17fe9f2498fd9f552c'
items=[
 ('alice/milady-9.vrm.gz',f'https://media.githubusercontent.com/media/rndrntwrk/milaidy/{PIN}/apps/app/public/vrms/milady-9.vrm.gz','ccbe2ea31713e33d08c1d0cd6be3aab6c90155ff6488ce2d9bc23e86d5d66ac2','lfs_sha256'),
 ('alice/milady-9-repository-preview.png',f'https://raw.githubusercontent.com/rndrntwrk/milaidy/{PIN}/apps/app/public/vrms/previews/milady-9.png','f9822f1c10289b02c6c7275235b180c33ad411cd','git_blob_sha1'),
 ('fomo/logo-original.png','https://fomo.family/logo.png',None,None),
 ('fomo/social-static-original.webp','https://fomo.family/images/landing/social-static.webp',None,None),
]
for p in ['logos/elizaos_logotext.svg','logos/elizaos_logotext_black.svg','logos/elizaOS_text_white.svg','logos/elizaOS_text_black.svg','logos/logo_white_nobg.svg','logos/logo_blue_nobg.svg','logos/logo_orange_nobg.svg','banners/elizaos_banner.svg']:
 items.append(('elizaos/'+p.split('/')[-1],f'https://raw.githubusercontent.com/elizaOS/eliza/{ELIZA}/packages/shared/assets/{p}',None,None))

def fetch(item):
 path,url,expected,kind=item
 dst=ROOT/path; dst.parent.mkdir(parents=True,exist_ok=True)
 record={'file':path,'source_url':url,'status':'failed','retrieved_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 try:
  for attempt in range(3):
   try:
    r=requests.get(url,timeout=(20,180),headers={'User-Agent':'555-Source-Acquisition/1.0'}); r.raise_for_status(); b=r.content; break
   except requests.RequestException:
    if attempt==2: raise
    time.sleep(attempt+1)
  sha=hashlib.sha256(b).hexdigest(); git=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
  if expected: assert (sha if kind=='lfs_sha256' else git)==expected, f'{path}: source identity mismatch'
  assert not b.startswith(b'version https://git-lfs'), 'LFS pointer instead of binary'
  if path.endswith('.png'): assert b[:8]==b'\x89PNG\r\n\x1a\n'
  if path.endswith('.svg'): assert b'<svg' in b[:1000]
  dst.write_bytes(b)
  record.update(status='downloaded',bytes=len(b),sha256=sha,git_blob_sha1=git,identity_check=kind or 'first_party_https',content_type=r.headers.get('Content-Type'))
  if path.endswith('.vrm.gz'):
   raw=gzip.decompress(b); assert raw[:4]==b'glTF'
   assert struct.unpack_from('<I',raw,8)[0]==len(raw)
   n=struct.unpack_from('<I',raw,12)[0]; gltf=json.loads(raw[20:20+n])
   (ROOT/'alice/milady-9.vrm').write_bytes(raw)
   (ROOT/'alice/model-metadata.json').write_text(json.dumps({'source_sha256':sha,'raw_sha256':hashlib.sha256(raw).hexdigest(),'raw_bytes':len(raw),'extensionsUsed':gltf.get('extensionsUsed'),'meta':gltf.get('extensions',{}).get('VRM',{}).get('meta',gltf.get('extensions',{}).get('VRMC_vrm',{}).get('meta')),'meshes':len(gltf.get('meshes',[])),'textures':len(gltf.get('textures',[]))},indent=2))
  print('OK',path,len(b),flush=True)
 except Exception as e:
  record['error']=str(e); print('FAIL',path,str(e),flush=True)
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 records=list(pool.map(fetch,items))
(ROOT/'SOURCE_DOWNLOADS.json').write_text(json.dumps(records,indent=2))
(ROOT/'README.md').write_text('''# 555 campaign source assets

Original files and deterministic captures for a partnership proposal. No campaign image generation is used.

- Alice: exact pinned milady-9 model; original archive checked against its Git LFS SHA-256. Renders are from this rig, not a new character interpretation.
- elizaOS: original vectors from the official repository, pinned to a commit. Related Eliza/ElizaCloud identities are not substituted.
- Fomo: first-party website artwork. Website screenshots may include illustrative financial data: they are marketing references, never 555 results. No fonts are distributed. Extracted SVGs retain original path geometry and colours.
- Game: current public game-page capture when the page loads successfully; build response URLs and hashes are recorded. No autonomous control is claimed.

Source acquisition is not sponsorship approval. See the acquisition and render reports for factual status.
''')
