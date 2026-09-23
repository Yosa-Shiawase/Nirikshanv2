import fs from 'fs'; import path from 'path';
const root='src';
function walk(d){let o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name); if(e.isDirectory())o=o.concat(walk(p)); else o.push(p);}return o;}
const files=walk(root).filter(f=>/\.(jsx|js|css)$/.test(f));
const lc=new Map(files.map(f=>[f.toLowerCase(),f]));
const impRe=/from\s+["'](\.[^"']+)["']/g;
const renames=[], specFix=[];
function resolve(spec,fromFile){
  const base=path.resolve(path.dirname(fromFile),spec);
  for(const ext of ['','.jsx','.js','.css']){
    const k=(base+ext).toLowerCase();
    if(lc.has(k)) return {actual:lc.get(k), cand:base+ext};
  } return null;
}
for(const f of files){
  const src=fs.readFileSync(f,'utf8'); let m;
  impRe.lastIndex=0;
  while((m=impRe.exec(src))){
    const r=resolve(m[1],f); if(!r) continue;
    if(r.actual!==r.cand) renames.push({from:r.actual,to:r.cand});
  }
}
const picked={};
for(const r of renames){
  const k=r.from.toLowerCase();
  if(!picked[k]) picked[k]=r.to;   // first import's casing wins
}
for(const r of renames){ picked[r.from.toLowerCase()]=picked[r.from.toLowerCase()]||r.to; }
// rename files
for(const [lc,to] of Object.entries(picked)){
  const from=lc.get?null:null; // noop
}
for(const k of Object.keys(picked)){
  const actual=lc.get(k); const to=picked[k];
  if(actual && actual!==to && fs.existsSync(actual)){
    fs.renameSync(actual,to);
    console.log('renamed:',actual,'->',to);
    // update map
    lc.delete(actual.toLowerCase()); lc.set(to.toLowerCase(),to);
  }
}
// rewrite import specifiers to actual casing
for(const f of files){
  let src=fs.readFileSync(f,'utf8'); let changed=false;
  src=src.replace(impRe,(full,spec)=>{
    const base=path.resolve(path.dirname(f),spec);
    for(const ext of ['','.jsx','.js','.css']){
      const k=(base+ext).toLowerCase();
      if(lc.has(k)){ const actual=lc.get(k);
        const rel=path.relative(path.dirname(f),actual).split(path.sep).join('/');
        const fixed=rel.startsWith('.')?rel:'./'+rel;
        if(fixed!==spec){changed=true;return `from "${fixed}"`;}
        return full;
      }
    }
    return full;
  });
  // also side-effect imports: import "..."
  if(changed){fs.writeFileSync(f,src);}
}
console.log('case normalization done');
