'use strict';
const output = document.querySelector('#output');
const input = document.querySelector('#command-input');
const body = document.querySelector('#terminal-body');
const suggestions = document.querySelector('#suggestions');
const typingLayer = document.querySelector('#typing-layer');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const textMeasure = document.createElement('canvas').getContext('2d');
function finishTyping(){typingLayer.replaceChildren();}
function revealTypedCharacters(event){
 finishTyping();
 // Pasting, deletion, autocomplete and IME composition remain immediate.
 if(reducedMotion.matches || event.isComposing || event.inputType !== 'insertText' || !event.data || !textMeasure) return;
 const end = input.selectionStart;
 const start = end - event.data.length;
 if(start < 0 || input.value.slice(start,end) !== event.data) return;
 textMeasure.font = window.getComputedStyle(input).font;
 const left = textMeasure.measureText(input.value.slice(0,start)).width - input.scrollLeft;
 const width = textMeasure.measureText(input.value.slice(0,end)).width - textMeasure.measureText(input.value.slice(0,start)).width;
 const reveal = el('span',undefined,'typing-reveal');
 reveal.style.left = left + 'px';
 reveal.style.width = width + 'px';
 reveal.addEventListener('animationend',()=>reveal.remove(),{once:true});
 typingLayer.append(reveal);
}
reducedMotion.addEventListener('change',finishTyping);
['beforeinput','compositionstart','scroll','blur','pointerdown'].forEach(type=>input.addEventListener(type,finishTyping));
const history = [];
let historyIndex = 0;
let draft = '';
const commands = {help:'Show available commands',about:'Meet Me',projects:'Explore what I build',blog:'Read notes and posts',socials:'Find me elsewhere',funding:'Support me and my work',motd:'Show the welcome message',clear:'Clear the terminal',date:'Show your local date',whoami:'Find out who you are',version:'Show the build, commit and branch',theme:'View or set the theme (system, latte, frappe, macchiato, mocha)'};
// Familiar shell names map onto the commands above. A string is a plain alias; an array adds preset arguments.
const aliases={ls:'help',ll:'help',dir:'help',man:'help',h:'help','?':'help','--help':'help','-h':'help',commands:'help',menu:'help',
 me:'about',bio:'about',info:'about',whois:'about',finger:'about',
 project:'projects',work:'projects',code:'projects',repos:'projects',portfolio:'projects',
 posts:'blog',post:'blog',read:'blog',cat:'blog',less:'blog',notes:'blog',writing:'blog',
 social:'socials',contact:'socials',links:'socials',connect:'socials',email:'socials',
 support:'funding',sponsor:'funding',donate:'funding',tip:'funding',
 welcome:'motd',banner:'motd',hello:'motd',hi:'motd',home:'motd',
 cls:'clear',reset:'clear',c:'clear',
 ver:'version','-v':'version','--version':'version',build:'version',commit:'version',git:'version',
 time:'date',now:'date',
 id:'whoami',who:'whoami',w:'whoami',
 themes:'theme',color:'theme',colors:'theme',colour:'theme',dark:['theme','mocha'],light:['theme','latte']};
const aliasesFor=name=>Object.keys(aliases).filter(a=>(Array.isArray(aliases[a])?aliases[a][0]:aliases[a])===name&&!Array.isArray(aliases[a]));
function resolveCommand(word,args){
 if(Object.hasOwn(commands,word)) return {name:word,args,alias:undefined};
 if(Object.hasOwn(aliases,word)){const target=aliases[word];const [name,...preset]=Array.isArray(target)?target:[target];return {name,args:preset.length?preset.concat(args):args,alias:word};}
 return {name:word,args,alias:undefined};
}
// Suggest a close command (or alias) for a typo, using a small edit-distance check.
function closestCommand(word){
 const distance=(a,b)=>{const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const tmp=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp;}}return row[b.length];};
 const word32=word.slice(0,32);let best,bestScore=3;
 Object.keys(commands).forEach(c=>{const d=distance(word32,c);if(d<bestScore||(d<=2&&d===bestScore&&!best)){best=c;bestScore=d;}});
 return bestScore<=2&&bestScore<Math.max(word32.length,1)?best:undefined;
}
// Analytics is optional: terminalAnalytics may be missing, disabled or blocked.
const loadedAt = Date.now();
const entryCommands = new WeakMap();
let reading = null;
function track(event, properties, options){ try { window.terminalAnalytics?.track(event, properties, options); } catch { /* Never let analytics break a command. */ } }
function measureReading(){
 if(!reading || typeof reading.result.getBoundingClientRect !== 'function') return;
 const rect=reading.result.getBoundingClientRect();
 if(rect.height <= 0) return;
 const seen=(body.getBoundingClientRect().bottom-rect.top)/rect.height;
 reading.depth=Math.max(reading.depth,Math.round(Math.min(1,Math.max(0,seen))*100));
}
function startReading(post, result){ reading={slug:post.slug,title:post.title,result,startedAt:Date.now(),depth:0}; measureReading(); }
function finishReading(reason){
 if(!reading) return;
 measureReading();
 const finished=reading; reading=null;
 track('post_read',{slug:finished.slug,title:finished.title,seconds:Math.round((Date.now()-finished.startedAt)/1000),scroll_depth:finished.depth,reason},reason==='hidden'?{transport:'sendBeacon'}:undefined);
}
body.addEventListener('scroll',measureReading,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') finishReading('hidden');});
window.addEventListener('pagehide',()=>finishReading('hidden'));
function trackLink(event){
 const anchor=event.target.closest?.('a[href]');
 if(!anchor || event.type==='auxclick' && event.button!==1) return;
 let url; try { url=new URL(anchor.href); } catch { return; }
 track('link_clicked',{
   label:anchor.textContent.replace(/\s*↗$/,'').trim().slice(0,80),
   url:url.protocol==='mailto:'?'mailto:':url.href,
   host:url.hostname,
   outbound:url.origin!==window.location?.origin,
   section:entryCommands.get(anchor.closest('.entry'))||'page',
   in_post:Boolean(anchor.closest('.markdown-body')),
   post_slug:reading && reading.result.contains(anchor)?reading.slug:undefined
 },{transport:'sendBeacon'});
}
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function link(item) { const a = el('a', item.name + ' ↗'); try { const url = new URL(item.url); if (!['https:', 'http:'].includes(url.protocol)) return el('span', item.name); a.href = url.href; } catch { return el('span', item.name); } a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function paragraph(parent, text, className) {parent.append(el('p', text, className));}
function listing(parent, items) { items.forEach(item => {const p = el('p'); p.append(link(item)); parent.append(p);}); }
function scrollToPrompt(){body.scrollTop = body.scrollHeight;}
const blogPageSize = 5;
let blogSelection = null;
let blogSelectionId = 0;
function closeBlogSelection(){
 if(!blogSelection) return;
 blogSelection.buttons.forEach(button=>{button.disabled=true;button.removeAttribute('aria-pressed');});
 blogSelection.status.textContent='Selection closed. Type blog to browse again.';
 blogSelection=null;
 input.removeAttribute('aria-describedby');
}
function clear(){finishReading('clear');closeBlogSelection(); output.replaceChildren(); document.querySelector('#welcome').hidden = true; suggestions.textContent = '';}
function highlightBlogChoice(index){
 if(!blogSelection) return;
 blogSelection.index=index;
 blogSelection.buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
 blogSelection.status.textContent='Selected '+blogSelection.buttons[index].textContent;
}
async function chooseBlogOption(index){
 const selection=blogSelection;
 if(!selection) return;
 if(!Number.isInteger(index) || index<0 || index>=selection.choices.length){
   selection.status.textContent='Choose a number from 1 to '+selection.choices.length+'.';
   return;
 }
 input.value=''; finishTyping();
 const choice=selection.choices[index];
 if(choice==='exit'){closeBlogSelection();input.focus({preventScroll:true});return;}
 if(choice==='next'){selection.page++;renderBlogPage();track('blog_page_viewed',{page:selection.page+1,page_count:Math.ceil(selection.posts.length/blogPageSize)});input.focus({preventScroll:true});scrollToPrompt();return;}
 closeBlogSelection();
 await run('blog '+choice.slug,'selection');
}
function renderBlogPage(){
 const selection=blogSelection;
 const start=selection.page*blogPageSize;
 const posts=selection.posts.slice(start,start+blogPageSize);
 selection.choices=['exit',...posts];
 if(start+blogPageSize<selection.posts.length) selection.choices.push('next');
 selection.list.replaceChildren();
 selection.buttons=selection.choices.map((choice,index)=>{
   const label=choice==='exit'?'Exit Selection':choice==='next'?'View Next Page':choice.title+' · '+choice.date;
   const button=el('button',(index+1)+') '+label,'blog-choice');
   button.type='button';
   button.addEventListener('click',()=>{if(blogSelection===selection)return chooseBlogOption(index);});
   button.addEventListener('keydown',event=>{
     if(event.isComposing || blogSelection!==selection) return;
     if(event.key==='ArrowUp' || event.key==='ArrowDown'){
       event.preventDefault();
       highlightBlogChoice((index+(event.key==='ArrowDown'?1:-1)+selection.choices.length)%selection.choices.length);
       selection.buttons[selection.index].focus({preventScroll:true});
     }
     if(/^\d$/.test(event.key)){
       event.preventDefault(); input.value=event.key; input.focus({preventScroll:true});
       const number=Number(event.key)-1;
       if(number>=0 && number<selection.choices.length) highlightBlogChoice(number);
     }
     if(event.key==='l' && event.ctrlKey){event.preventDefault();clear();input.focus({preventScroll:true});}
     if(event.key==='Escape'){event.preventDefault();input.value='';closeBlogSelection();input.focus({preventScroll:true});}
   });
   selection.list.append(button);
   return button;
 });
 selection.pageLabel.textContent='Page '+(selection.page+1)+' of '+Math.ceil(selection.posts.length/blogPageSize);
 highlightBlogChoice(posts.length?1:0);
}
function openBlogSelection(result,posts){
 closeBlogSelection();
 const hint=el('p','Use ↑ / ↓ and Enter, or type a number and press Enter. Escape exits selection.','muted');
 hint.id='blog-selection-'+(++blogSelectionId);
 const pageLabel=el('p',undefined,'muted');
 const list=el('div',undefined,'blog-selection');
 list.setAttribute('role','group');list.setAttribute('aria-label','Blog selection');
 const status=el('p',undefined,'blog-selection-status');status.setAttribute('role','status');
 result.append(hint,pageLabel,list,status);
 blogSelection={posts:posts.slice(),page:0,index:0,buttons:[],choices:[],list,status,pageLabel};
 input.setAttribute('aria-describedby',hint.id);
 renderBlogPage();
 const selectorProperties={post_count:posts.length,page_count:Math.ceil(posts.length/blogPageSize),filtered:posts.length!==SITE.posts.length};
 const postSource=window.terminalRemote?.source('posts'); if(postSource) selectorProperties.config_source=postSource;
 track('blog_selector_opened',selectorProperties);
}
async function renderPost(result, post) {
 if(typeof post.file !== 'string') {
   if(typeof post.markdown === 'string') window.blogMarkdown.render(result,post.markdown);
   else (post.body || []).forEach(p=>paragraph(result,p));
   return true;
 }
 const status=el('p','Loading Markdown…','muted');
 status.setAttribute('role','status'); result.append(status);
 try {
   const url=new URL(post.file,document.baseURI);
   if(url.origin !== new URL(document.baseURI).origin || !/\.md$/i.test(url.pathname)) throw Error('Invalid Markdown file');
   const response=await fetch(url.href);
   if(!response.ok) throw Error('HTTP ' + response.status);
   const source=await response.text();
   if(/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Expected Markdown, received HTML');
   const reader=window.blogMarkdown.render(result,source);
   // Assets are relative to the Markdown file, not the terminal page.
   reader.querySelectorAll('a[href], img[src]').forEach(element=>{
     const attribute=element.tagName === 'IMG' ? 'src' : 'href';
     const value=element.getAttribute(attribute);
     if(value && !value.startsWith('#')) element.setAttribute(attribute,new URL(value,url).href);
   });
   status.remove();
   return true;
 } catch (error) {
   status.textContent='Could not load Markdown file. Check its path and try the blog command again.';
   status.className='error';
   track('post_load_failed',{slug:post.slug||'markdown-demo',file:post.file,reason:String(error?.message||error).slice(0,80)});
   return false;
 }
}
// Sections that PostHog can switch off. Their commands stay listed and print a notice instead.
const disabledNotices={blog:'The blog is switched off right now. Check back soon.',funding:'Funding links are switched off right now.',projects:'Projects are switched off right now.'};
// Build details come from dist/version.json, written by scripts/version.js at dev and deploy time.
let versionInfo;
async function loadVersion(){
 if(versionInfo) return versionInfo;
 const url=new URL('version.json',document.baseURI);
 if(url.origin !== new URL(document.baseURI).origin) throw Error('Invalid build file');
 const response=await fetch(url.href,{cache:'no-store'});
 if(!response.ok) throw Error('HTTP ' + response.status);
 if(/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Expected JSON, received HTML');
 const data=await response.json();
 if(!data || typeof data !== 'object' || !data.commit || typeof data.commit !== 'object') throw Error('Malformed build file');
 const text=(value,max=300)=>typeof value==='string'?value.slice(0,max):'';
 const count=value=>Number.isFinite(value)?value:0;
 versionInfo={
   branch:text(data.branch,100),author:text(data.author,100),committer:text(data.committer,100),
   coAuthors:Array.isArray(data.coAuthors)?data.coAuthors.slice(0,10).map(name=>text(name,100)).filter(Boolean):[],
   commitCount:count(data.commitCount),dirty:data.dirty===true,generatedAt:text(data.generatedAt,40),
   commit:{hash:text(data.commit.hash,64),short:text(data.commit.short,16),subject:text(data.commit.subject),body:text(data.commit.body,2000),
     authoredAt:text(data.commit.authoredAt,40),committedAt:text(data.commit.committedAt,40),url:text(data.commit.url,300),
     tags:Array.isArray(data.commit.tags)?data.commit.tags.slice(0,10).map(tag=>text(tag,100)).filter(Boolean):[],
     parents:count(data.commit.parents),files:count(data.commit.files),insertions:count(data.commit.insertions),deletions:count(data.commit.deletions)}
 };
 return versionInfo;
}
function renderVersion(result,info){
 const when=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
 const {commit}=info;
 const rows=[['Branch',info.branch],['Commit',commit.url?link({name:commit.short||commit.hash.slice(0,7),url:commit.url}):commit.short||commit.hash],['Message',commit.subject]];
 if(commit.body) rows.push(['Details',commit.body]);
 rows.push(['Author',info.author]);
 if(info.coAuthors.length) rows.push(['Co-authors',info.coAuthors.join(', ')]);
 if(info.committer && info.committer!==info.author) rows.push(['Committer',info.committer]);
 rows.push(['Authored',when(commit.authoredAt)]);
 if(commit.committedAt && commit.committedAt!==commit.authoredAt) rows.push(['Committed',when(commit.committedAt)]);
 if(commit.tags.length) rows.push(['Tags',commit.tags.join(', ')]);
 rows.push(['Changes',commit.files+' file'+(commit.files===1?'':'s')+' · +'+commit.insertions+' −'+commit.deletions]);
 if(commit.parents>1) rows.push(['Parents',String(commit.parents)+' (merge)']);
 rows.push(['History',info.commitCount+' commit'+(info.commitCount===1?'':'s')+' on this branch']);
 rows.push(['Working tree',info.dirty?'Built with uncommitted changes':'Clean']);
 if(info.generatedAt) rows.push(['Built',when(info.generatedAt)]);
 const dl=el('dl','', 'version-info');
 rows.filter(([,value])=>value!=='').forEach(([label,value])=>{
   const dt=el('dt',label); const dd=el('dd'); if(typeof value==='string') dd.textContent=value; else dd.append(value);
   if(label==='Details') dd.className='version-body';
   dl.append(dt,dd);
 });
 result.append(dl);
}
// Commands that read remotely configurable content re-check PostHog each time they run.
const remoteBacked=['blog','funding','projects','socials'];
function trackCommand(name,args,source,alias){
 const known=Object.hasOwn(commands,name);
 const properties={command:known?name:'unknown',source,argument_count:args.length,command_number:history.length,seconds_since_load:Math.round((Date.now()-loadedAt)/1000)};
 // Only the first word of an unknown command is kept, never its arguments.
 if(!known) properties.attempted=name.slice(0,32);
 if(alias) properties.alias=alias;
 const query=args.join(' ');
 if(name==='theme' && args.length===1 && window.terminalTheme.options.includes(query.toLowerCase())) properties.argument=query.toLowerCase();
 if(name==='blog' && args.length) properties.argument=query==='--demo'?'--demo':/^\d{4}-\d{2}-\d{2}$/.test(query)?'date':'slug';
 track('terminal_command',properties);
}
function trackPostOpened(post,via){
 const properties={slug:post.slug||'markdown-demo',title:post.title||'Markdown reader',date:post.date,via,format:typeof post.file==='string'?'file':typeof post.markdown==='string'?'markdown':'legacy'};
 const source=window.terminalRemote?.source('posts'); if(source) properties.config_source=source;
 track('post_opened',properties);
}
async function run(raw, source='typed'){
 finishTyping();
 const value = raw.trim();
 if(blogSelection && (!value || /^\d+$/.test(value))){await chooseBlogOption(value?Number(value)-1:blogSelection.index);return;}
 if(!value) return;
 closeBlogSelection();
 finishReading('command');
 history.push(value); historyIndex = history.length; draft = ''; input.value = ''; suggestions.textContent = '';
 const [command,...typedArgs] = value.split(/\s+/); const {name,args,alias} = resolveCommand(command.toLowerCase(),typedArgs);
 trackCommand(name,args,source,alias);
 if(name === 'clear'){clear(); input.focus({preventScroll:true}); return;}
 const entry=el('section',undefined,'entry'); entry.append(el('div','visitor@adamgdegr:~ ❯ ' + value,'echo')); const result=el('div',undefined,'result'); entry.append(result); output.append(entry);
 entryCommands.set(entry,Object.hasOwn(commands,name)?name:'unknown');
 const current=()=>entry.isConnected !== false && !(output.lastElementChild && output.lastElementChild !== entry);
 let readingPost=false;
 const startPost=()=>{
   readingPost=true;
   // Leave enough room below even a one-line post to align its command at the top.
   entry.style.minHeight=body.clientHeight+'px';
   scrollToPost();
 };
 const scrollToPost=()=>{
   if(entry.isConnected === false || output.lastElementChild && output.lastElementChild !== entry) return;
   body.scrollTop=entry.offsetTop-body.offsetTop;
 };
 const heading = text => result.append(el('h2',text));
 if(remoteBacked.includes(name) && window.terminalRemote?.live){
   // Re-check PostHog on every use so payload edits apply without a reload.
   const loading=el('p','Loading…','muted'); loading.setAttribute('role','status'); result.append(loading);
   try { await window.terminalRemote.refresh(); } catch { /* Fall back to the last known values. */ }
   loading.remove();
   if(!current()) return;
 }
 const disabled=Object.hasOwn(disabledNotices,name) && window.terminalRemote?.enabled(name)===false;
 if(disabled){
   paragraph(result,disabledNotices[name]);
   track('section_disabled',{command:name});
 } else switch(name){
 case 'help': heading('A few places to go'); {const dl=el('dl'); Object.entries(commands).forEach(([cmd,desc])=>{const dt=el('dt'); dt.append(el('code',cmd)); const dd=el('dd',desc); const names=aliasesFor(cmd); if(names.length) dd.append(el('span',' · also: '+names.slice(0,4).join(', '),'muted')); dl.append(dt,dd);}); result.append(dl); paragraph(result,'Shell habits work too: ls lists these commands, cat SLUG reads a post, dark and light switch themes.','muted'); paragraph(result,'Use ↑ / ↓ for history, Tab to complete, or Ctrl L to clear.','muted');} break;
 case 'about': heading('Howdy, I’m ' + SITE.name + '.'); paragraph(result,SITE.bio); paragraph(result,'Based in ' + SITE.location + '.'); paragraph(result,'Certified: ' + SITE.certifications.join(', ')); paragraph(result,'Currently studying: ' + SITE.studying.join(', ') + '.'); break;
 case 'projects': heading('Things I’m building'); SITE.projects.forEach(project=>{const article=el('article'); const h=el('h3'); h.append(project.url ? link(project) : el('span',project.name)); article.append(h,el('p',project.description)); result.append(article);}); if(!SITE.projects.length) paragraph(result,'No projects listed yet. Check back soon.'); {const github=SITE.socials.find(item=>/^github$/i.test(item.name)); if(github){paragraph(result,'More code lives on GitHub:'); listing(result,[github]);}} break;
 case 'blog': {
   if(args.join(' ') === '--demo') {
     startPost();
     heading('Markdown reader');
     paragraph(result,'Preview only · not a published post','muted');
     trackPostOpened(SITE.markdownDemo,'demo');
     if(await renderPost(result,SITE.markdownDemo) && current()) startReading({slug:'markdown-demo',title:'Markdown reader'},result);
   } else if(args.length) {
     const query=args.join(' ');
     const post=SITE.posts.find(p=>p.slug===query);
     const matches=post?[post]:SITE.posts.filter(p=>p.date===query);
     if(matches.length===1) {
       startPost();
       heading(matches[0].title); paragraph(result,matches[0].date+' · '+matches[0].slug,'muted');
       trackPostOpened(matches[0],source==='selection'?'selection':post?'slug':'date');
       if(await renderPost(result,matches[0]) && current()) startReading(matches[0],result);
     } else if(matches.length>1) {
       heading('Posts from '+query);
       paragraph(result,'You can use blog <post-slug> or blog <date>.','muted');
       openBlogSelection(result,matches);
     } else { paragraph(result,'Post not found. Type blog to see available posts.','error'); track('post_not_found',{query_type:/^\d{4}-\d{2}-\d{2}$/.test(query)?'date':'slug'}); }
   } else {
     heading('Notes from the workbench');
     paragraph(result,'You can use blog <post-slug> or blog <date>.','muted');
     if(!SITE.posts.length) paragraph(result,'No posts published yet. Check back for notes on code, security, and things I’m learning.');
     else openBlogSelection(result,SITE.posts);
     paragraph(result,'Type blog --demo to preview Markdown formatting and callouts.','muted');
   }
   break;
 }
 case 'socials': heading('Around the internet');if(SITE.socials.length)listing(result,SITE.socials);else paragraph(result,'No links listed yet. Check back soon.');break;
 case 'version': {
   heading('Build information');
   const status=el('p','Loading build information…','muted'); status.setAttribute('role','status'); result.append(status);
   try {
     const info=await loadVersion();
     // A newer command may have run meanwhile; still finish this entry unless it was cleared.
     if(entry.isConnected === false) return;
     status.remove(); renderVersion(result,info);
   } catch(error) {
     if(entry.isConnected === false) return;
     status.textContent='Build information is unavailable. Try the version command again.'; status.className='error';
   }
   break;
 }
 case 'funding': heading('Support the work');if(SITE.funding.length)listing(result,SITE.funding);else paragraph(result,'Funding links haven’t been added yet. For now, exploring my projects and sharing feedback is appreciated.'); break;
 case 'motd': heading('Message of the day');paragraph(result,'I build things, break things, and write about what I learn.');paragraph(result,'Make yourself at home. Type help to explore.');break;
 case 'theme': {
   const usage = 'Usage: theme system | latte | frappe | macchiato | mocha';
   const choice = args[0]?.toLowerCase();
   if (args.length && (args.length !== 1 || !window.terminalTheme.set(choice))) {
     paragraph(result, usage, 'error');
   } else {
     heading('Catppuccin theme');
     paragraph(result, 'Current: ' + window.terminalTheme.current() + ' · mode: ' + window.terminalTheme.preference());
     if(args.length) track('theme_changed',{preference:window.terminalTheme.preference()});
     paragraph(result, args.length ? (choice === 'system' ? 'Following your device’s light or dark mode.' : 'Theme saved for this browser. Type theme system to follow your device again.') : usage);
   }
   break;
 }
 case 'date': paragraph(result,new Date().toLocaleString(undefined,{dateStyle:'full',timeStyle:'short'}));break;
 case 'whoami': paragraph(result,'visitor · curious human exploring Adam’s corner of the internet.');break;
 default: {paragraph(result,'Command not found: ' + command,'error');const guess=closestCommand(name);paragraph(result,guess?'Did you mean ' + guess + '? Type help to see available commands.':'Type help to see available commands.');}
 }
 if(!current()) return;
 input.focus({preventScroll:true});
 if(readingPost) scrollToPost();
 else scrollToPrompt();
}
document.querySelector('#command-form').addEventListener('submit',e=>{e.preventDefault();return run(input.value);});
input.addEventListener('keydown',e=>{
 finishTyping();
 if(e.isComposing) return;
 if(blogSelection && (e.key==='ArrowUp' || e.key==='ArrowDown') && (!input.value.trim() || /^\d+$/.test(input.value.trim()))){
   e.preventDefault(); input.value='';
   highlightBlogChoice((blogSelection.index+(e.key==='ArrowDown'?1:-1)+blogSelection.choices.length)%blogSelection.choices.length);
   return;
 }
 if(e.key==='ArrowUp'){e.preventDefault();if(historyIndex===history.length)draft=input.value;historyIndex=Math.max(0,historyIndex-1);input.value=history[historyIndex]??draft;}
 if(e.key==='ArrowDown'){e.preventDefault();historyIndex=Math.min(history.length,historyIndex+1);input.value=historyIndex===history.length?draft:history[historyIndex];}
 if(e.key==='Tab'){e.preventDefault();const prefix=input.value.trimStart().toLowerCase();const choices=prefix.startsWith('theme ')?window.terminalTheme.options.map(t=>'theme '+t):Object.keys(commands);let matches=choices.filter(c=>c.startsWith(prefix));if(!matches.length&&!prefix.includes(' '))matches=Object.keys(aliases).filter(c=>c.startsWith(prefix));if(matches.length===1){input.value=matches[0];suggestions.textContent='';}else suggestions.textContent=matches.join('   ');}
 if(e.key==='l' && e.ctrlKey){e.preventDefault();clear();}
 if(e.key==='Escape'){closeBlogSelection();input.value='';suggestions.textContent='';}
});
input.addEventListener('input',event=>{
 suggestions.textContent='';revealTypedCharacters(event);
 if(blogSelection && !event.isComposing && /^\d+$/.test(input.value.trim())){
   const index=Number(input.value.trim())-1;
   if(index>=0 && index<blogSelection.choices.length) highlightBlogChoice(index);
 }
});
// Clicking unused terminal space returns focus without interrupting selection or links.
body.addEventListener('auxclick', trackLink);
body.addEventListener('click', e => {
 trackLink(e);
 if (!e.target.closest('a, button, input, label') && !window.getSelection()?.toString()) input.focus({preventScroll:true});
});
