global.window = global; global.self = global;
global.navigator = { userAgent: 'Mozilla/5.0 (node)', onLine: true, product: 'ReactNative' };
global.location = { href: 'https://clerk.handlis.app/', origin: 'https://clerk.handlis.app', protocol: 'https:', host: 'clerk.handlis.app', hostname: 'clerk.handlis.app', pathname: '/', search: '' };
global.document = { createElement: () => ({ style:{}, setAttribute(){}, addEventListener(){} }), addEventListener(){}, removeEventListener(){}, cookie: '', documentElement:{}, head:{appendChild(){}}, body:{} };
global.addEventListener = () => {}; global.removeEventListener = () => {};
const store = {};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v)}, removeItem:k=>{delete store[k]}, clear:()=>{for(const k in store)delete store[k]} };
global.sessionStorage = global.localStorage;
(async () => {
  try {
    const h = require('@clerk/clerk-js/headless');
    console.log('headless keys:', Object.keys(h).join(', '));
    console.log('Clerk typeof:', typeof h.Clerk, '| HeadlessBrowserClerk:', typeof h.HeadlessBrowserClerk);
  } catch(e) { console.log('FEL:', e.message.slice(0,400)); }
})();
