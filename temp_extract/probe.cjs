const { WebSocket } = require("ws");
const ws = new WebSocket("ws://localhost:4097/v1/ws");
const t = setTimeout(()=>{console.log("TIMEOUT");process.exit(1)},6000);
ws.on("open",()=>{console.log("OPEN")});
ws.on("message",(d)=>{console.log("MSG",String(d));process.exit(0)});
ws.on("close",(c,r)=>{console.log("CLOSE",c,String(r));process.exit(0)});
ws.on("error",(e)=>{console.log("ERR",e.message);process.exit(1)});