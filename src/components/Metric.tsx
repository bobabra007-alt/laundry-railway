export default function Metric({label,value,hint,change,href,tone='',inverse=false}:{label:string;value:string;hint?:string;change?:number|null;href?:string;tone?:string;inverse?:boolean}){
 const content=<><div className="metric-label">{label}</div><div className={'kpi '+tone}>{value}</div><div className="metric-foot">{change!==undefined&&change!==null&&<span className={'trend '+((inverse?change<=0:change>=0)?'up':'down')}>{change>=0?'+':''}{change.toFixed(1)}%</span>}{hint&&<span className="sub">{hint}</span>}</div></>;
 return href?<a className="card metric" href={href}>{content}</a>:<div className="card metric">{content}</div>;
}
