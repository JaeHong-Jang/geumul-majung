import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/base.css';
import './components/components.css';
import { startApp } from '../../shared/phoneFrame';

startApp(() => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
), '잔재미 판매자');
