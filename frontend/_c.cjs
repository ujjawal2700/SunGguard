const esbuild=require("esbuild"),fs=require("fs");let bad=0;
for(const f of process.argv.slice(2)){try{esbuild.transformSync(fs.readFileSync(f,"utf8"),{loader:"jsx"});console.log("OK  ",f);}catch(e){bad++;console.log("FAIL",f,"\n   ",(e.errors||[]).map(x=>`${x.location?.line}: ${x.text}`).join("\n    "));}}
process.exit(bad?1:0);
