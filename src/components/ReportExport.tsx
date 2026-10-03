 'use client';
export function csvCell(value:unknown){const text=String(value??'');return '"'+(typeof value!=='number'&&/^[\s]*[=+@-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}
export default function ReportExport({rows}:{rows:(string|number)[][]}){
 return <button className="btn" type="button" onClick={()=>{const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='laundra-report.csv';a.click();URL.revokeObjectURL(url);}}>↓ Скачать CSV</button>;
}
