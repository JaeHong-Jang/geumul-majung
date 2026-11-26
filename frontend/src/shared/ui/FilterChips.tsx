import type { ReactNode } from 'react';
export function FilterChips({value,onChange,options=[['','전체'],['51-29','폐금속'],['51-03','폐합성수지'],['51-28','폐지']],label='목록 필터',tabs=false}:{value:string;onChange:(value:string)=>void;options?:readonly (readonly [string,ReactNode])[];label?:string;tabs?:boolean}) {
 return <div className="filter-chips category-chips" role={tabs?'tablist':'group'} aria-label={label}>{options.map(([id,text])=><button type="button" role={tabs?'tab':undefined} aria-selected={tabs?value===id:undefined} key={id} aria-pressed={value===id} onClick={()=>onChange(id)}>{text}</button>)}</div>;
}
