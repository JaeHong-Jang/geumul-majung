import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} />; }
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} />; }
