// Mechanical UI rules: each check names the failure it prevents. Rules that need judgement
// (states, keyboard walk-through, screenshots) stay in review; anything expressible as
// "X appears" or "X without Y" lives here so it cannot regress silently.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Skeuomorphic shelf, book card and the embedded Hacker Books page draw fixed physical colors. */
const FIXED_PALETTE=/\.(gr-shelf|gr-spine|gr-bookcard|gr-bookplate|gr-hb|gr-hackerbooks)/;
/** Wrapper classes that say nothing about which control is being styled. */
const GENERIC=new Set(['gloss-root','banana-reader','gr-settings','gloss-mobile']);
/** A <button> grid item does not grow with its content in Chromium; the card wires keyboard and focus by hand. */
const ROLE_BUTTON_EXCEPTIONS=new Set(['gr-cloud-card']);
/** Errors relayed from a named service lead with the service name, the way a data label does. */
const SOURCE_LABELS=new Set(['Z-Library']);
const MAX_TRANSITION_MS=300;
const MIN_FONT_PX=10;

/** Flat list of style rules; at-rule wrappers are dropped, @font-face is skipped. */
export function cssRules(text){
  const clean=text.replace(/\/\*[\s\S]*?\*\//g,''),rules=[],re=/([^{}]+)\{([^{}]*)\}/g;let m;
  while((m=re.exec(clean))){
    const selector=m[1].trim();if(selector.startsWith('@'))continue;
    const decls=[];for(const part of m[2].split(';')){const i=part.indexOf(':');if(i>0)decls.push({prop:part.slice(0,i).trim().toLowerCase(),value:part.slice(i+1).trim()});}
    rules.push({selector,decls});
  }
  return rules;
}
function isNeutral(color){
  if(color.startsWith('#')){let hex=color.slice(1);if(hex.length<=4)hex=[...hex].map(c=>c+c).join('');const rgb=hex.slice(0,6).toLowerCase();return rgb==='000000'||rgb==='ffffff';}
  const n=color.match(/\d+(?:\.\d+)?/g)||[];return (n[0]==='0'&&n[1]==='0'&&n[2]==='0')||(n[0]==='255'&&n[1]==='255'&&n[2]==='255');
}
function splitTop(value){const parts=[];let depth=0,start=0;for(let i=0;i<value.length;i++){const c=value[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){parts.push(value.slice(start,i));start=i+1;}}parts.push(value.slice(start));return parts;}
const toMs=(n,unit)=>unit==='s'?Number(n)*1000:Number(n);
const classes=selector=>[...selector.matchAll(/\.([\w-]+)/g)].map(m=>m[1]).filter(c=>!GENERIC.has(c));

export function checkCss(text){
  const problems=[],rules=cssRules(text);
  const focusContainers=rules.filter(r=>r.selector.includes(':has(')&&r.selector.includes(':focus-visible')).map(r=>r.selector);
  for(const {selector,decls} of rules){
    const where=selector.length>90?selector.slice(0,87)+'…':selector,custom=d=>d.prop.startsWith('--');
    for(const d of decls){
      if(/!important/.test(d.value))problems.push(`${where}: !important overrides the cascade for every theme and snippet`);
      if(d.prop==='font-size'||d.prop==='font'){
        const size=d.prop==='font-size'?d.value.match(/^(\d*\.?\d+)px$/):d.value.match(/(?:^|\s)(\d*\.?\d+)px(?=$|[\s/])/);
        if(size&&!Number.isInteger(Number(size[1])))problems.push(`${where}: ${d.prop} ${size[1]}px is off the integer type scale`);
        else if(size&&Number(size[1])<MIN_FONT_PX)problems.push(`${where}: ${size[1]}px text is below the ${MIN_FONT_PX}px floor`);
      }
      if(d.prop==='color'&&d.value.includes('var(--ink-4)'))problems.push(`${where}: --ink-4 text falls below 4.5:1 contrast; use --ink-3`);
      if(d.prop==='transition'||d.prop==='transition-duration')for(const item of splitTop(d.value)){
        const t=item.match(/(\d*\.?\d+)(ms|s)\b/);if(t&&toMs(t[1],t[2])>MAX_TRANSITION_MS)problems.push(`${where}: ${t[0]} transition exceeds ${MAX_TRANSITION_MS}ms`);
      }
      if(!custom(d)&&!FIXED_PALETTE.test(selector))for(const color of d.value.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)||[])
        if(!isNeutral(color))problems.push(`${where}: raw color ${color} in ${d.prop}; read it from a custom property so themes stay in one place`);
    }
    const outline=decls.find(d=>d.prop==='outline'&&/^(none|0)$/.test(d.value));
    if(outline&&(/:focus/.test(selector)||/\b(input|textarea|select)\b/.test(selector))){
      const replaced=decls.some(d=>(d.prop==='border-color'||d.prop==='box-shadow')&&d.value!=='none'&&d.value!=='transparent');
      const tokens=classes(selector),contained=focusContainers.some(s=>tokens.some(t=>s.includes('.'+t)));
      if(!replaced&&!contained)problems.push(`${where}: outline removed without a visible focus replacement (same rule, or a container :has(…:focus-visible) rule)`);
    }
  }
  return problems;
}

/** Chinese and English UI copy: no colons outside data labels, no filler words. */
export function checkCopy(catalog){
  const problems=[];
  const zhColon=/：(?!$|\{)/g,zhAllowed=(text,i)=>/(例如|HTTP \d+）?)$/.test(text.slice(0,i))||SOURCE_LABELS.has(text.slice(0,i));
  const enColon=/: (?!$|\{)/g,enAllowed=(text,i)=>/(HTTP \d+\)?)$/.test(text.slice(0,i))||SOURCE_LABELS.has(text.slice(0,i));
  for(const [zh,en] of Object.entries(catalog)){
    for(const m of zh.matchAll(zhColon))if(!zhAllowed(zh,m.index))problems.push(`"${zh}": a colon in UI copy outside a data label`);
    for(const m of en.matchAll(enColon))if(!enAllowed(en,m.index))problems.push(`"${en}": a colon in UI copy outside a data label`);
    if(en!=='Just now'&&/\b(simply|just|seamlessly|effortlessly)\b/i.test(en))problems.push(`"${en}": filler word in UI copy`);
  }
  return problems;
}

/** Runtime source: no non-button elements acting as buttons, no positive tab order. */
export function checkSource(text,file='source'){
  const problems=[];
  for(const m of text.matchAll(/create(?:Div|Span|El\('(?!button)\w+')\(?\{[^;]*?cls:'([\w-]+)[^;]*?role:'button'/g))
    if(!ROLE_BUTTON_EXCEPTIONS.has(m[1]))problems.push(`${file}: .${m[1]} uses role="button" on a non-button element`);
  if(/setAttribute\('role','button'\)/.test(text))problems.push(`${file}: setAttribute('role','button') on a non-button element`);
  if(/tabindex['"]?\s*[:,]\s*['"][1-9]|tabIndex\s*=\s*[1-9]/.test(text))problems.push(`${file}: positive tabindex breaks the reading order`);
  return problems;
}

async function main(){
  const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
  const catalog=Object.fromEntries([...read('src/i18n.ts').matchAll(/^ {2}"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)",?$/gm)].map(m=>[JSON.parse('"'+m[1]+'"'),JSON.parse('"'+m[2]+'"')]));
  const sources=readdirSync(new URL('src/',root)).filter(name=>name.endsWith('.ts')).map(name=>'src/'+name);
  const problems=[...checkCss(read('styles.css')),...checkCopy(catalog),...sources.flatMap(f=>checkSource(read(f),f))];
  if(problems.length){console.error(problems.map(p=>'✖ '+p).join('\n')+`\n${problems.length} UI rule violation(s).`);process.exit(1);}
  console.log('UI rules passed.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
