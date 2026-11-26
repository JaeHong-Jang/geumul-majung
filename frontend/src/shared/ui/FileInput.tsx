import {useId,useRef,useState,type ComponentProps} from 'react';
import './forms.css';
type Props=Omit<ComponentProps<'input'>,'type'> & {label?:string};
export function FileInput({ref,onChange,label='사진 파일',id,...props}:Props){
 const generated=useId(),inputId=id??generated;
 const local=useRef<HTMLInputElement|null>(null),[names,setNames]=useState('');
 return <div className="field"><label htmlFor={inputId}>{label}</label><span className="file-input">
  <input {...props} id={inputId} ref={node=>{local.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}} type="file" className="file-input-native" onChange={e=>{const selected=Array.from(e.target.files??[]).map(f=>f.name).join(', ');onChange?.(e);setNames(selected);}}/>
  <button type="button" disabled={props.disabled} onClick={()=>local.current?.click()}>파일 선택</button><span>{names||'선택한 파일 없음'}</span>
 </span></div>;
}
