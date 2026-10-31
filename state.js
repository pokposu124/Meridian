(function (root) {
  'use strict';
  const MAX_STOCKS = 9;
  const STORAGE_KEY = 'meridian.watchlists.v1';
  const SYMBOL_PATTERN = /^[A-Z0-9_]+:[A-Z0-9_.!^/\-]+$/;
  const catalog = [
    ['NASDAQ:NVDA','엔비디아','NVDA','NASDAQ','US','N','#79b632','#fff'],
    ['NASDAQ:AAPL','애플','AAPL','NASDAQ','US','A','#e2e6e9','#12191f'],
    ['NASDAQ:MSFT','마이크로소프트','MSFT','NASDAQ','US','M','#223d55','#9bc6e9'],
    ['NASDAQ:GOOGL','알파벳','GOOGL','NASDAQ','US','G','#254136','#98d3af'],
    ['NASDAQ:AMZN','아마존','AMZN','NASDAQ','US','a','#3e3324','#e6bd7a'],
    ['NASDAQ:META','메타 플랫폼스','META','NASDAQ','US','∞','#213b57','#87b5f5'],
    ['NASDAQ:TSLA','테슬라','TSLA','NASDAQ','US','T','#47262c','#e6a0a8'],
    ['NASDAQ:AVGO','브로드컴','AVGO','NASDAQ','US','B','#4c2832','#e5a4b7'],
    ['NYSE:TSM','TSMC ADR','TSM','NYSE','US','T','#333a43','#bbcbd7'],
    ['NYSE:BRK.B','버크셔 해서웨이 B','BRK.B','NYSE','US','B','#313d32','#b6cfb9'],
    ['NYSE:JPM','JP모건 체이스','JPM','NYSE','US','J','#303b44','#adc5d7'],
    ['NYSE:V','비자','V','NYSE','US','V','#293247','#a4b6e1'],
    ['NYSE:WMT','월마트','WMT','NYSE','US','W','#283c4b','#92c5e8'],
    ['NYSE:LLY','일라이 릴리','LLY','NYSE','US','L','#482f35','#e5acb8'],
    ['NYSE:XOM','엑슨모빌','XOM','NYSE','US','X','#46302d','#dfb3a9'],
    ['NASDAQ:NFLX','넷플릭스','NFLX','NASDAQ','US','N','#4b292e','#ef9ca5'],
    ['NASDAQ:AMD','AMD','AMD','NASDAQ','US','A','#383d42','#c9d0d5'],
    ['NASDAQ:COST','코스트코','COST','NASDAQ','US','C','#42313a','#dcb6c9'],
    ['NASDAQ:PLTR','팔란티어','PLTR','NASDAQ','US','P','#354036','#bad0bb'],
    ['NYSE:KO','코카콜라','KO','NYSE','US','K','#482a31','#e9a7b5'],
    ['NASDAQ:QQQ','인베스코 QQQ ETF','QQQ','NASDAQ','US','Q','#3c3149','#c1a9da'],
    ['AMEX:SPY','SPDR S&P 500 ETF','SPY','AMEX','US','S','#283e37','#9acdb9'],
    ['KRX:005930','삼성전자','005930','KRX','KR','S','#213c59','#8ebdf0'],
    ['KRX:000660','SK하이닉스','000660','KRX','KR','SK','#492b30','#e9a4ae'],
    ['KRX:005380','현대자동차','005380','KRX','KR','H','#273a4b','#a4c6e3'],
    ['KRX:035420','NAVER','035420','KRX','KR','N','#284b32','#92dfaa'],
    ['KRX:035720','카카오','035720','KRX','KR','K','#47422a','#dfd17f'],
    ['KRX:373220','LG에너지솔루션','373220','KRX','KR','LG','#492b3e','#dfa4ce'],
    ['KRX:105560','KB금융','105560','KRX','KR','KB','#48402b','#dac38a'],
    ['KRX:068270','셀트리온','068270','KRX','KR','C','#284331','#9ad1a8'],
    ['KRX:000270','기아','000270','KRX','KR','K','#3f3031','#dbb1b4'],
    ['KRX:207940','삼성바이오로직스','207940','KRX','KR','S','#2b3b52','#a1bbe2'],
    ['TSE:7203','도요타자동차','7203','TSE','ASIA','T','#452e33','#dba2b0'],
    ['TSE:6758','소니그룹','6758','TSE','ASIA','S','#2b3643','#a5bfdf'],
    ['TSE:9984','소프트뱅크그룹','9984','TSE','ASIA','S','#38414a','#c8d8e4'],
    ['TSE:8035','도쿄일렉트론','8035','TSE','ASIA','T','#2b3e45','#a3c8d5'],
    ['HKEX:700','텐센트','700','HKEX','ASIA','T','#29435b','#a0c7ed'],
    ['HKEX:9988','알리바바','9988','HKEX','ASIA','a','#4b3b2b','#e9bf92'],
    ['HKEX:1211','BYD','1211','HKEX','ASIA','B','#452c30','#e5a3ad'],
    ['TWSE:2330','TSMC 대만','2330','TWSE','ASIA','T','#3b3e42','#ccd1d7'],
    ['NSE:RELIANCE','릴라이언스 인더스트리','RELIANCE','NSE','ASIA','R','#423d28','#dcd094'],
    ['NSE:TCS','타타 컨설턴시','TCS','NSE','ASIA','T','#3b3044','#cab0de'],
    ['XETR:SAP','SAP','SAP','XETR','EU','S','#253f56','#9cc7ee'],
    ['XETR:SIE','지멘스','SIE','XETR','EU','S','#28423f','#9cd3c8'],
    ['EURONEXT:ASML','ASML','ASML','EURONEXT','EU','A','#2f3650','#b0bce8'],
    ['EURONEXT:MC','LVMH','MC','EURONEXT','EU','L','#3e382b','#d2c08b'],
    ['EURONEXT:OR','로레알','OR','EURONEXT','EU','L','#44333e','#d9b0cd'],
    ['LSE:AZN','아스트라제네카','AZN','LSE','EU','A','#433243','#d7add6'],
    ['LSE:HSBA','HSBC','HSBA','LSE','EU','H','#4a3033','#dea3ab'],
    ['SIX:NESN','네슬레','NESN','SIX','EU','N','#3c3831','#d2c3ac'],
    ['TSX:SHOP','쇼피파이','SHOP','TSX','OTHER','S','#34482b','#b5d995'],
    ['ASX:BHP','BHP 그룹','BHP','ASX','OTHER','B','#483c30','#dabb9c'],
    ['BMFBOVESPA:PETR4','페트로브라스','PETR4','BMFBOVESPA','OTHER','P','#31452f','#afd1a5'],
    ['BITSTAMP:BTCUSD','비트코인 / 미국 달러','BTCUSD','BITSTAMP','OTHER','₿','#4a3a22','#e8c170'],
    ['COINBASE:ETHUSD','이더리움 / 미국 달러','ETHUSD','COINBASE','OTHER','E','#353a52','#bec8ef'],
    ['OANDA:XAUUSD','금 현물 / 미국 달러','XAUUSD','OANDA','OTHER','Au','#45402b','#e2cd89']
  ].map(([symbol,name,ticker,exchange,region,logo,bg,fg])=>({symbol,name,ticker,exchange,region,logo,bg,fg}));
  const bySymbol = new Map(catalog.map(stock=>[stock.symbol,stock]));
  function registerStocks(records){
    for(const record of Array.isArray(records)?records.slice(0,5000):[]){
      const symbol=record?.id||record?.symbol;
      if(!validSymbol(symbol))continue;
      const old=bySymbol.get(symbol),exchange=String(record.exchange||symbol.split(':')[0]);
      if(old){old.country=String(record.country||old.country||'');old.region=String(record.region||old.region||'OTHER');old.kind=String(record.kind||old.kind||'stock');continue;}
      const stock={symbol,name:String(record.name||symbol.split(':')[1]).slice(0,100),ticker:String(record.ticker||symbol.split(':')[1]),exchange,region:String(record.region||'OTHER'),country:String(record.country||''),kind:String(record.kind||'stock'),logo:exchange==='INDEX'?'↗':symbol.split(':')[1].slice(0,2),bg:'#2c3940',fg:'#bdcdd7'};
      catalog.push(stock);bySymbol.set(symbol,stock);
    }
  }
  function defaultState() { return {version:1,activeGroup:'tech',interval:'D',style:'1',columns:3,groups:[{id:'tech',name:'글로벌 테크',symbols:catalog.slice(0,9).map(s=>s.symbol)},{id:'korea',name:'한국 주식',symbols:['KRX:005930','KRX:000660','KRX:005380','KRX:035420','KRX:373220','KRX:105560']},{id:'global',name:'글로벌 리더',symbols:['TSE:7203','HKEX:700','EURONEXT:ASML','EURONEXT:MC','XETR:SAP','TWSE:2330']}]}; }
  function validSymbol(value) { return typeof value==='string' && value.length<=80 && SYMBOL_PATTERN.test(value); }
  function normalize(raw) {
    if(!raw || raw.version!==1 || !Array.isArray(raw.groups) || !raw.groups.length) return defaultState();
    const ids=new Set();
    const groups=raw.groups.filter(g=>g && typeof g.id==='string' && g.id.length<=100 && typeof g.name==='string' && g.name.trim() && Array.isArray(g.symbols)).filter(g=>{if(ids.has(g.id))return false;ids.add(g.id);return true;}).slice(0,30).map(g=>({id:g.id,name:g.name.trim().slice(0,24),symbols:[...new Set(g.symbols.filter(validSymbol))].slice(0,MAX_STOCKS)}));
    if(!groups.length)return defaultState();
    return {version:1,activeGroup:groups.some(g=>g.id===raw.activeGroup)?raw.activeGroup:groups[0].id,interval:['D','W','M'].includes(raw.interval)?raw.interval:'D',style:['1','2'].includes(raw.style)?raw.style:'1',columns:raw.columns===2?2:3,groups};
  }
  function stockInfo(symbol) { return bySymbol.get(symbol) || {symbol,name:symbol.split(':')[1],ticker:symbol.split(':')[1],exchange:symbol.split(':')[0],region:'OTHER',logo:symbol.split(':')[1].slice(0,2),bg:'#2c3940',fg:'#bdcdd7'}; }
  function addSymbol(state,symbol) {
    const group=state.groups.find(g=>g.id===state.activeGroup);
    if(!validSymbol(symbol))return 'invalid';
    if(group.symbols.includes(symbol))return 'duplicate';
    if(group.symbols.length>=MAX_STOCKS)return 'full';
    group.symbols.push(symbol);return 'added';
  }
  const api={MAX_STOCKS,STORAGE_KEY,catalog,defaultState,normalize,stockInfo,validSymbol,addSymbol,registerStocks};
  root.MeridianState=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
