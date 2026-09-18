const { WebSocket } = require('ws');
const ws = new WebSocket('ws://localhost:4004/v1/ws?token=eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOiIwMWEwOTI4MC1lODRhLTczZTctOTA2YS1mNmE2ZDE1YTBiYWYiLCJyb2xlIjoib3duZXIiLCJzdWIiOiIwMWEwOTI4MC1lODQ5LTcxNDEtYTNmNS1mNmUxMmYzOTBjOTYiLCJpYXQiOjE3ODkxNjU0MjIsImV4cCI6MTc4OTE2NjMyMn0.30_Yi2Z_t42isjOtsxyXLPmYilrPfUwUngbD3fnAkRE');
const t = setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},8000);
ws.on('open',()=>{console.log('OPEN');ws.send(JSON.stringify({action:'subscribe'}))});
ws.on('message',(d)=>console.log('MSG',String(d)));
ws.on('close',(c,r)=>{console.log('CLOSE',c,String(r));clearTimeout(t);process.exit(0)});
ws.on('error',(e)=>{console.log('ERR',e.message);clearTimeout(t);process.exit(1)});