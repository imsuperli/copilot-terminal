import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// 获取 root 容器
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// 使用 React 18 的 createRoot API
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
