const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv[2] || 'src/routes/_authenticated/app.agenda.tsx');
const s = fs.readFileSync(file,'utf8');
let i=0; const n=s.length;
const stack=[];
function isNameChar(c){return /[A-Za-z0-9_:\-\.]/.test(c)}
while(i<n){
  const c=s[i];
  if(c==='<' && i+1<n){
    const next=s[i+1];
    if(next==='!'|| next==='?' ) { i++; continue; }
    if(next==='/' ){ // closing tag
      let j=i+2; while(j<n && s[j]!=='>' && j-i<50) j++;
      const name = s.slice(i+2,j).trim().split(/\s+/)[0];
      if(name==='') { i=j+1; continue; }
      const top = stack.length?stack[stack.length-1]:null;
      if(top && top.name===name){ stack.pop(); } else {
        console.log('MISMATCH CLOSE', name, 'at', i);
        // still pop anything matching
        let found=false; for(let k=stack.length-1;k>=0;k--){ if(stack[k].name===name){ stack.splice(k,1); found=true; break; }}
        if(!found) console.log('No matching open for',name,'top stack', stack.slice(-5));
      }
      i=j+1; continue;
    }
    // opening tag or fragment
    if(next==='>'){ // fragment open
      stack.push({name:'<>', pos:i}); i+=2; continue;
    }
    // detect self-closing like <Tag ... />
    let j=i+1; while(j<n && isNameChar(s[j])) j++;
    const name = s.slice(i+1,j);
    if(!/^[A-Za-z]/.test(name)) { i++; continue; }
    // find end of tag
    let k=j; let closed=false; while(k<n){ if(s[k]==='"' || s[k]==="'"){ const q=s[k]; k++; while(k<n && s[k]!==q) k++; k++; continue;} if(s[k]==='>' ) { closed=true; break;} k++; }
    const isSelf = closed && s[k-1]==='/' ;
    if(!isSelf) stack.push({name, pos:i});
    i=k+1; continue;
  }
  if(c==='/' && i+1<n && s[i+1]==='>' ){ // self-closing end handled
    i+=2; continue;
  }
  i++;
}
if(stack.length===0) console.log('All tags matched'); else {
  console.log('Unclosed tags count', stack.length);
  for(const t of stack.slice(-10)) console.log(t.name, 'at', t.pos, '... snippet:', s.slice(Math.max(0,t.pos-30), t.pos+30).replace(/\n/g,' '));
}
