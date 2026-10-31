import type {ReactNode} from 'react';
import './globals.css';
export const metadata={title:"Reading list integration test"};
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body>{children}<footer style={{padding:24,fontFamily:'system-ui',fontSize:12}}><a href={"http://localhost:3000/buy/74f2a33f-2861-45e4-87ee-e6c5638d2d09"}>Support this project · test checkout</a> · Built with AiFundMe</footer></body></html>}