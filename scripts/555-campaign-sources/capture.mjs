import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {chromium} from '/tmp/555-capture/node_modules/playwright/index.mjs';
const root=process.cwd(),out=path.join(root,'bundle');await fs.mkdir(out,{recursive:true});
const report={generated:new Date().toISOString(),renderer:'three@0.180.0 / @pixiv/three-vrm@3.5.3 / Playwright 1.55.0',results:{}};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.vrm':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const base=pathname.startsWith('/node_modules/')?'/tmp/555-capture':root;
 let file=path.resolve(base,'.'+pathname);
 if(!file.startsWith(base+'/'))throw Error('Path outside capture root');
 if(pathname==='/')file=path.join(root,'scripts/555-campaign-sources/avatar.html');
 const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
}catch(e){res.statusCode=404;res.end('not found')}});
await new Promise(r=>server.listen(8090,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1200,height:1600},deviceScaleFactor:1});
try{
 await fs.access(path.join(out,'alice/milady-9.vrm'));
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto('http://127.0.0.1:8090/',{waitUntil:'domcontentloaded',timeout:30000});
 await p.waitForFunction(()=>window.READY||window.RENDER_ERROR,{},{timeout:240000});
 const err=await p.evaluate(()=>window.RENDER_ERROR);if(err)throw Error(err);
 await p.screenshot({path:path.join(out,'alice/milady-9-model-fullbody.png'),omitBackground:true});
 await p.evaluate(()=>window.renderSource('pip'));
 await p.screenshot({path:path.join(out,'alice/milady-9-model-pip.png'),omitBackground:true});
 report.results.alice={status:'rendered_from_original_model',info:await p.evaluate(()=>window.renderInfo),errors};await p.close();
}catch(e){report.results.alice={status:'failed',error:String(e)}}
try{
 await fs.mkdir(path.join(out,'fomo'),{recursive:true});
 const p=await context.newPage();await p.setViewportSize({width:1440,height:1000});
 await p.goto('https://fomo.family/',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(3500);
 await p.screenshot({path:path.join(out,'fomo/official-website-reference.png')});
 const candidates=await p.evaluate(()=>Array.from(document.querySelectorAll('svg')).map((s,i)=>{
  const r=s.getBoundingClientRect(),style=getComputedStyle(s),parent=s.closest('a,header,nav,footer');
  const clone=s.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.style.color=style.color;
  return {i,svg:clone.outerHTML,width:r.width,height:r.height,x:r.x,y:r.y,color:style.color,label:s.getAttribute('aria-label'),parentText:parent?.textContent?.slice(0,100),href:parent?.getAttribute('href')};
 }).filter(s=>s.width>=45&&s.height>=15&&s.width<800&&s.height<300&&s.y<160&&s.y>=0&&s.x<550));
 for(let i=0;i<candidates.length;i++)await fs.writeFile(path.join(out,`fomo/website-logo-candidate-${String(i+1).padStart(2,'0')}.svg`),candidates[i].svg);
 const info=await p.evaluate(()=>({title:document.title,url:location.href,background:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color,images:Array.from(document.images).map(i=>({src:i.currentSrc||i.src,alt:i.alt})).filter(i=>/logo|brand|fomo/i.test(i.src+' '+i.alt))}));
 report.results.fomo={status:'website_captured',...info,candidates:candidates.map(({svg,...r})=>r)};await p.close();
}catch(e){report.results.fomo={status:'failed',error:String(e)}}
try{
 await fs.mkdir(path.join(out,'gameplay'),{recursive:true});
 const p=await context.newPage();await p.setViewportSize({width:1920,height:1080});const errors=[],sources=[];p.on('pageerror',e=>errors.push(String(e)));
 p.on('response',async r=>{try{if(new URL(r.url()).origin==='https://555.rndrntwrk.com'&&/\.(js|html)(\?|$)/.test(r.url())){const b=await r.body();sources.push({url:r.url(),status:r.status(),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}}catch{}});
 await p.goto('https://555.rndrntwrk.com/games/555drive/index.html',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(6000);
 const canvases=await p.locator('canvas').count();if(!canvases)throw Error('No actual game canvas found at public entrypoint');
 await p.screenshot({path:path.join(out,'gameplay/555-drive-startup-1920x1080.png')});
 const boxes=await p.locator('canvas').evaluateAll(cs=>cs.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}).sort((a,b)=>b.width*b.height-a.width*a.height));const b=boxes[0];
 await p.mouse.click(b.x+b.width/2,b.y+b.height/2);await p.keyboard.press('Space');await p.keyboard.down('ArrowUp');await p.waitForTimeout(5000);await p.keyboard.up('ArrowUp');
 await p.screenshot({path:path.join(out,'gameplay/555-drive-current-1920x1080.png')});
 await p.keyboard.down('Space');await p.waitForTimeout(3000);await p.keyboard.up('Space');
 await p.screenshot({path:path.join(out,'gameplay/555-drive-current-alt-1920x1080.png')});
 report.results.game={status:'captured_public_game',url:p.url(),canvas:boxes[0],sources,errors,control:'Scripted keyboard input in a local browser; not an Alice-controlled or livestream recording'};await p.close();
}catch(e){report.results.game={status:'failed',error:String(e)}}
await fs.writeFile(path.join(out,'CAPTURE_REPORT.json'),JSON.stringify(report,null,2));
await browser.close();server.close();console.log(JSON.stringify(report,null,2));
