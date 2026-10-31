(function(root){
  'use strict';
  const INTERVALS={D:'1day',W:'1week',M:'1month'};
  const BENCHMARKS=[['GSPC','S&P 500','USD','United States'],['IXIC','나스닥 종합','USD','United States'],['DJI','다우존스','USD','United States'],['KS11','KOSPI','KRW','South Korea'],['N225','니케이 225','JPY','Japan'],['HSI','항셍','HKD','Hong Kong'],['GDAXI','DAX','EUR','Germany'],['FTSE','FTSE 100','GBP','United Kingdom'],['BTC/USD','비트코인','USD',''],['XAU/USD','금 현물 / oz','USD','']].map(([symbol,name,currency,country])=>({symbol,name,currency,country,type:symbol.includes('/')?'':'Index'}));
  function numeric(value){return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;}
  function normalizeBars(values){
    const dates=new Map();
    for(const row of Array.isArray(values)?values:[]){
      const date=String(row.datetime||'');if(!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(date))continue;
      const time=Date.parse(date.includes(' ')?date.replace(' ','T')+'Z':date+'T00:00:00Z');
      if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date.slice(0,10))continue;
      const open=numeric(row.open),high=numeric(row.high),low=numeric(row.low),close=numeric(row.close),volume=numeric(row.volume);
      if(!Number.isFinite(time)||[open,high,low,close].some(n=>n===null)||low<=0||high<Math.max(open,close)||low>Math.min(open,close))continue;
      dates.set(time,{time,date:date.slice(0,10),open,high,low,close,volume:volume!==null&&volume>=0?volume:0});
    }
    return [...dates.values()].sort((a,b)=>a.time-b.time);
  }
  function providerSymbol(symbol){
    const split=symbol.indexOf(':'),exchange=symbol.slice(0,split),ticker=symbol.slice(split+1);
    if(['BITSTAMP','COINBASE'].includes(exchange)){return {symbol:ticker==='BTCUSD'?'BTC/USD':ticker==='ETHUSD'?'ETH/USD':ticker};}
    if(exchange==='OANDA'&&ticker==='XAUUSD')return {symbol:'XAU/USD'};
    const mapped={TSE:'JPX',EURONEXT:'Euronext',AMEX:'NYSE',BMFBOVESPA:'Bovespa'}[exchange]||exchange;
    const result={symbol:ticker,exchange:mapped};
    if(exchange==='EURONEXT')result.country=ticker==='ASML'?'Netherlands':'France';
    if(exchange==='AMEX'&&ticker==='SPY'){delete result.exchange;result.mic_code='ARCX';}
    return result;
  }
  function normalizeQuote(data){
    const price=numeric(data.close),previous=numeric(data.previous_close);
    if(price===null||price<=0)throw new Error('표시할 시세가 없습니다.');
    const change=previous!==null&&previous>0?price-previous:numeric(data.change);
    const percent=previous!==null&&previous>0?(price-previous)/previous*100:numeric(data.percent_change);
    return {price,change,percent,currency:String(data.currency||''),date:String(data.datetime||''),timestamp:numeric(data.timestamp),open:typeof data.is_market_open==='boolean'?data.is_market_open:null};
  }
  function formatPrice(value){return Number.isFinite(value)?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(value)<10?4:2}).format(value):'—';}
  function errorMessage(code){return ({401:'API 키 인증에 실패했습니다. 연결 설정을 확인해 주세요.',403:'현재 요금제에 이 시장의 데이터 접근 권한이 없습니다.',404:'제공업체에서 종목을 찾지 못했습니다. 거래소와 심볼을 확인해 주세요.',429:'API 호출 한도에 도달했습니다. 잠시 후 새로고침해 주세요.'})[code]||'데이터를 가져오지 못했습니다. 종목 지원 여부와 연결을 확인해 주세요.';}
  class Client{
    constructor({fetcher=root.fetch?.bind(root),now=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){this.fetcher=fetcher;this.now=now;this.schedule=schedule;this.cancel=cancel;this.apiKey='';this.rpm=8;this.queue=[];this.sent=[];this.cache=new Map();this.active=null;this.timer=null;this.pauseUntil=0;this.generation=0;}
    configure(key,rpm=8){this.generation++;this.apiKey=String(key).trim();this.rpm=Math.max(1,Math.min(1000,Number(rpm)||8));this.cache.clear();this.active?.controller.abort();for(const job of this.queue.splice(0))job.reject(new DOMException('Cancelled','AbortError'));this.cancel(this.timer);this.timer=null;this.drain();}
    get connected(){return Boolean(this.apiKey);}
    clearCache(){this.cache.clear();}
    request(endpoint,params,{signal,onStatus,ttl=300000}={}){
      if(!this.connected)return Promise.reject(new Error('시세 데이터 연결이 필요합니다.'));
      if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
      const cacheKey=endpoint+'?'+new URLSearchParams(params).toString(),cached=this.cache.get(cacheKey);
      if(cached&&this.now()-cached.at<ttl)return Promise.resolve(cached.data);
      return new Promise((resolve,reject)=>{this.queue.push({endpoint,params,signal,onStatus,cacheKey,ttl,resolve,reject,generation:this.generation});this.drain();});
    }
    drain(){
      this.cancel(this.timer);this.timer=null;
      this.queue=this.queue.filter(job=>{if(job.signal?.aborted){job.reject(new DOMException('Cancelled','AbortError'));return false;}return true;});
      if(!this.queue.length||this.active)return;
      const now=this.now();this.sent=this.sent.filter(t=>now-t<61000);
      const wait=Math.max(0,this.pauseUntil-now,this.sent.length>=this.rpm?this.sent[0]+61000-now:0);
      this.queue.forEach((job,i)=>job.onStatus?.(wait>0?`호출 한도 대기 · 약 ${Math.ceil(wait/1000)}초 · ${i+1}번째`:`시세 요청 대기 · ${i+1}번째`));
      if(wait>0){this.timer=this.schedule(()=>this.drain(),Math.min(wait,1000));return;}
      const job=this.queue.shift(),controller=new AbortController();this.active={controller};this.sent.push(now);job.onStatus?.('가격 데이터 수신 중…');
      const onAbort=()=>controller.abort();job.signal?.addEventListener('abort',onAbort,{once:true});
      const timeout=this.schedule(()=>controller.abort(),20000);
      const url='https://api.twelvedata.com/'+job.endpoint+'?'+new URLSearchParams(job.params);
      Promise.resolve().then(()=>this.fetcher(url,{headers:{Authorization:'apikey '+this.apiKey},signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})).then(async response=>{
        let data;try{data=await response.json();}catch{throw new Error('시세 서버의 응답을 해석할 수 없습니다.');}
        const code=Number(data.code)||response.status;
        if(!response.ok||data.status==='error'){if(code===429)this.pauseUntil=this.now()+61000;throw new Error(errorMessage(code));}
        if(job.generation!==this.generation||job.signal?.aborted)throw new DOMException('Cancelled','AbortError');
        this.cache.set(job.cacheKey,{data,at:this.now()});job.resolve(data);
      }).catch(error=>{if(job.signal?.aborted||job.generation!==this.generation)job.reject(new DOMException('Cancelled','AbortError'));else job.reject(new Error(error.name==='AbortError'?'시세 응답 시간이 초과되었습니다.':error instanceof TypeError?'네트워크 또는 브라우저의 API 연결을 확인해 주세요.':error.message));}).finally(()=>{this.cancel(timeout);job.signal?.removeEventListener('abort',onAbort);this.active=null;this.drain();});
    }
    async series(symbol,interval,options){const data=await this.request('time_series',{...providerSymbol(symbol),interval:INTERVALS[interval]||'1day',outputsize:180,timezone:'UTC',order:'ASC'},options);const bars=normalizeBars(data.values);if(!bars.length)throw new Error('이 종목의 유효한 가격 이력이 없습니다.');return {bars,currency:String(data.meta?.currency||''),exchange:String(data.meta?.exchange||''),receivedAt:this.now()};}
    async quote(item,options){const params={symbol:item.symbol,timezone:'UTC'};if(item.type)params.type=item.type;if(item.country)params.country=item.country;const data=await this.request('quote',params,{...options,ttl:60000});if(item.type==='Index'&&data.type&&String(data.type).toLowerCase()!=='index')throw new Error('지수 유형이 일치하지 않아 시세를 표시하지 않습니다.');return normalizeQuote(data);}
  }
  function visibleRange(total,count,end){const size=Math.min(total,Math.max(Math.min(12,total),Math.round(count)));const right=Math.min(total,Math.max(size,Math.round(end)));return {start:right-size,end:right,count:size};}
  function geometry(bars,width,height){const left=9,right=Math.max(75,width-64),top=12,bottom=Math.max(80,height-52),volumeBottom=height-23;const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high)),pad=Math.max((high-low)*.1,high*.002);const min=low-pad,max=high+pad;return {left,right,top,bottom,volumeBottom,min,max,x:i=>left+(i+.5)*(right-left)/bars.length,y:p=>bottom-(p-min)/(max-min)*(bottom-top),step:(right-left)/bars.length};}
  let chartId=0;
  function mountNativeChart(host,{bars,currency='',style='1',label='가격 차트'}){
    let count=Math.min(65,bars.length),end=bars.length,hover=-1,drag=null,disposed=false;
    const id='native-'+(++chartId);
    host.innerHTML='<div class="native-summary"><strong></strong><span></span><small></small></div><div class="native-legend"></div><svg class="native-svg" tabindex="0" role="img"></svg><div class="native-source"></div>';
    const summary=host.querySelector('.native-summary'),legend=host.querySelector('.native-legend'),svg=host.querySelector('svg'),source=host.querySelector('.native-source');
    svg.setAttribute('aria-label',label+' · 마우스 휠 또는 +/-로 확대·축소, 좌우 키로 이동, Home으로 최근 구간');
    const last=bars.at(-1),prev=bars.at(-2),change=prev?(last.close-prev.close)/prev.close*100:null;
    summary.querySelector('strong').textContent=formatPrice(last.close);summary.querySelector('span').textContent=change===null?'':`${change>=0?'+':''}${change.toFixed(2)}%`;summary.querySelector('span').className=change===null?'':change>=0?'up':'down';summary.querySelector('small').textContent=currency;
    source.textContent='마지막 봉 '+last.date+' · Twelve Data · 휠로 확대 / 드래그로 이동';
    function draw(){
      if(disposed)return;const width=Math.max(180,host.clientWidth||360),height=Math.max(110,(host.clientHeight||231)-76),range=visibleRange(bars.length,count,end),view=bars.slice(range.start,range.end);count=range.count;end=range.end;
      const g=geometry(view,width,height),maxVolume=Math.max(1,...view.map(b=>b.volume)),maxBar=Math.max(1,Math.min(9,g.step*.62));
      let content=`<defs><clipPath id="${id}"><rect x="${g.left}" y="${g.top}" width="${g.right-g.left}" height="${g.volumeBottom-g.top}"/></clipPath><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9f588" stop-opacity=".18"/><stop offset="1" stop-color="#d9f588" stop-opacity="0"/></linearGradient></defs>`;
      for(let i=0;i<4;i++){const y=g.top+(g.bottom-g.top)*i/3,value=g.max-(g.max-g.min)*i/3;content+=`<line x1="${g.left}" x2="${g.right}" y1="${y}" y2="${y}" stroke="#243039" stroke-dasharray="2 4"/><text x="${g.right+7}" y="${y+3}" fill="#718a99" font-size="8">${formatPrice(value)}</text>`;}
      content+=`<g clip-path="url(#${id})">`;
      view.forEach((bar,i)=>{const color=bar.close>=bar.open?'#63d5ac':'#f27c83',x=g.x(i),volumeHeight=bar.volume/maxVolume*18;content+=`<rect x="${x-maxBar/2}" y="${g.volumeBottom-volumeHeight}" width="${maxBar}" height="${volumeHeight}" fill="${color}" opacity=".26"/>`;if(style==='1')content+=`<line x1="${x}" x2="${x}" y1="${g.y(bar.high)}" y2="${g.y(bar.low)}" stroke="${color}"/><rect x="${x-maxBar/2}" y="${Math.min(g.y(bar.open),g.y(bar.close))}" width="${maxBar}" height="${Math.max(1,Math.abs(g.y(bar.open)-g.y(bar.close)))}" fill="${color}"/>`;});
      if(style==='2'){const points=view.map((bar,i)=>`${g.x(i)},${g.y(bar.close)}`).join(' ');content+=`<polygon points="${g.x(0)},${g.bottom} ${points} ${g.x(view.length-1)},${g.bottom}" fill="url(#${id}-fill)"/><polyline points="${points}" fill="none" stroke="#d9f588" stroke-width="1.6" stroke-linejoin="round"/>`;}
      content+='</g>';
      const latestY=g.y(last.close);if(latestY>=g.top&&latestY<=g.bottom)content+=`<line x1="${g.left}" x2="${g.right}" y1="${latestY}" y2="${latestY}" stroke="#92ab77" stroke-dasharray="3 4" opacity=".55"/>`;
      for(const i of [...new Set([0,Math.floor((view.length-1)/2),view.length-1])])content+=`<text x="${g.x(i)}" y="${height-6}" fill="#718a99" font-size="8" text-anchor="${i===0?'start':i===view.length-1?'end':'middle'}">${view[i].date.slice(2)}</text>`;
      const index=hover>=0?Math.min(view.length-1,hover):view.length-1,bar=view[index];
      if(hover>=0)content+=`<line x1="${g.x(index)}" x2="${g.x(index)}" y1="${g.top}" y2="${g.volumeBottom}" stroke="#a1b29b" stroke-dasharray="2 3"/><line x1="${g.left}" x2="${g.right}" y1="${g.y(bar.close)}" y2="${g.y(bar.close)}" stroke="#647969" stroke-dasharray="2 3"/><circle cx="${g.x(index)}" cy="${g.y(bar.close)}" r="3" fill="#d9f588"/>`;
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=content;
      legend.textContent=`${bar.date}  O ${formatPrice(bar.open)}  H ${formatPrice(bar.high)}  L ${formatPrice(bar.low)}  C ${formatPrice(bar.close)}`;
    }
    function zoom(factor){count=Math.max(Math.min(12,bars.length),Math.min(bars.length,Math.round(count*factor)));hover=-1;draw();}
    function move(event){const rect=svg.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*(host.clientWidth||360);if(drag){end=drag.end-Math.round((event.clientX-drag.x)/Math.max(1,rect.width)*count);hover=-1;}else{const range=visibleRange(bars.length,count,end),g=geometry(bars.slice(range.start,range.end),Math.max(180,host.clientWidth||360),Math.max(110,(host.clientHeight||231)-76));hover=Math.max(0,Math.min(count-1,Math.floor((x-g.left)/g.step)));}draw();}
    svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY>0?1.2:.8);},{passive:false});
    svg.addEventListener('pointermove',move);svg.addEventListener('pointerleave',()=>{if(!drag){hover=-1;draw();}});
    svg.addEventListener('pointerdown',event=>{drag={x:event.clientX,end};svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');});
    const endDrag=()=>{drag=null;svg.classList.remove('dragging');};svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
    svg.addEventListener('dblclick',()=>{count=Math.min(65,bars.length);end=bars.length;hover=-1;draw();});
    svg.addEventListener('keydown',event=>{if(!['+','=','-','ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();if(['+','='].includes(event.key))zoom(.8);else if(event.key==='-')zoom(1.2);else{end=event.key==='Home'?bars.length:end+(event.key==='ArrowLeft'?-5:5);hover=-1;draw();}});
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;observer?.observe(host);draw();return ()=>{disposed=true;observer?.disconnect();};
  }
  const api={BENCHMARKS,INTERVALS,numeric,normalizeBars,normalizeQuote,providerSymbol,formatPrice,errorMessage,Client,visibleRange,geometry,mountNativeChart};root.MeridianMarket=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
