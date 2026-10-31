(() => {
  'use strict';
  const S=window.MeridianState;
  const $=id=>document.getElementById(id);
  let storageWarning=false;
  let state;
  try { state=S.normalize(JSON.parse(localStorage.getItem(S.STORAGE_KEY))); } catch { state=S.defaultState(); storageWarning=true; }
  let region='all', editingGroup=false, toastTimer, tickerCleanup;
  const widgetCleanups=[];
  const intervalNames={D:'일봉',W:'주봉',M:'월봉'};
  const symbolUrl=symbol=>'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol);
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function currentGroup(){return state.groups.find(g=>g.id===state.activeGroup);}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
  function save(){try{localStorage.setItem(S.STORAGE_KEY,JSON.stringify(state));}catch{if(!storageWarning){toast('브라우저 저장 공간에 접근할 수 없어 이번 세션에서만 유지됩니다.');storageWarning=true;}}}
  function showDialog(id){if(!$(id).open)$(id).showModal();}
  function hideSidebar(){document.querySelector('.sidebar').classList.remove('open');$('mobile-menu').setAttribute('aria-expanded','false');}
  function selectGroup(id){if(id===state.activeGroup)return;state.activeGroup=id;save();render();hideSidebar();}
  function logo(stock){return `<span class="stock-logo" style="--logo-bg:${stock.bg};--logo-fg:${stock.fg}">${escape(stock.logo)}</span>`;}

  function renderNavigation(){
    $('side-groups').replaceChildren();$('group-tabs').replaceChildren();
    for(const group of state.groups){
      const active=group.id===state.activeGroup;
      const side=document.createElement('button');side.className='side-group'+(active?' active':'');side.setAttribute('aria-current',active?'page':'false');side.innerHTML=`<span class="group-dot"></span><span>${escape(group.name)}</span><span class="side-count">${group.symbols.length.toString().padStart(2,'0')}</span>`;side.onclick=()=>selectGroup(group.id);$('side-groups').append(side);
      const tab=document.createElement('button');tab.className='group-tab'+(active?' active':'');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(active));tab.setAttribute('aria-controls','chart-grid');tab.tabIndex=active?0:-1;tab.innerHTML=`${escape(group.name)} <small>${group.symbols.length}</small>`;tab.onclick=()=>selectGroup(group.id);tab.onkeydown=event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const index=state.groups.findIndex(g=>g.id===group.id);const next=event.key==='Home'?0:event.key==='End'?state.groups.length-1:(index+(event.key==='ArrowRight'?1:-1)+state.groups.length)%state.groups.length;selectGroup(state.groups[next].id);$('group-tabs').children[next].focus();};$('group-tabs').append(tab);
    }
    $('group-title').textContent=currentGroup().name;$('stock-count').textContent=`${currentGroup().symbols.length} / ${S.MAX_STOCKS}`;
  }
  function renderControls(){
    document.querySelectorAll('[data-interval]').forEach(btn=>{const active=btn.dataset.interval===state.interval;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-style]').forEach(btn=>{const active=btn.dataset.style===state.style;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
    $('grid-caption').textContent=`${intervalNames[state.interval]} · ${state.style==='1'?'캔들':'선'} 차트`;
    $('chart-grid').classList.toggle('wide',state.columns===2);
    [['grid-layout',3],['wide-layout',2]].forEach(([id,columns])=>{$(id).classList.toggle('selected',state.columns===columns);$(id).setAttribute('aria-pressed',String(state.columns===columns));});
  }

  function mountChart(host,symbol,cleanups=widgetCleanups){
    host.replaceChildren();
    const placeholder=document.createElement('div');placeholder.className='chart-placeholder';placeholder.innerHTML='<span class="loader"></span><span>시장 데이터 연결 중</span>';
    host.append(placeholder);
    const container=document.createElement('div');container.className='tradingview-widget-container';
    const target=document.createElement('div');target.className='tradingview-widget-container__widget';target.style.height='100%';target.style.width='100%';container.append(target);host.append(container);
    let settled=false,dead=false,timer;
    const fail=()=>{if(dead)return;settled=true;container.remove();placeholder.innerHTML=`<span class="external-error">시세 위젯을 불러오지 못했습니다.<br>네트워크 또는 외부 콘텐츠 차단 설정을 확인해 주세요.</span><a href="${symbolUrl(symbol)}" target="_blank" rel="noopener noreferrer">TradingView에서 차트 보기 ↗</a>`;clearTimeout(timer);};
    const observer=new MutationObserver(()=>{
      const iframe=container.querySelector('iframe');
      if(iframe){iframe.title=`${S.stockInfo(symbol).name} ${intervalNames[state.interval]} 차트`;iframe.addEventListener('load',()=>{if(dead)return;settled=true;placeholder.hidden=true;clearTimeout(timer);},{once:true});iframe.addEventListener('error',fail,{once:true});observer.disconnect();}
    });observer.observe(container,{childList:true,subtree:true});
    const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;script.textContent=JSON.stringify(S.chartConfig(symbol,state.interval,state.style));script.onerror=fail;container.append(script);
    timer=setTimeout(()=>{if(!settled&&!dead){placeholder.innerHTML=`<span>시세 연결이 지연되고 있습니다.</span><a href="${symbolUrl(symbol)}" target="_blank" rel="noopener noreferrer">원본 차트 확인 ↗</a>`;}},18000);
    cleanups.push(()=>{dead=true;clearTimeout(timer);observer.disconnect();script.onerror=null;});
  }
  function renderCharts(){
    widgetCleanups.splice(0).forEach(cleanup=>cleanup());
    const grid=$('chart-grid');grid.replaceChildren();
    currentGroup().symbols.forEach(symbol=>{
      const stock=S.stockInfo(symbol),card=document.createElement('article');card.className='chart-card';card.setAttribute('aria-label',stock.name+' 차트');
      card.innerHTML=`<div class="card-top">${logo(stock)}<div><div class="stock-name" title="${escape(stock.name)}">${escape(stock.name)}</div><div class="stock-meta"><span>${escape(stock.ticker)}</span><span>${escape(stock.exchange)}</span></div></div><div class="card-actions"><button class="icon-btn expand-chart" aria-label="${escape(stock.name)} 차트 확대" title="차트 확대">⛶</button><button class="icon-btn remove-stock" aria-label="${escape(stock.name)} 그룹에서 제거" title="그룹에서 제거">×</button></div></div><div class="chart-host"></div><div class="card-bottom"><span>${intervalNames[state.interval]} <span style="color:#3d525f">/</span> ${state.style==='1'?'CANDLE':'LINE'} <span style="color:#3d525f">·</span> UTC</span><a href="${symbolUrl(symbol)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(stock.name)} TradingView 원본 차트">TradingView ↗</a></div>`;
      card.querySelector('.remove-stock').onclick=()=>{currentGroup().symbols=currentGroup().symbols.filter(item=>item!==symbol);save();render();toast(`${stock.name} 종목을 제거했습니다.`);};
      card.querySelector('.expand-chart').onclick=()=>expandChart(symbol);
      grid.append(card);mountChart(card.querySelector('.chart-host'),symbol);
    });
    if(currentGroup().symbols.length<S.MAX_STOCKS){const add=document.createElement('button');add.className='add-card';add.innerHTML=`<span class="add-card-icon">+</span><strong>관심 종목 추가</strong><small>최대 9개 · ${S.MAX_STOCKS-currentGroup().symbols.length}개 더 추가할 수 있어요</small>`;add.onclick=openStockDialog;grid.append(add);}
    $('load-time').textContent='요청 '+new Date().toLocaleTimeString('en-GB',{timeZone:'UTC'})+' UTC';
  }
  function render(){renderNavigation();renderControls();renderCharts();}

  function mountTicker(){
    if(tickerCleanup)tickerCleanup();
    $('ticker-fallback').hidden=true;
    const host=$('ticker');host.replaceChildren();
    const loading=document.createElement('div');loading.className='ticker-loading';loading.textContent='S&P 500 · 나스닥 100 · 다우존스 · KOSPI · 니케이 225 · 항셍 · DAX · 비트코인 · 금 — 시세 연결 중…';host.append(loading);
    const container=document.createElement('div');container.className='tradingview-widget-container';const target=document.createElement('div');target.className='tradingview-widget-container__widget';container.append(target);host.append(container);
    const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';script.async=true;
    script.textContent=JSON.stringify({symbols:[{proName:'SP:SPX',title:'S&P 500'},{proName:'NASDAQ:NDX',title:'나스닥 100'},{proName:'DJ:DJI',title:'다우존스'},{proName:'KRX:KOSPI',title:'KOSPI'},{proName:'TVC:NI225',title:'니케이 225'},{proName:'HSI:HSI',title:'항셍'},{proName:'XETR:DAX',title:'DAX'},{proName:'TVC:UKX',title:'FTSE 100'},{proName:'BITSTAMP:BTCUSD',title:'비트코인 / USD'},{proName:'OANDA:XAUUSD',title:'금 현물 / USD'}],showSymbolLogo:false,isTransparent:true,displayMode:'adaptive',colorTheme:'dark',locale:'kr'});
    let settled=false;
    const fail=()=>{loading.textContent='S&P 500 · 나스닥 100 · 다우존스 · KOSPI · 니케이 225 · 항셍 · DAX · 비트코인 · 금';$('ticker-fallback').hidden=false;};
    const observer=new MutationObserver(()=>{const iframe=container.querySelector('iframe');if(iframe){iframe.title='세계 주요 지수, 비트코인 및 금 시세';iframe.addEventListener('load',()=>{settled=true;loading.hidden=true;clearTimeout(timer);},{once:true});iframe.addEventListener('error',fail,{once:true});observer.disconnect();}});observer.observe(container,{childList:true,subtree:true});
    script.onerror=fail;container.append(script);const timer=setTimeout(()=>{if(!settled)fail();},18000);
    tickerCleanup=()=>{clearTimeout(timer);observer.disconnect();script.onerror=null;};
  }

  function openStockDialog(){region='all';$('symbol-search').value='';$('custom-symbol').value='';document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('selected',b.dataset.region==='all'));renderSearch();showDialog('stock-dialog');$('symbol-search').focus();}
  function renderSearch(){
    const query=$('symbol-search').value.trim().toLowerCase();
    const matches=S.catalog.filter(stock=>(region==='all'||stock.region===region)&&[stock.name,stock.ticker,stock.symbol].some(value=>value.toLowerCase().includes(query)));
    const host=$('search-results');host.replaceChildren();
    matches.forEach(stock=>{const row=document.createElement('div');row.className='result-row';const exists=currentGroup().symbols.includes(stock.symbol),full=currentGroup().symbols.length>=S.MAX_STOCKS;row.innerHTML=`${logo(stock)}<div><div class="stock-name">${escape(stock.name)}</div><div class="stock-meta"><span>${escape(stock.ticker)}</span><span>${escape(stock.exchange)}</span></div></div><button class="result-add" ${exists||full?'disabled':''} aria-label="${escape(stock.name)} 추가">${exists?'추가됨':full?'9/9':'+'}</button>`;row.querySelector('button').onclick=()=>addStock(stock.symbol);host.append(row);});
    if(!matches.length){const empty=document.createElement('p');empty.className='empty-message';empty.textContent='검색 목록에 없습니다. 아래에 거래소:티커를 입력하거나, 종목 차트의 TradingView 링크에서 심볼을 확인하세요.';host.append(empty);}
    if(S.validSymbol($('symbol-search').value.trim().toUpperCase()))$('custom-symbol').value=$('symbol-search').value.trim().toUpperCase();
    $('custom-symbol-form').querySelector('button').disabled=currentGroup().symbols.length>=S.MAX_STOCKS;
    $('stock-dialog').querySelector('.modal-copy').textContent=`${currentGroup().name} · ${currentGroup().symbols.length} / 9개. ${currentGroup().symbols.length>=9?'기존 종목을 제거하면 새 종목을 추가할 수 있습니다.':'전 세계 거래소의 종목을 추가하세요.'}`;
  }
  function addStock(symbol){
    const result=S.addSymbol(state,symbol.trim().toUpperCase());
    const messages={invalid:'거래소:티커 형식으로 입력해 주세요.',duplicate:'이미 그룹에 있는 종목입니다.',full:'한 그룹에는 최대 9개 종목을 담을 수 있습니다.'};
    if(result!=='added'){toast(messages[result]);return;}
    save();render();renderSearch();$('custom-symbol').value='';toast(S.stockInfo(symbol.trim().toUpperCase()).name+' 종목을 추가했습니다.');
  }

  function openGroupDialog(edit=false){editingGroup=edit;$('group-dialog-title').textContent=edit?'그룹 수정':'새 그룹 만들기';$('group-name').value=edit?currentGroup().name:'';$('delete-group').hidden=!edit||state.groups.length===1;$('delete-confirm').hidden=true;showDialog('group-dialog');$('group-name').focus();}
  $('group-form').onsubmit=event=>{event.preventDefault();const name=$('group-name').value.trim();if(!name){$('group-name').setCustomValidity('그룹 이름을 입력해 주세요.');$('group-name').reportValidity();return;}$('group-name').setCustomValidity('');if(state.groups.some(group=>group.name===name&&(!editingGroup||group.id!==state.activeGroup))){toast('같은 이름의 그룹이 있습니다.');return;}if(editingGroup){currentGroup().name=name;}else{if(state.groups.length>=30){toast('그룹은 최대 30개까지 만들 수 있습니다.');return;}const id=globalThis.crypto?.randomUUID?.()||'g-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);state.groups.push({id,name,symbols:[]});state.activeGroup=id;}save();render();$('group-dialog').close();toast(editingGroup?'그룹 이름을 변경했습니다.':'새 그룹을 만들었습니다.');};
  $('group-name').oninput=()=>{$('group-name').setCustomValidity('');};
  $('delete-group').onclick=()=>{$('delete-confirm').hidden=false;};$('cancel-delete-group').onclick=()=>{$('delete-confirm').hidden=true;};
  $('confirm-delete-group').onclick=()=>{if(state.groups.length<=1)return;state.groups=state.groups.filter(g=>g.id!==state.activeGroup);state.activeGroup=state.groups[0].id;save();render();$('group-dialog').close();toast('그룹을 삭제했습니다.');};
  let expandedCleanups=[];
  function expandChart(symbol){$('expanded-title').textContent=S.stockInfo(symbol).name+' · '+intervalNames[state.interval];showDialog('expanded-dialog');mountChart($('expanded-chart'),symbol,expandedCleanups);}
  $('expanded-dialog').addEventListener('close',()=>{expandedCleanups.splice(0).forEach(fn=>fn());$('expanded-chart').replaceChildren();});
  document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
  ['create-group','side-add-group','tab-add-group'].forEach(id=>$(id).onclick=()=>openGroupDialog());
  $('edit-group').onclick=()=>openGroupDialog(true);
  ['data-info','footer-info'].forEach(id=>$(id).onclick=()=>showDialog('info-dialog'));
  ['add-stock','top-search'].forEach(id=>$(id).onclick=openStockDialog);
  $('symbol-search').oninput=renderSearch;
  $('region-filters').onclick=event=>{const button=event.target.closest('[data-region]');if(!button)return;region=button.dataset.region;document.querySelectorAll('[data-region]').forEach(btn=>btn.classList.toggle('selected',btn===button));renderSearch();};
  $('custom-symbol').oninput=()=>{$('custom-symbol').value=$('custom-symbol').value.toUpperCase();};
  $('custom-symbol-form').onsubmit=event=>{event.preventDefault();addStock($('custom-symbol').value);};
  $('interval-controls').onclick=event=>{const button=event.target.closest('[data-interval]');if(!button||state.interval===button.dataset.interval)return;state.interval=button.dataset.interval;save();renderControls();renderCharts();};
  $('style-controls').onclick=event=>{const button=event.target.closest('[data-style]');if(!button||state.style===button.dataset.style)return;state.style=button.dataset.style;save();renderControls();renderCharts();};
  [['grid-layout',3],['wide-layout',2]].forEach(([id,columns])=>$(id).onclick=()=>{state.columns=columns;save();renderControls();});
  $('refresh').onclick=()=>{renderCharts();mountTicker();toast('최신 시장 데이터 연결을 다시 요청했습니다.');};
  $('retry-ticker').onclick=mountTicker;
  $('mobile-menu').onclick=()=>{const open=document.querySelector('.sidebar').classList.toggle('open');$('mobile-menu').setAttribute('aria-expanded',String(open));};
  $('nav-dashboard').onclick=()=>{hideSidebar();window.scrollTo({top:0,behavior:'smooth'});};
  document.addEventListener('click',event=>{if(!event.target.closest('.sidebar')&&!event.target.closest('#mobile-menu'))hideSidebar();});
  document.addEventListener('keydown',event=>{const editable=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable;if(editable||document.querySelector('dialog[open]'))return;if(event.key==='/'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();openStockDialog();}if((event.metaKey||event.ctrlKey)&&event.key==='1'){event.preventDefault();$('main').scrollIntoView({behavior:'smooth'});}});
  window.addEventListener('storage',event=>{if(event.key!==S.STORAGE_KEY||!event.newValue)return;try{state=S.normalize(JSON.parse(event.newValue));document.querySelectorAll('dialog[open]').forEach(d=>d.close());render();toast('다른 탭에서 변경한 그룹을 반영했습니다.');}catch{}});
  function updateClock(){$('clock').textContent=new Date().toLocaleTimeString('en-GB',{timeZone:'UTC'});}
  updateClock();setInterval(updateClock,1000);render();mountTicker();
  if(storageWarning)toast('브라우저 저장 데이터에 접근할 수 없어 기본 그룹을 표시합니다.');
})();
