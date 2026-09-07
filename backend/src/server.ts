import "dotenv/config"; import { app } from "./app.js"; import { prisma } from "./lib/prisma.js";
const port=Number(process.env.PORT??3333); prisma.$connect().then(()=>app.listen(port,()=>console.log(`API: http://localhost:${port}`))).catch(e=>{console.error(e);process.exit(1)});
