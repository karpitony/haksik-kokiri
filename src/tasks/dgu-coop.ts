import { JSDOM } from 'jsdom';
import { RESTAURNT_URL } from '../constants';
import { MenuParser } from './menu-parser';
import { TextDecoder } from 'util';

import { fileURLToPath } from 'url';
import { promises as fs } from 'fs'; 
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function crawlDguCoop() {
  const url = RESTAURNT_URL.DGU_COOP;
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder('euc-kr');    // euc-kr 디코딩
  const html = decoder.decode(buffer);

  const dom = new JSDOM(html);
  const document = dom.window.document;
  const nodes = document.querySelector("#sdetail > table:nth-child(2)");

  const outputDir = path.join(__dirname, 'debug_output');
  await fs.mkdir(outputDir, { recursive: true });

  if (!nodes) {
    throw new Error('생협 데이터 불러오기 실패');
  }
  console.log('DGU Coop HTML fetched successfully.');
  
  await fs.writeFile(path.join(outputDir, 'fetched_table.html'), nodes.outerHTML);
  console.log('Target HTML table saved to debug_output/fetched_table.html');


  const parser = new MenuParser();
  const menuData = parser.parseMenu(nodes.outerHTML);

  await fs.writeFile(path.join(outputDir, 'parsed_menu.json'), JSON.stringify(menuData, null, 2));
  console.log('Parsed JSON data saved to debug_output/parsed_menu.json');

  console.log('DGU Coop meals parsed successfully. Total items:', menuData.length);
  console.log('DGU Coop meals parsed successfully:', menuData);
  return menuData;

}

crawlDguCoop();